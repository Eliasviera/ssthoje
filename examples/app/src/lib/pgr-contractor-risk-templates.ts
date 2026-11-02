export type RiskTemplate = {
  keywords: string[];
  title: string;
  activity: string;
  risks: string;
  interference: string;
  controls: string;
  ppe: string;
  actionPlan: string;
  evidence: string;
};

export const CONTRACTOR_RISK_TEMPLATES: RiskTemplate[] = [
  {
    keywords: ["pedreiro", "alvenaria", "cimento", "argamassa", "reboco", "concreto", "reparo", "assentamento", "ajuste"],
    title: "Orientação de riscos complementares – Alvenaria, argamassa e cimento",
    activity: "Execução de reparos/ajustes em alvenaria, argamassa e concreto. Serviço pontual vinculado à mobilização de terceiro.",
    risks: "Poeira de cimento/argamassa; levantamento e transporte manual; cortes com ferramentas manuais; quedas ao mesmo nível; projeção de fragmentos/argamassa; contato dérmico com argamassa.",
    interference: "Riscos de interferência com a operação da contratante: circulação de veículos/equipamentos, áreas produtivas, rotas internas, obstrução de passagens e saídas de emergência.",
    controls: "Organização do local, umidificação para conter poeira, divisão de cargas, uso adequado de ferramentas, sinalização da área, limpeza ao final da jornada e cumprimento das orientações da segurança da contratante.",
    ppe: "Calçado de segurança, luvas de proteção, óculos de segurança, roupa adequada. Máscara PFF2 quando houver geração significativa de poeira.",
    actionPlan: "1) Verificar área com responsável da contratante. 2) Delimitar/sinalizar local. 3) Executar com EPIs orientados. 4) Manter organização e limpeza. 5) Comunicar ao responsável ao término dos trabalhos.",
    evidence: "Orientação de riscos complementares anexada ao PGR da contratante, vinculada ao convite de terceiros. Histórico de início e encerramento registrado."
  },
  {
    keywords: ["eletricista", "elétric", "cabeamento", "quadro"],
    title: "Orientação de riscos complementares – Serviços elétricos pontuais",
    activity: "Serviços elétricos pontuais e intervenções em baixa tensão, conforme escopo autorizado.",
    risks: "Choque elétrico; arco elétrico; quedas; queimaduras; contato com partes energizadas.",
    interference: "Interferência com instalações elétricas e áreas operacionais da contratante.",
    controls: "Somente com autorização, bloqueio/desenergização quando aplicável, uso de ferramentas isoladas, isolamento da área e acompanhamento conforme orientação da contratante.",
    ppe: "Calçado dielétrico, luvas isolantes (conforme NR-10), óculos de segurança, vestimenta adequada.",
    actionPlan: "1) Solicitar autorização à contratante. 2) Verificar condição de desenergização/bloqueio. 3) Trabalhar com EPIs adequados. 4) Restabelecer em conjunto com responsável. 5) Limpar e comunicar término.",
    evidence: "Orientação de riscos complementares anexada ao PGR da contratante, vinculada ao convite de terceiros. Histórico de início e encerramento registrado."
  },
  {
    keywords: ["pintura", "solvente", "tinta"],
    title: "Orientação de riscos complementares – Pintura e solventes",
    activity: "Serviços de pintura pontuais com solventes/tintas.",
    risks: "Inalação de vapores; contato dérmico; incêndio/explosão; irritação ocular/respiratória.",
    interference: "Interferência com áreas produtivas, ventilação e rotas de evacuação.",
    controls: "Ventilação adequada, afastamento de fontes de ignição, uso de EPI respiratório conforme avaliação, contenção e organização.",
    ppe: "Luvas adequadas ao produto, óculos de segurança, máscara/respirador conforme avaliação, calçado de segurança.",
    actionPlan: "1) Verificar ventilação com responsável. 2) Afastar fontes de ignição. 3) Usar EPIs orientados. 4) Manter área ventilada e organizada. 5) Limpar e comunicar término.",
    evidence: "Orientação de riscos complementares anexada ao PGR da contratante, vinculada ao convite de terceiros. Histórico de início e encerramento registrado."
  }
];

export function findContractorRiskTemplate(text: string): RiskTemplate | undefined {
  const normalized = (text || "").toLowerCase();
  for (const template of CONTRACTOR_RISK_TEMPLATES) {
    if (template.keywords.some((keyword) => normalized.includes(keyword))) {
      return template;
    }
  }
  return undefined;
}
