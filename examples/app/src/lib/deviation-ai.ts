import "server-only";

/**
 * Adaptador de sugestão de relatório de desvio a partir de foto.
 *
 * Esta implementação é SIMULADA: não há chamada de rede, chave de API ou
 * análise real da imagem. O texto devolvido é um roteiro de revisão, sempre
 * marcado com `simulated: true`, confiança baixa e a lista do que não foi
 * observado. A IA nunca decide gravidade, conformidade ou encerramento.
 */

export type DeviationActionItem = {
  what: string;
  why: string;
  who: string;
  when: string;
  where: string;
  how: string;
};

export type DeviationAiDraft = {
  simulated: true;
  model: string;
  promptVersion: string;
  generatedAt: string;
  description: string;
  immediateAction: string;
  actions: DeviationActionItem[];
  confidence: "baixa" | "media" | "alta";
  notObserved: string[];
};

export const DEVIATION_AI_MODEL = "simulado-local-v1";
export const DEVIATION_AI_PROMPT_VERSION = "deviation-photo-2026-11-11";

export class DeviationAiError extends Error {}

export type AnalyzeDeviationPhotoInput = {
  kind: "deviation" | "near_miss";
  location: string;
  photoSha256: string;
};

export function analyzeDeviationPhoto(input: AnalyzeDeviationPhotoInput): DeviationAiDraft {
  if (input.kind !== "deviation" && input.kind !== "near_miss") throw new DeviationAiError("Tipo de relato inválido para a sugestão.");
  const location = typeof input.location === "string" ? input.location.trim().slice(0, 200) : "";
  if (!location) throw new DeviationAiError("Informe o local antes de pedir a sugestão.");
  if (!/^[a-f0-9]{64}$/.test(input.photoSha256)) throw new DeviationAiError("A foto enviada não pôde ser identificada.");

  const rotulo = input.kind === "near_miss" ? "quase incidente" : "desvio";
  const referencia = input.photoSha256.slice(0, 12);
  const local = location;

  return {
    simulated: true,
    model: DEVIATION_AI_MODEL,
    promptVersion: DEVIATION_AI_PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
    description: `Rascunho simulado (foto ${referencia}): ${rotulo} observado em ${local}. Descreva os fatos: condição insegura encontrada, equipamento ou atividade envolvida, pessoas expostas e o que poderia acontecer. Nenhuma imagem foi analisada nesta versão.`,
    immediateAction: `Sinalizar ou isolar o local em ${local} e interromper a atividade até a avaliação de uma pessoa responsável. Ação sugerida para revisão, não executada pelo sistema.`,
    actions: [
      {
        what: "Eliminar a condição observada no local",
        why: "Evitar que o desvio se repita ou evolua para acidente",
        who: "Responsável da área",
        when: "Imediato, até o fim do turno",
        where: local,
        how: "Correção física, sinalização e novo registro fotográfico depois da correção",
      },
      {
        what: "Verificar se a mesma condição existe em outros postos",
        why: "O mesmo desvio costuma aparecer em mais de uma área",
        who: "Técnico de segurança do trabalho",
        when: "5 dias",
        where: "Demais unidades e turnos",
        how: "Inspeção rápida com checklist e registro dos pontos encontrados",
      },
      {
        what: "Orientar as pessoas expostas",
        why: "Reduzir a reincidência enquanto a correção não termina",
        who: "Supervisor imediato",
        when: "48 horas",
        where: local,
        how: "DDS curto com registro de presença",
      },
      {
        what: "Avaliar inclusão do risco no PGR",
        why: "Manter o inventário de riscos coerente com o que foi observado",
        who: "Profissional de SST responsável",
        when: "30 dias",
        where: "Empresa e unidade do relato",
        how: "Revisão do inventário e das medidas de controle já existentes",
      },
    ],
    confidence: "baixa",
    notObserved: [
      "Nenhuma análise de imagem foi executada: esta sugestão é simulada.",
      "O sistema não afirma gravidade, probabilidade, risco ou conformidade.",
      "Pessoas, uso de EPI e condições fora do enquadramento não foram avaliados.",
      "A descrição precisa ser conferida e completada por quem viu a cena.",
    ],
  };
}

function texto(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new DeviationAiError(`O rascunho tem ${label} inválido.`);
  return value.trim();
}

function textoOpcional(value: unknown, max: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > max) throw new DeviationAiError("O rascunho tem um campo de texto inválido.");
  return value.trim();
}

/**
 * Valida o rascunho devolvido pelo navegador antes de gravá-lo.
 * O conteúdo chega pelo formulário, então nada é aceito sem conferência.
 */
export function normalizeDeviationAiDraft(value: unknown): DeviationAiDraft {
  if (!value || typeof value !== "object") throw new DeviationAiError("Rascunho de IA inválido.");
  const raw = value as Record<string, unknown>;
  if (raw.simulated !== true) throw new DeviationAiError("Rascunho de IA sem a marca de simulação.");
  if (raw.confidence !== "baixa" && raw.confidence !== "media" && raw.confidence !== "alta") throw new DeviationAiError("Confiança do rascunho inválida.");
  if (!Array.isArray(raw.actions) || raw.actions.length === 0 || raw.actions.length > 8) throw new DeviationAiError("O plano de ação do rascunho está inválido.");
  if (!Array.isArray(raw.notObserved) || raw.notObserved.length > 6) throw new DeviationAiError("A lista do que não foi observado está inválida.");

  const actions = raw.actions.map((item) => {
    if (!item || typeof item !== "object") throw new DeviationAiError("Uma ação do plano está inválida.");
    const entry = item as Record<string, unknown>;
    return {
      what: texto(entry.what, 300, "ação"),
      why: texto(entry.why, 300, "justificativa"),
      who: texto(entry.who, 300, "responsável"),
      when: texto(entry.when, 300, "prazo"),
      where: texto(entry.where, 300, "local"),
      how: texto(entry.how, 300, "método"),
    };
  });

  const notObserved = raw.notObserved.map((item) => texto(item, 200, "observação"));

  return {
    simulated: true,
    model: texto(raw.model, 80, "modelo"),
    promptVersion: texto(raw.promptVersion, 80, "versão do prompt"),
    generatedAt: texto(raw.generatedAt, 40, "data de geração"),
    description: texto(raw.description, 2000, "descrição"),
    immediateAction: textoOpcional(raw.immediateAction, 1000),
    actions,
    confidence: raw.confidence,
    notObserved,
  };
}
