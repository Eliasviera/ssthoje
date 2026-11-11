// Opções de preenchimento para os rascunhos de PT/PTE.
// Derivadas dos campos já mapeados dos formulários Word (ver docs/PT_PTE_CHECKPOINT.md).
// São sugestões de digitação: a pessoa escolhe da lista ou escreve outro texto.
// Não são critérios, respostas obrigatórias, limites ou travas: nada aqui libera,
// bloqueia ou classifica uma atividade.

export const WORK_PERMIT_FIELD_OPTIONS: Record<string, string[]> = {
  // PTE — entrada e trabalho em espaço confinado
  "access-keys": [
    "Chave sob controle da supervisão",
    "Chave sob controle do vigia",
    "Acesso aberto durante a atividade",
    "Controle de chaves não informado",
  ],
  "team-role": ["Supervisão de entrada", "Executante/entrante", "Vigia", "Resgate"],
  "ventilation-equipment": [
    "Ventilador/exaustor móvel",
    "Purga com ar comprimido",
    "Ventilação fixa da área",
    "Ventilação não informada",
  ],
  "energy-isolation-sources": [
    "Energia elétrica",
    "Energia mecânica",
    "Ar comprimido",
    "Vapor",
    "Produtos químicos",
    "Movimentação de grãos",
  ],
  "grain-conveyors": [
    "Transportadores desligados e bloqueados",
    "Transportadores em operação",
    "Não se aplica ao cenário",
  ],
  "grain-mass-access": [
    "Acesso sobre a massa",
    "Acesso sem pisar na massa",
    "Não se aplica ao cenário",
  ],
  // PT — trabalho a quente e módulos internos (elétrica, escavação, içamento)
  "company-labor-origin": ["Mão de obra própria", "Mão de obra terceirizada", "Mão de obra mista"],
  "electrical-isolation-lockout": [
    "Isolado e bloqueado",
    "Isolado sem bloqueio",
    "Não isolado",
    "Isolamento não informado",
  ],
  "edge-area-protection": [
    "Isolamento e sinalização da área",
    "Proteção de borda instalada",
    "Sem proteção informada",
  ],
  "lifting-area-isolation": [
    "Área isolada e sinalizada",
    "Isolamento parcial",
    "Sem isolamento informado",
  ],
  "lifting-communication": [
    "Comunicação por rádio",
    "Comunicação por gestos",
    "Comunicação por apito",
    "Comunicação não informada",
  ],
  "lifting-accessories-inspection": [
    "Inspeção registrada",
    "Inspeção pendente",
    "Inspeção não informada",
  ],
};

/** Opções de um campo; lista vazia mantém o campo de texto livre. */
export function optionsForField(fieldId: string): string[] {
  return WORK_PERMIT_FIELD_OPTIONS[fieldId] ?? [];
}
