import assert from "node:assert/strict";
import test from "node:test";
import { createTrainingDemoCertificatePreview, getTrainingDemoCertificateGate, signaturesForTrainingDemoCertificate } from "../src/lib/training-demo-workflow.ts";

const attendance = { participant: "sig-aluno-presenca-ficticia", instructor: "sig-instrutor-presenca-ficticia" };
const appSignatures = { participant: "sig-aluno-app-ficticia", instructor: "sig-instrutor-app-ficticia" };

test("resultado continua pendente até o envio da avaliação", () => {
  assert.equal(getTrainingDemoCertificateGate({ submitted: false, score: 3, requiredScore: 2, signatures: attendance }), "pending_grade");
});

test("nota abaixo do critério bloqueia certificado mesmo com todas as assinaturas", () => {
  const input = { submitted: true, score: 1, requiredScore: 2, signatures: attendance };
  assert.equal(getTrainingDemoCertificateGate(input), "unsatisfactory");
  assert.throws(() => createTrainingDemoCertificatePreview(input), /Prévia indisponível: estado unsatisfactory/);
});

test("nota satisfatória ainda aguarda assinatura de participante ou instrutor", () => {
  assert.equal(getTrainingDemoCertificateGate({ submitted: true, score: 2, requiredScore: 2, signatures: { participant: attendance.participant } }), "pending_signatures");
});

test("nota suficiente e assinaturas completas liberam somente uma prévia fictícia", () => {
  const preview = createTrainingDemoCertificatePreview({ submitted: true, score: 3, requiredScore: 2, signatures: attendance });
  assert.deepEqual(preview, { status: "demo_preview", score: 3, signatures: attendance });
});

test("certificado presencial reutiliza assinaturas da presença e app usa seu próprio conjunto", () => {
  assert.deepEqual(signaturesForTrainingDemoCertificate("presencial", attendance, appSignatures), attendance);
  assert.deepEqual(signaturesForTrainingDemoCertificate("app", attendance, appSignatures), appSignatures);
});
