import { createHmac, timingSafeEqual } from "node:crypto";

export type IntegrationKind = "email_otp" | "billing" | "ai";
export type SandboxRequest = { tenantId: string; kind: IntegrationKind; key: string };
export type SandboxResult = { reference: string; state: "simulated"; description: string };
export interface IntegrationAdapter { execute(request: SandboxRequest): SandboxResult }
// Contratos internos. Não representam APIs nem autenticação dos fornecedores.
export const MOCK_ADAPTERS: Record<IntegrationKind, IntegrationAdapter> = {
  email_otp: { execute: r => ({ reference: `mock-mail-${r.key}`, state: "simulated", description: "Mensagem e OTP fictícios preparados. Nenhum envio; não autoriza login ou aceite." }) },
  billing: { execute: r => ({ reference: `mock-charge-${r.key}`, state: "simulated", description: "Cobrança fictícia de R$ 1,00 preparada. Não altera assinaturas ou cobranças do M17." }) },
  ai: { execute: r => ({ reference: `mock-ai-${r.key}`, state: "simulated", description: "Resposta fixa: organizar documentos e encaminhar pendências à revisão humana. Sem análise normativa ou médica." }) },
};
export function signFixture(body: string, secret: string) { return createHmac("sha256", secret).update(body).digest("hex"); }
export function verifyFixture(body: string, signature: string, secret: string) {
  if (!secret || body.length > 4096 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(signFixture(body, secret), "hex"));
}
