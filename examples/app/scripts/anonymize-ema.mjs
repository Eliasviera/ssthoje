import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Anonimização dos dados da empresa real (EMA) preservando a estrutura de modelo:
// funções, riscos e ações permanecem intactos; identificadores de empresa e de pessoas são trocados.
//
// Modos:
//   --dry-run   (padrão) mostra o que mudaria, sem gravar nada
//   --apply     grava, depois de copiar os originais para o arquivo
//
// O PDF original NÃO é reescrito: ele é movido para o arquivo e o registro de documento é removido,
// porque não é possível anonimizar bytes de PDF de forma confiável.

const TENANT = "tenant-horizonte";
const COMPANY_ID = "9ce34336-c3c5-4598-a315-8ec457ca27ae";
const DATA = join(process.cwd(), "data");
const ARCHIVE = join(process.cwd(), "..", "..", "SST_HOJE_ARQUIVO_EMA_REAL_20261104");

const apply = process.argv.includes("--apply");

// ---------------------------------------------------------------- mapa de substituição
// Ordem importa: o mais específico antes do genérico.
// ATENÇÃO: nenhum substituto pode ter formato de CPF (000.000.000-00) nem colidir com
// outro dado. Os CEPs usam 5+3 dígitos (99000-000), que não é formato de CPF.
// O placeholder de CPF é "[removido]": não parece número e não colide com nada.
const MAP = [
  // Empresa
  [/EMA\s+MAXIBUS\s+INDUSTRIA\s+DE\s+CARROCERIAS\s+E\s+EQUIPAMENTOS\s+LTDA/gi,
    "METALÚRGICA HORIZONTE INDÚSTRIA E EQUIPAMENTOS LTDA"],
  [/EMA\s+MAXIBUS/gi, "METALÚRGICA HORIZONTE"],
  [/08\.961\.232\/0001-18/g, "00.000.000/0001-91"],
  [/08961232000118/g, "00000000000191"],
  // Endereço
  [/ALBERTO\s+PARENTI\s*-\s*1345/gi, "AVENIDA DAS INDÚSTRIAS - 1800"],
  [/ALBERTO\s+PARENTI/gi, "AVENIDA DAS INDÚSTRIAS"],
  [/SETE\s+DE\s+SETEMBRO/gi, "AVENIDA DAS INDÚSTRIAS"],
  [/DISTRITO\s+INDUSTRIAL/gi, "DISTRITO INDUSTRIAL NORTE"],
  [/99709-182/g, "99000-000"],
  [/99700-000/g, "99000-000"],
  [/\bERECHIM\b/gi, "PASSO FUNDO"],
  // Contato
  [/\(54\)\s*3321[-\s]?0650/g, "(54) 3311-0000"],
  [/\(54\)\s*3520[-\s]?6100/g, "(54) 3311-1111"],
  [/leila@ema\.ind\.br/gi, "contato@metalurgicahorizonte.exemplo"],
  [/deli@ema\.ind\.br/gi, "rh@metalurgicahorizonte.exemplo"],
  [/milena\.samoyedem@unimed-erechim\.com\.br/gi, "saude@metalurgicahorizonte.exemplo"],
  [/UNIMED\s+ERECHIM/gi, "PLANO DE SAÚDE EXEMPLO"],
  // Pessoas
  [/MILTON\s+LUIZ\s+PAGLIOSA/gi, "CARLOS EDUARDO ANDRADE"],
  [/MILTON\s+LUIS\s+PAGLIOSA/gi, "CARLOS EDUARDO ANDRADE"],
  [/ANEDIO\s+JOSE\s+MALESKI/gi, "RICARDO SOUZA NEVES"],
  [/ESTELA\s+MONICA\s+LIOTTO\s+PARCIANELLO/gi, "JULIANA FERREIRA LIMA"],
  [/CREA\s*220072735-6/g, "CREA 000000000-0"],
  [/MTE\/RS\s*0008612/g, "MTE/RS 0000000"],
  [/325\.763\.070-00/g, "[removido]"],
  [/372\.124\.270-04/g, "[removido]"],
];

const LEAKS = [
  ["nome da empresa", /EMA\s+MAXIBUS|MAXIBUS/i],
  ["CNPJ", /08961232000118|08\.961\.232\/0001-18/],
  ["cidade", /\bERECHIM\b/i],
  ["e-mail", /@ema\.ind\.br|unimed-erechim/i],
  ["telefone", /3321[-\s]?0650|3520[-\s]?6100/],
  ["pessoas", /MILTON|PAGLIOSA|ANEDIO|MALESKI|ESTELA|PARCIANELLO/i],
  ["CPF", /325\.763\.070-00|372\.124\.270-04/],
  ["endereço", /ALBERTO\s+PARENTI|SETE\s+DE\s+SETEMBRO|99709-182|99700-000/i],
];

function anonymize(text) {
  let out = text;
  for (const [pattern, replacement] of MAP) out = out.replace(pattern, replacement);
  return out;
}

function check(text, label) {
  const found = [];
  for (const [name, pattern] of LEAKS) {
    const matches = text.match(pattern);
    if (matches) found.push(`${name} (${matches.length})`);
  }
  if (found.length) {
    console.log(`  ✗ ${label}: ainda contém ${found.join(", ")}`);
    return false;
  }
  return true;
}

