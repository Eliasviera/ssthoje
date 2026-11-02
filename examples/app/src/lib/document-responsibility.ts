export type DocumentResponsibilityType = "PGR" | "PCMSO" | "PPR" | "PCA" | "ERGONOMIA" | "LTCAT";

export type DocumentResponsibilityProfile = {
  title: string;
  responsibleRole: string;
  credentialLabel: string;
  validationLabel: string;
  organizationRole: string;
};

/** Role prompts for print templates; they identify who must be designated, not who has been validated. */
export const DOCUMENT_RESPONSIBILITY: Record<DocumentResponsibilityType, DocumentResponsibilityProfile> = {
  PGR: {
    title: "PGR",
    responsibleRole: "Profissional responsável pela elaboração/revisão do PGR",
    credentialLabel: "Conselho e registro profissional aplicável",
    validationLabel: "Validação técnica do PGR",
    organizationRole: "Representante legal: ciência dos dados e compromissos de implantação",
  },
  PCMSO: {
    title: "PCMSO",
    responsibleRole: "Médico responsável pelo PCMSO",
    credentialLabel: "CRM/UF e qualificação aplicável",
    validationLabel: "Validação médica do PCMSO",
    organizationRole: "Representante legal: ciência dos dados e compromisso de implantação; a elaboração documental pela consultoria não substitui a responsabilidade médica",
  },
  PPR: {
    title: "PPR",
    responsibleRole: "Administrador do PPR designado pela organização, com conhecimento em proteção respiratória",
    credentialLabel: "Qualificação / capacitação em proteção respiratória do administrador",
    validationLabel: "Revisão técnica do administrador do PPR e avaliação médica aplicável",
    organizationRole: "Empregador/gerência: designação do administrador, autoridade, recursos e implantação do programa",
  },
  PCA: {
    title: "PCA",
    responsibleRole: "Profissional de saúde responsável pela validação do PCA, com participação da equipe multidisciplinar",
    credentialLabel: "Identificação e qualificação do responsável de saúde e dos profissionais participantes",
    validationLabel: "Validação pelo profissional de saúde responsável pelo PCA",
    organizationRole: "Empregador: implantação, recursos e participação das áreas envolvidas; a equipe de SST presta apoio dentro de sua competência",
  },
  ERGONOMIA: {
    title: "AEP / AET",
    responsibleRole: "Profissional responsável pela avaliação ergonômica, com equipe multidisciplinar e participação dos trabalhadores",
    credentialLabel: "Qualificação pertinente, método utilizado e participantes da avaliação",
    validationLabel: "Validação da avaliação e das intervenções com participação dos trabalhadores",
    organizationRole: "Organização: registro, participação dos trabalhadores, implementação e acompanhamento das medidas; saúde ocupacional consultada nos aspectos pertinentes",
  },
  LTCAT: {
    title: "LTCAT",
    responsibleRole: "Médico do trabalho ou Engenheiro de Segurança do Trabalho responsável",
    credentialLabel: "CRM/UF ou CREA/UF e referência de responsabilidade técnica aplicável",
    validationLabel: "Responsabilidade técnica do LTCAT",
    organizationRole: "Empregador: confirmação dos dados do estabelecimento e das condições avaliadas",
  },
};
