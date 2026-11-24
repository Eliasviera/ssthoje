export type TrainingDemoModality = "app" | "presencial";
export type TrainingDemoSignatures = { participant?: string; instructor?: string };
export type TrainingDemoGateStatus = "pending_grade" | "unsatisfactory" | "pending_signatures" | "ready";

export function signaturesForTrainingDemoCertificate(
  modality: TrainingDemoModality,
  attendanceSignatures: TrainingDemoSignatures,
  appCertificateSignatures: TrainingDemoSignatures,
): TrainingDemoSignatures {
  return { ...(modality === "presencial" ? attendanceSignatures : appCertificateSignatures) };
}

export function getTrainingDemoCertificateGate(input: {
  submitted: boolean;
  score: number;
  requiredScore: number;
  signatures: TrainingDemoSignatures;
}): TrainingDemoGateStatus {
  if (!input.submitted) return "pending_grade";
  if (!Number.isInteger(input.score) || !Number.isInteger(input.requiredScore)
    || input.requiredScore < 0 || input.score < input.requiredScore) return "unsatisfactory";
  if (!input.signatures.participant || !input.signatures.instructor) return "pending_signatures";
  return "ready";
}

export function createTrainingDemoCertificatePreview(input: {
  submitted: boolean;
  score: number;
  requiredScore: number;
  signatures: TrainingDemoSignatures;
}) {
  const gate = getTrainingDemoCertificateGate(input);
  if (gate !== "ready") throw new Error(`Prévia indisponível: estado ${gate}.`);
  return { status: "demo_preview" as const, score: input.score, signatures: { ...input.signatures } };
}
