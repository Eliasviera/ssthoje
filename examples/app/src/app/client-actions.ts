"use server";

import { revalidatePath } from "next/cache";
import { changeClientCompanyStatus, listClientCompanies, registerClientCompany } from "@/lib/client-service";
import { appendAuditEvent } from "@/lib/audit-log";
import { MAX_CLIENT_LOGO_BYTES, saveClientLogo } from "@/lib/client-logo";
import { scopeClientCompanies } from "@/lib/client-company-scope";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { TenantCapacityError } from "@/lib/tenant-state";
import { getClientStorageMode } from "@/lib/client-storage-mode";
import { CLIENT_THIRD_PARTY_REQUIREMENTS } from "@/lib/third-party-policy";

export type ClientFormState = { error?: string; success?: string };
const logoUpdates = new Map<string, number>();

export async function saveClientLogoAction(_previous: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const access = await getCurrentTenantAccess("client.logo.manage");
  if (!access.context) return { error: "Sua conta não tem permissão para alterar o logo." };
  const { tenant, membership } = access.context;
  const companyId = access.context.companyScope?.companyId;
  if (!companyId) return { error: "Seu vínculo com a empresa está indisponível." };
  const file = formData.get("logo");
  if (!(file instanceof File) || !file.size || file.size > MAX_CLIENT_LOGO_BYTES) {
    return { error: "Selecione um logo PNG ou JPEG de até 512 KB." };
  }
  const now = Date.now();
  for (const [userId, expiresAt] of logoUpdates) if (expiresAt <= now) logoUpdates.delete(userId);
  if (logoUpdates.has(access.session.userId)) return { error: "Aguarde alguns segundos antes de tentar novamente." };
  logoUpdates.set(access.session.userId, now + 3000);

  try {
    if (!scopeClientCompanies(access.context, await listClientCompanies(tenant.id)).some(company => company.status === "active")) {
      return { error: "Empresa ativa indisponível." };
    }
    await saveClientLogo(tenant.id, companyId, Buffer.from(await file.arrayBuffer()));
    appendAuditEvent({ tenantId: tenant.id, actorUserId: access.session.userId, actorRole: membership.role, action: "client.updated", targetId: companyId });
    revalidatePath(`/empresas/${companyId}`);
    revalidatePath("/minha-empresa/logo");
    return { success: "Logo salvo para os documentos desta empresa." };
  } catch {
    return { error: "Não foi possível salvar. Confira se o arquivo é PNG ou JPEG e tente novamente." };
  }
}

function getText(formData: FormData, name: string, maxLength: number) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function createClientAction(_previousState: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const access = await getCurrentTenantAccess("tenant.clients.manage");
  if (!access.authenticated || !access.context) return { error: "Sua conta não tem permissão para cadastrar empresas." };

  const legalName = getText(formData, "legalName", 160);
  const tradeName = getText(formData, "tradeName", 120);
  const contactName = getText(formData, "contactName", 120);
  const contactEmail = getText(formData, "contactEmail", 254).toLowerCase();
  const contactPhone = getText(formData, "contactPhone", 30);
  const rawThirdPartyRequirements = formData.getAll("thirdPartyRequirements");
  const rawCnpjs = formData.getAll("unitCnpj");
  const rawNames = formData.getAll("unitName");
  const rawPlaces = formData.getAll("unitCityState");

  if (!legalName) return { error: "Informe a razão social da empresa." };
  if (rawThirdPartyRequirements.some((value) => typeof value !== "string" || !CLIENT_THIRD_PARTY_REQUIREMENTS.includes(value as typeof CLIENT_THIRD_PARTY_REQUIREMENTS[number]))
    || new Set(rawThirdPartyRequirements).size !== rawThirdPartyRequirements.length) return { error: "Confira os documentos padrão para contratadas." };
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { error: "Confira o e-mail do contato." };
  if (rawCnpjs.length < 1 || rawCnpjs.length > 20 || rawNames.length !== rawCnpjs.length || rawPlaces.length !== rawCnpjs.length) {
    return { error: "Informe de 1 a 20 unidades, com os campos correspondentes." };
  }

  const units = [];
  for (let index = 0; index < rawCnpjs.length; index += 1) {
    const cnpjInput = rawCnpjs[index];
    const unitNameInput = rawNames[index];
    const placeInput = rawPlaces[index];
    if (typeof cnpjInput !== "string" || typeof unitNameInput !== "string" || typeof placeInput !== "string") {
      return { error: "Confira os dados de cada unidade." };
    }
    const cnpj = cnpjInput.replace(/\D/g, "");
    const name = unitNameInput.trim().slice(0, 120);
    const cityState = placeInput.trim().slice(0, 120);
    if (cnpj.length !== 14 || /^([0-9])\1{13}$/.test(cnpj)) return { error: `Informe um CNPJ com 14 dígitos na unidade ${index + 1}.` };
    units.push({ cnpj, name: name || `Unidade ${index + 1}`, cityState });
  }

  try {
    await registerClientCompany({
      tenantId: access.context.tenant.id,
      legalName,
      tradeName,
      contactName,
      contactEmail,
      contactPhone,
      thirdPartyRequirements: rawThirdPartyRequirements as typeof CLIENT_THIRD_PARTY_REQUIREMENTS[number][],
      units,
    }, { userId: access.session.userId, role: access.context.membership.role });
  } catch (error) {
    if (error instanceof TenantCapacityError || (error instanceof Error && error.message.includes("CNPJ"))) return { error: error.message };
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/empresas");
  return { success: getClientStorageMode() === "postgres" ? "Empresa cadastrada no PostgreSQL local." : "Empresa cadastrada e salva neste computador." };
}

export async function setClientStatusAction(_previous: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const access = await getCurrentTenantAccess("tenant.clients.manage");
  if (!access.authenticated || !access.context) return { error: "Acesso indisponível. Entre novamente ou procure o suporte." };
  const id = getText(formData, "companyId", 64), status = getText(formData, "status", 16);
  if (!id || (status !== "active" && status !== "archived")) return { error: "Confira o cadastro e o estado informado." };
  try {
    const changed = await changeClientCompanyStatus(access.context.tenant.id, id, status, { userId: access.session.userId, role: access.context.membership.role });
    if (!changed) return { error: "Cadastro indisponível ou sem alteração." };
    revalidatePath("/"); revalidatePath("/empresas"); return { success: "Situação atualizada." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível atualizar. Tente novamente." }; }
}
