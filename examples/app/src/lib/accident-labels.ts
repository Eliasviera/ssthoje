export type AccidentType = "typical" | "commute" | "disease";
export type CatType = "initial" | "reopen" | "death";
export type AccidentStatus = "draft" | "ready" | "transmitted";
export type TransmissionChannel = "esocial" | "catweb" | "other";

export const ACCIDENT_TYPE_LABEL: Readonly<Record<AccidentType, string>> = Object.freeze({
  typical: "Acidente típico",
  commute: "Acidente de trajeto",
  disease: "Doença relacionada ao trabalho",
});

export const CAT_TYPE_LABEL: Readonly<Record<CatType, string>> = Object.freeze({
  initial: "CAT inicial",
  reopen: "CAT de reabertura",
  death: "Comunicação de óbito",
});

export const ACCIDENT_STATUS_LABEL: Readonly<Record<AccidentStatus, string>> = Object.freeze({
  draft: "Rascunho",
  ready: "CAT pronta para transmissão",
  transmitted: "Transmitida fora do sistema",
});

export const TRANSMISSION_CHANNEL_LABEL: Readonly<Record<TransmissionChannel, string>> = Object.freeze({
  esocial: "eSocial (S-2210)",
  catweb: "CATWeb",
  other: "Outro canal",
});

/** Data ISO (AAAA-MM-DD) para o formato brasileiro; vazio quando a data não existe. */
export function formatDateBR(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
