export type PcmsoEsocialSource = {
  id: string;
  version: number;
  companyId: string;
  unitId: string;
  companyName: string;
  unitName: string;
};

export function pcmsoEsocialReference(source: Pick<PcmsoEsocialSource, "id" | "version">) {
  if (!source.id || !Number.isSafeInteger(source.version) || source.version < 1) return "";
  return `pcmso:${source.id}:v${source.version}`;
}

export function findPcmsoEsocialSource(
  sources: readonly PcmsoEsocialSource[],
  reference: string,
  scope?: Pick<PcmsoEsocialSource, "companyId" | "unitId">,
): PcmsoEsocialSource | undefined {
  return sources.find((source) => pcmsoEsocialReference(source) === reference
    && (!scope || (source.companyId === scope.companyId && source.unitId === scope.unitId)));
}