// Campos de empresa que devem ser reescritos por serem dados factuais dela.
function anonymizeCompanyFields(fields) {
  const updated = { ...fields };
  const set = (key, value) => {
    if (updated[key]?.length) updated[key] = updated[key].map((entry) => ({ ...entry, value }));
  };
  set("Razao Social", "METALÚRGICA HORIZONTE INDÚSTRIA E EQUIPAMENTOS LTDA - CNPJ: 00.000.000/0001-91");
  set("Endereço", "AVENIDA DAS INDÚSTRIAS - 1800");
  set("Bairro", "DISTRITO INDUSTRIAL NORTE");
  set("Cidade", "PASSO FUNDO UF: RS CEP: 99000-000");
  set("Telefone", "(54) 3311-0000");
  set("Email", "contato@metalurgicahorizonte.exemplo;rh@metalurgicahorizonte.exemplo");
  return updated;
}

// ---------------------------------------------------------------- inventário
const pgrDir = join(DATA, "pgr-digitalization", TENANT, COMPANY_ID);
const pgrFiles = existsSync(pgrDir) ? readdirSync(pgrDir).filter((f) => f.endsWith(".json")) : [];
const documentFilesDir = join(DATA, "document-files", TENANT);

console.log(`Anonimização da EMA — modo ${apply ? "GRAVAÇÃO" : "simulação (dry-run)"}\n`);
let failures = 0;

for (const file of pgrFiles) {
  const path = join(pgrDir, file);
  const original = readFileSync(path, "utf8");
  let next = anonymize(original);

  // Remove o texto bruto das páginas: é o que carrega o documento inteiro e os nomes.
  if (/(source|imported)-/.test(file)) {
    try {
      const parsed = JSON.parse(next);
      if (Array.isArray(parsed.pages)) {
        const removed = parsed.pages.length;
        delete parsed.pages;
        if (parsed.companyFields) parsed.companyFields = anonymizeCompanyFields(parsed.companyFields);
        next = JSON.stringify(parsed, null, 2);
        console.log(`· ${file}: ${removed} páginas de texto bruto removidas, campos da empresa reescritos`);
      }
    } catch {
      console.log(`· ${file}: não é JSON válido, mantido apenas com substituição de texto`);
    }
  }

  const ok = check(next, file);
  if (!ok) failures++;
  if (apply && ok) {
    mkdirSync(ARCHIVE, { recursive: true });
    const backup = join(ARCHIVE, `pgr-${file}`);
    if (!existsSync(backup)) copyFileSync(path, backup);
    writeFileSync(path, next);
  }
  const before = (original.length / 1024).toFixed(0);
  const after = (next.length / 1024).toFixed(0);
  console.log(`  ${ok ? "✓" : "✗"} ${file}: ${before} KB → ${after} KB (sha original ${createHash("sha256").update(original).digest("hex").slice(0, 10)}…)\n`);
}

// JSONs de cadastro
for (const file of ["clients.json", "documents.json"]) {
  const path = join(DATA, file);
  const original = readFileSync(path, "utf8");
  let next = anonymize(original);

  if (file === "documents.json") {
    // O registro do PDF original sai: o arquivo não pode ser anonimizado.
    const docs = JSON.parse(next);
    const kept = docs.filter((doc) => doc.companyId !== COMPANY_ID);
    if (docs.length !== kept.length) {
      console.log(`· ${file}: ${docs.length - kept.length} registro(s) de documento da empresa removido(s)`);
      next = JSON.stringify(kept, null, 2);
    }
  }

  const ok = check(next, file);
  if (!ok) failures++;
  if (apply) {
    mkdirSync(ARCHIVE, { recursive: true });
    const backup = join(ARCHIVE, file);
    if (!existsSync(backup)) copyFileSync(path, backup);
    writeFileSync(path, next);
  }
  console.log(`  ${ok ? "✓" : "✗"} ${file}\n`);
}

// Auditoria: reescreve somente as linhas que citam a empresa
{
  const path = join(DATA, "audit-log.jsonl");
  const original = readFileSync(path, "utf8");
  const lines = original.split("\n");
  let changed = 0;
  const next = lines.map((line) => {
    if (!line.includes(COMPANY_ID) && !/MAXIBUS|Erechim/i.test(line)) return line;
    changed++;
    return anonymize(line);
  }).join("\n");
  const ok = check(next, "audit-log.jsonl");
  if (!ok) failures++;
  if (apply) {
    mkdirSync(ARCHIVE, { recursive: true });
    const backup = join(ARCHIVE, "audit-log.jsonl");
    if (!existsSync(backup)) copyFileSync(path, backup);
    writeFileSync(path, next);
  }
  console.log(`  ${ok ? "✓" : "✗"} audit-log.jsonl: ${changed} linha(s) alterada(s) de ${lines.length}\n`);
}

// PDF original: sai do sistema e vai para o arquivo
const storageName = "e7f58e21-6947-420b-bd5b-d01ea2ba43bc.pdf";
const pdfPath = join(documentFilesDir, storageName);
if (existsSync(pdfPath)) {
  const size = readFileSync(pdfPath).length;
  console.log(`  ${apply ? "→" : "·"} PDF original (${(size / 1048576).toFixed(1)} MB) ${apply ? "movido para" : "seria movido para"} o arquivo`);
  if (apply) {
    mkdirSync(join(ARCHIVE, "document-files"), { recursive: true });
    copyFileSync(pdfPath, join(ARCHIVE, "document-files", storageName));
    console.log("    cópia guardada. O arquivo no sistema NÃO foi apagado: confira o arquivo antes.");
  }
  console.log();
}

console.log(failures === 0
  ? `RESULTADO: ${apply ? "gravação concluída" : "simulação aprovada"}, nenhum dado identificável restante.`
  : `RESULTADO: ${failures} arquivo(s) ainda com dado identificável — nada foi gravado.`);
if (!apply) console.log("Nada foi alterado. Rode com --apply para gravar.");
if (failures > 0) process.exitCode = 1;
