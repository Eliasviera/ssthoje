import type { VocabularyEntry } from "./field-vocabulary";

// Biblioteca de medidas de controle relacionadas ao perigo/dano informado.
// É apoio de preenchimento: sugere medidas já existentes no acervo de campo,
// na ordem "medida sugerida para este perigo" e depois o restante do acervo.
// Não é critério obrigatório, não substitui avaliação profissional e não cria
// vínculo automático com o PGR.

export type ControlChoice = { value: string; label: string; group?: string };

type Rule = { keywords: string[]; controls: string[] };

// Palavras-chave sem acento, comparadas com o texto do perigo + dano.
const RULES: Rule[] = [
  {
    keywords: ["fumaca", "fumo metalico", "poeira", "nevoa", "vapor", "solvente", "tinta", "gas"],
    controls: [
      "EPI: RESPIRADOR SEMIFACIAL",
      "EPI: ÓCULOS AMPLA VISÃO",
      "Outros: CAPTAÇÃO E EXAUSTÃO LOCAL",
      "Outros: VENTILAÇÃO FORÇADA",
      "Outros: COLETOR DE POEIRA",
    ],
  },
  {
    keywords: ["ruido", "barulho"],
    controls: ["EPI: PROTETOR AURICULAR", "Med.Adm.: RODÍZIO DE ATIVIDADES"],
  },
  {
    keywords: ["queda de altura", "cair de altura", "diferenca de nivel", "telhado", "andaime", "escada", "plataforma"],
    controls: [
      "EPI: CINTO PARAQUEDISTA COM TALABARTE",
      "Med.Adm.: ISOLAMENTO E SINALIZAÇÃO DA ÁREA",
      "Med.Adm.: PROCEDIMENTO DE TRABALHO REVISADO",
      "Med.Adm.: INSPEÇÃO ANTES DE INICIAR",
    ],
  },
  {
    keywords: ["choque", "eletric", "energizad", "painel", "cabo", "emenda", "curto"],
    controls: [
      "EPI: LUVA ISOLANTE PARA ELÉTRICA",
      "Med.Adm.: BLOQUEIO E ETIQUETAGEM (LOTO)",
      "Med.Adm.: PROCEDIMENTO DE TRABALHO REVISADO",
      "Med.Adm.: INSPEÇÃO ANTES DE INICIAR",
      "EPI: BOTINA DE SEGURANÇA",
    ],
  },
  {
    keywords: ["corte", "laceracao", "projecao", "particula", "cavaco", "lasca", "esmerilh"],
    controls: [
      "EPI: LUVA DE PROTEÇÃO MECÂNICA",
      "EPI: ÓCULOS AMPLA VISÃO",
      "EPI: PROTETOR FACIAL",
      "EPI: AVENTAL DE RASPA",
    ],
  },
  {
    keywords: ["solda", "superficie quente", "queimadura termica"],
    controls: [
      "EPI: AVENTAL DE RASPA",
      "EPI: MÁSCARA DE SOLDA",
      "EPI: LUVA DE PROTEÇÃO MECÂNICA",
      "EPI: PERNEIRA",
    ],
  },
  {
    keywords: ["quimic", "intoxicacao", "irritacao", "dermatose", "corros", "inflamav"],
    controls: [
      "EPI: LUVA NITRÍLICA",
      "EPI: ÓCULOS AMPLA VISÃO",
      "EPI: RESPIRADOR SEMIFACIAL",
      "Outros: CAPTAÇÃO E EXAUSTÃO LOCAL",
    ],
  },
  {
    keywords: ["queda de objeto", "esmagamento", "prensamento", "carga", "icamento", "empilhadeira"],
    controls: [
      "EPI: CAPACETE COM JUGULAR",
      "EPI: BOTINA DE SEGURANÇA",
      "Outros: BARRAMENTO FÍSICO",
      "Med.Adm.: ISOLAMENTO E SINALIZAÇÃO DA ÁREA",
    ],
  },
  {
    keywords: ["ergonomic", "postura", "esforco", "repetitiv", "peso", "lombalgia", "coluna", "agachad"],
    controls: [
      "Med.Adm.: RODÍZIO DE ATIVIDADES",
      "Med.Adm.: PAUSA E ALONGAMENTO",
      "Med.Adm.: PROCEDIMENTO DE TRABALHO REVISADO",
    ],
  },
  {
    keywords: ["calor", "desidratacao", "estresse termico"],
    controls: ["Med.Adm.: PAUSA E ALONGAMENTO", "Outros: VENTILAÇÃO FORÇADA"],
  },
  {
    keywords: ["confinado", "atmosfera", "asfixia", "desmaio"],
    controls: [
      "Outros: VENTILAÇÃO FORÇADA",
      "Outros: CAPTAÇÃO E EXAUSTÃO LOCAL",
      "EPI: RESPIRADOR SEMIFACIAL",
      "Med.Adm.: PERMISSÃO DE TRABALHO",
      "Med.Adm.: SUPERVISÃO PRESENTE NA ATIVIDADE",
    ],
  },
  {
    keywords: ["soterramento", "vala", "escavacao"],
    controls: [
      "Outros: BARRAMENTO FÍSICO",
      "Med.Adm.: ISOLAMENTO E SINALIZAÇÃO DA ÁREA",
      "Med.Adm.: INSPEÇÃO ANTES DE INICIAR",
    ],
  },
  {
    keywords: ["afogamento", "graos", "silo", "moega"],
    controls: [
      "EPI: CINTO PARAQUEDISTA COM TALABARTE",
      "Med.Adm.: SUPERVISÃO PRESENTE NA ATIVIDADE",
      "Med.Adm.: PERMISSÃO DE TRABALHO",
    ],
  },
  {
    keywords: ["incendio", "explosao", "combustivel"],
    controls: [
      "Med.Adm.: PERMISSÃO DE TRABALHO",
      "Med.Adm.: INSPEÇÃO ANTES DE INICIAR",
      "Med.Adm.: ISOLAMENTO E SINALIZAÇÃO DA ÁREA",
      "Med.Adm.: DDS ESPECÍFICO DA TAREFA",
    ],
  },
  {
    keywords: ["biologic", "infect", "residuo", "agua parada", "inseto", "rato", "animal"],
    controls: ["EPI: LUVA NITRÍLICA", "EPI: ÓCULOS AMPLA VISÃO", "EPI: RESPIRADOR SEMIFACIAL"],
  },
  {
    keywords: ["isolado", "sozinho", "comunicacao", "radio"],
    controls: [
      "Med.Adm.: SUPERVISÃO PRESENTE NA ATIVIDADE",
      "Med.Adm.: DDS ESPECÍFICO DA TAREFA",
      "Med.Adm.: ORDEM DE SERVIÇO",
    ],
  },
  {
    keywords: ["vibracao", "vibrat"],
    controls: ["Med.Adm.: RODÍZIO DE ATIVIDADES", "EPI: LUVA DE PROTEÇÃO MECÂNICA"],
  },
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Medidas do acervo relacionadas ao texto do perigo/dano, na ordem das regras. */
export function recommendControlLabels(text: string): string[] {
  const normalized = normalize(text);
  if (!normalized) return [];
  const labels: string[] = [];
  for (const rule of RULES) {
    if (!rule.keywords.some((keyword) => normalized.includes(normalize(keyword)))) continue;
    for (const control of rule.controls) {
      if (!labels.includes(control)) labels.push(control);
    }
  }
  return labels;
}

/**
 * Opções para a lista de medidas: primeiro as sugeridas para o perigo/dano,
 * agrupadas, e depois o restante do acervo. Sugestões ausentes do acervo são ignoradas.
 */
export function controlChoicesForRisk(entries: VocabularyEntry[], text: string): ControlChoice[] {
  const byLabel = new Map(entries.map((entry) => [entry.label, entry]));
  const suggested: ControlChoice[] = [];
  for (const label of recommendControlLabels(text)) {
    const entry = byLabel.get(label);
    if (!entry) continue;
    suggested.push({ value: entry.label, label: entry.simpleLabel ?? entry.label, group: "Sugeridas para este perigo" });
  }
  const used = new Set(suggested.map((choice) => choice.value));
  const rest = entries
    .filter((entry) => !used.has(entry.label))
    .map((entry) => ({ value: entry.label, label: entry.simpleLabel ?? entry.label, group: entry.group }));
  return [...suggested, ...rest];
}
