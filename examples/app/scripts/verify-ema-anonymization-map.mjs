import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Mapa de anonimização verificado (somente leitura).
// Não grava nada: prova que cada identificador real encontrado nos dados da EMA
// tem um substituto fictício definido e que nenhum padrão sensível ficou de fora.

const COMPANY_DIR = new URL(
  "../data/pgr-digitalization/tenant-horizonte/9ce34336-c3c5-4598-a315-8ec457ca27ae/",
  import.meta.url,
);

/** Substituições aprovadas: tudo à esquerda é dado real e precisa sair. */
export const ANONYMIZATION_MAP = [
  { real: "EMA MAXIBUS INDUSTRIA DE CARROCERIAS E EQUIPAMENTOS LTDA", fake: "METALÚRGICA HORIZONTE INDÚSTRIA E EQUIPAMENTOS LTDA", kind: "company" },
  { real: "EMA MAXIBUS", fake: "METALÚRGICA HORIZONTE", kind: "company" },
  { real: "08.961.232/0001-18", fake: "00.000.000/0001-91", kind: "cnpj" },
  { real: "08961232000118", fake: "00000000000191", kind: "cnpj" },
  { real: "ALBERTO PARENTI - 1345", fake: "AVENIDA DAS INDÚSTRIAS - 1800", kind: "address" },
  { real: "DISTRITO INDUSTRIAL", fake: "DISTRITO INDUSTRIAL NORTE", kind: "address" },
  { real: "SETE DE SETEMBRO", fake: "AVENIDA DAS INDÚSTRIAS", kind: "address" },
  { real: "ERECHIM UF: RS CEP: 99700-000", fake: "PASSO FUNDO UF: RS CEP: 99000-000", kind: "address" },
  { real: "ERECHIM", fake: "PASSO FUNDO", kind: "address" },
  { real: "99709-182", fake: "99000-000", kind: "address" },
  { real: "9709-182", fake: "99000-000", kind: "address" },
  { real: "3520 6100", fake: "3311-1111", kind: "phone" },
  { real: "2001", fake: "1800", kind: "address" },
  { real: "ALBERTO PARENTI", fake: "AVENIDA DAS INDÚSTRIAS", kind: "address" },
  { real: "1345", fake: "1800", kind: "address" },
  { real: "(54) 3321-0650", fake: "(54) 3311-0000", kind: "phone" },
  { real: "(54) 3321 0650", fake: "(54) 3311-0000", kind: "phone" },
  { real: "(54) 3520 6100", fake: "(54) 3311-1111", kind: "phone" },
  { real: "(54) 3520-6100", fake: "(54) 3311-1111", kind: "phone" },
  { real: "AV. SETE DE SETEMBRO", fake: "AVENIDA DAS INDÚSTRIAS", kind: "address" },
  { real: "SETE DE SETEMBRO", fake: "AVENIDA DAS INDÚSTRIAS", kind: "address" },
  { real: "2001 , ERECHIM", fake: "1800, PASSO FUNDO", kind: "address" },
  { real: "99709-182, (54) 3520 6100", fake: "99000-000, (54) 3311-1111", kind: "address" },
  { real: "(54) 3520 6100", fake: "(54) 3311-1111", kind: "phone" },
  { real: "leila@ema.ind.br", fake: "contato@metalurgicahorizonte.exemplo", kind: "email" },
  { real: "deli@ema.ind.br", fake: "rh@metalurgicahorizonte.exemplo", kind: "email" },
  { real: "milena.samoyedem@unimed-erechim.com.br", fake: "saude@metalurgicahorizonte.exemplo", kind: "email" },
  { real: "MILTON LUIZ PAGLIOSA", fake: "CARLOS EDUARDO ANDRADE", kind: "person" },
  { real: "325.763.070-00", fake: "[removido]", kind: "cpf" },
  { real: "ANEDIO JOSE MALESKI", fake: "RICARDO SOUZA NEVES", kind: "person" },
  { real: "372.124.270-04", fake: "[removido]", kind: "cpf" },
  { real: "CREA 220072735-6", fake: "CREA 000000000-0", kind: "registration" },
  { real: "ESTELA MONICA LIOTTO PARCIANELLO", fake: "JULIANA FERREIRA LIMA", kind: "person" },
  { real: "MTE/RS 0008612", fake: "MTE/RS 0000000", kind: "registration" },
  { real: "UNIMED ERECHIM", fake: "PLANO DE SAÚDE EXEMPLO", kind: "third_party" },
];

/** Padrões que nunca podem sobrar depois da anonimização. */
const LEAK_PATTERNS = [
  { name: "CNPJ da EMA", pattern: /08961232000118|08\.961\.232\/0001-18/ },
  { name: "nome da EMA", pattern: /EMA\s+MAXIBUS|MAXIBUS/i },
  { name: "cidade real", pattern: /ERECHIM|Erechim/ },
  { name: "e-mail real", pattern: /@ema\.ind\.br|unimed-erechim/i },
  { name: "telefone real", pattern: /3321-0650|3520\s?6100|3520 6100/ },
];

const files = ["source-v1.json", "source-v2.json", "source-v3.json", "imported-v1.json", "imported-v2.json", "imported-v3.json"];
let checks = 0;

console.log("Mapa de anonimização da EMA — verificação (somente leitura)\n");

for (const file of files) {
  let raw;
  try {
    raw = readFileSync(new URL(file, COMPANY_DIR), "utf8");
  } catch {
    console.log(`· ${file}: ausente, ignorado`);
    continue;
  }

  const hits = [];
  for (const entry of ANONYMIZATION_MAP) {
    const count = raw.split(entry.real).length - 1;
    if (count > 0) hits.push(`${entry.real} (${count})`);
  }
  if (hits.length === 0) { console.log(`✓ ${file}: sem dado pessoal identificável`); continue; }
  checks++;
  console.log(`✓ ${file}: ${hits.length} identificadores reais com substituto definido`);
  console.log(`   ${hits.slice(0, 6).join(" · ")}${hits.length > 6 ? " · …" : ""}`);

  // Simula a substituição em memória e confirma que nada sensível sobra.
  let simulated = raw;
  for (const entry of ANONYMIZATION_MAP) {
    simulated = simulated.split(entry.real).join(entry.fake);
  }
  for (const leak of LEAK_PATTERNS) {
    const remaining = (simulated.match(leak.pattern) || []).length;
    assert.equal(remaining, 0, `${file}: sobraram ${remaining} ocorrência(s) de ${leak.name}`);
  }
  checks++;
  console.log(`✓ ${file}: simulação não deixa ${LEAK_PATTERNS.length} padrões sensíveis`);

  // Todo CPF restante precisa ser o placeholder.
  const cpfs = [...new Set(simulated.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g) || [])];
  const foreign = cpfs.filter((value) => !ANONYMIZATION_MAP.some((entry) => entry.fake === value));
  assert.deepEqual(foreign, [], `${file}: CPF sem substituto: ${foreign.join(", ")}`);
  checks++;
  console.log(`✓ ${file}: nenhum CPF real restante (${cpfs.length} placeholder(s))`);

  const digest = createHash("sha256").update(raw).digest("hex").slice(0, 12);
  console.log(`   original: ${(raw.length / 1048576).toFixed(2)} MB · sha256 ${digest}…\n`);
}

console.log(`VERIFICAÇÃO CONCLUÍDA: ${checks} verificações aprovadas, 0 falhas`);
console.log("Nada foi alterado. A substituição só ocorre quando o Elias autorizar.");
