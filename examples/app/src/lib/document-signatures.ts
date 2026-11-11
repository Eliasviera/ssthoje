// Assinatura simples desenhada na tela, compartilhada por AR, APR e (adiante) PT/PTE.
// Não é assinatura qualificada (ICP-Brasil): registra autoria da coleta, data/hora e
// a imagem do traço. A imagem é dado pessoal e deve ter finalidade e acesso restritos.

export type DocumentSignerRole = "issuer" | "participant";

export type DocumentSigner = {
  id: string;
  name: string;
  role: DocumentSignerRole;
  /** Vínculo com o cadastro de trabalhadores, quando a pessoa foi escolhida da lista. */
  workerId?: string;
};

/** Opção de trabalhador cadastrado oferecida ao incluir um assinante. */
export type DocumentWorkerOption = { id: string; name: string; jobTitle: string; companyId: string; unitId: string };

export type DocumentSignature = {
  signerId: string;
  signerName: string;
  role: DocumentSignerRole;
  image: string;
  signedAt: string;
  capturedByUserId: string;
  method: "drawn_on_screen_simple";
};

export const MAX_SIGNATURE_BYTES = 80 * 1024;
const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

export class DocumentSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentSignatureError";
  }
}

export function isDocumentSignerRole(value: string): value is DocumentSignerRole {
  return value === "issuer" || value === "participant";
}

export function normalizeSignerName(value: string): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 120) {
    throw new DocumentSignatureError("Informe o nome de quem vai assinar (de 2 a 120 caracteres).");
  }
  return name;
}

export function validateSignatureImage(value: string): string {
  const image = typeof value === "string" ? value.trim() : "";
  if (!image.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new DocumentSignatureError("Desenhe a assinatura na tela antes de registrar.");
  }
  const base64 = image.slice(PNG_DATA_URL_PREFIX.length);
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new DocumentSignatureError("A imagem da assinatura é inválida. Desenhe novamente.");
  }
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((base64.length * 3) / 4) - padding;
  if (bytes < 100) throw new DocumentSignatureError("A assinatura está vazia. Desenhe novamente.");
  if (bytes > MAX_SIGNATURE_BYTES) throw new DocumentSignatureError("A assinatura excede o limite de 80 KB. Desenhe um traço mais simples.");
  return image;
}

/** Quem foi incluído na lista e ainda não assinou. */
export function pendingDocumentSigners(signers: DocumentSigner[], signatures: DocumentSignature[]): DocumentSigner[] {
  const signed = new Set(signatures.map((signature) => signature.signerId));
  return signers.filter((signer) => !signed.has(signer.id));
}

export function sameSignerName(left: string, right: string) {
  return left.trim().toLocaleLowerCase("pt-BR") === right.trim().toLocaleLowerCase("pt-BR");
}
