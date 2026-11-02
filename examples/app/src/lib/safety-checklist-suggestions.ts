export type SafetyChecklistSuggestionKind = "general_activity" | "confined_space_nr33" | "confined_space_adaptable" | "confined_space_grain_handling";

export type SafetyChecklistSuggestion = {
  title: string;
  activity: string;
  prompts: string[];
};

const suggestions: Record<SafetyChecklistSuggestionKind, SafetyChecklistSuggestion> = {
  general_activity: {
    title: "03 · APR Genérica",
    activity: "Atividade definida pela equipe",
    prompts: [
      "O escopo e a identificação da atividade foram descritos pela equipe?",
      "As etapas da atividade foram descritas pela equipe?",
      "Os riscos foram selecionados manualmente de um PGR aprovado?",
      "Os controles e verificações foram inseridos pela equipe após revisão técnica?",
      "As pendências, ações e responsáveis foram registrados?",
    ],
  },
  confined_space_nr33: {
    title: "02 · APR EC Geral",
    activity: "Espaço e atividade definidos pela equipe · referência NR-33 a validar",
    prompts: [
      "O tipo, as características, a identificação e a delimitação do espaço foram descritos para esta atividade?",
      "As etapas da atividade, os acessos e as condições encontradas foram descritos pela equipe?",
      "Os riscos do espaço, da atividade e dos materiais ou processos envolvidos foram avaliados, incluindo condições específicas quando aplicáveis?",
      "Os controles e verificações específicos deste espaço e desta atividade foram registrados após revisão técnica?",
      "As pendências, ações e responsáveis foram registrados?",
    ],
  },
  confined_space_adaptable: {
    title: "02 · APR EC Geral",
    activity: "Espaço e atividade definidos pela equipe · referência NR-33 a validar",
    prompts: [
      "A atividade, o local e a identificação do espaço foram registrados com os dados necessários para reconhecer o serviço?",
      "O tipo, as características, a geometria, os acessos e os limites do espaço foram descritos para esta atividade?",
      "O escopo, a duração prevista, a ordem de serviço e as etapas da tarefa foram descritos?",
      "A equipe avaliou alternativas para executar o serviço sem entrada no espaço, quando isso fizer sentido para a tarefa?",
      "As atividades críticas ou não rotineiras relacionadas e as permissões de trabalho necessárias foram identificadas pela equipe?",
      "A equipe, as funções e as responsabilidades necessárias para a tarefa foram registradas?",
      "Os riscos atmosféricos, físicos, químicos, biológicos, ergonômicos e de acesso/resgate relevantes foram avaliados pela equipe?",
      "Os riscos ligados aos materiais, processos, equipamentos e serviços simultâneos foram considerados?",
      "A hierarquia de controles e as medidas específicas da tarefa foram registradas após revisão técnica?",
      "As fontes de energia e outros agentes que possam afetar a tarefa, e os controles de isolamento aplicáveis, foram identificados?",
      "Os equipamentos, recursos coletivos e EPIs necessários foram definidos e sua condição foi conferida pela equipe?",
      "A comunicação, o acompanhamento externo e os recursos de resposta a emergência e resgate foram descritos conforme o cenário?",
      "A sequência da tarefa relaciona cada etapa aos perigos, controles e responsáveis correspondentes?",
      "As condições para interromper, reavaliar e encerrar a tarefa, incluindo conferência final do local e da equipe, foram registradas?",
      "As pendências, ações, responsáveis e evidências de revisão foram registrados?",
    ],
  },
  confined_space_grain_handling: {
    title: "01 · APR EC Silos",
    activity: "Atividade em silo, moega ou operação com grãos · referência NR-33 a validar",
    prompts: [
      "O silo, a moega ou outra instalação com grãos, sua identificação, características, acessos e limites foram descritos?",
      "A atividade, a ordem de serviço e as etapas foram registradas, incluindo materiais, equipamentos e operações simultâneas?",
      "A equipe avaliou se o serviço pode ser feito sem ingresso e registrou a justificativa quando considerar a entrada necessária?",
      "As funções da equipe, a supervisão, a vigilância externa e os recursos de resposta foram identificados para esta tarefa?",
      "Os riscos atmosféricos e as condições que possam mudar durante a tarefa foram avaliados por responsável competente?",
      "Os riscos de engolfamento, soterramento, pontes, vazios, crostas ou movimentação de grãos foram considerados quando existentes?",
      "A movimentação de grãos, comportas, roscas, transportadores e demais fontes de energia foi avaliada para esta instalação?",
      "Os isolamentos, bloqueios e verificações de energia aplicáveis foram descritos e vinculados aos registros de trabalho pertinentes?",
      "As condições de ventilação, exaustão, purga ou inertização foram avaliadas conforme o projeto e as características do espaço?",
      "Os equipamentos de medição, comunicação e iluminação foram definidos conforme o cenário e as referências revisadas pela equipe?",
      "Os controles coletivos, ancoragens, equipamentos de acesso e EPIs foram definidos após avaliação técnica da tarefa?",
      "O plano de emergência e resgate considera o acesso, a geometria, os recursos disponíveis e as condições específicas da instalação?",
      "A sequência da tarefa relaciona cada etapa aos perigos, controles, recursos e responsáveis?",
      "As condições especiais para trabalho sobre ou junto à massa de grãos foram consideradas somente quando a atividade realmente as envolver?",
      "Os procedimentos internos aplicáveis ao cenário de grãos foram identificados e anexados ou referenciados pela equipe?",
      "As condições para interromper e reavaliar a tarefa diante de mudança no espaço, processo, atmosfera ou isolamento foram registradas?",
      "O encerramento prevê conferência da equipe, retirada de materiais, fechamento do espaço e tratamento dos isolamentos conforme procedimento?",
      "As medições, verificações, evidências, pendências e responsáveis foram registrados para esta atividade?",
    ],
  },
};

export function getSafetyChecklistSuggestion(kind: SafetyChecklistSuggestionKind): SafetyChecklistSuggestion {
  const suggestion = suggestions[kind];
  return { ...suggestion, prompts: [...suggestion.prompts] };
}
