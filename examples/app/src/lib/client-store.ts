import "server-only";
import { assertTenantCapacity } from "./tenant-state";
import type { ClientThirdPartyRequirement } from "./third-party-policy";
import { CLIENT_THIRD_PARTY_REQUIREMENTS } from "./third-party-policy";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type ClientUnit = { id: string; cnpj: string; name: string; cityState: string };
export type ClientCompany = {
  id: string;
  tenantId: string;
  legalName: string;
  tradeName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  status: "active" | "archived";
  thirdPartyRequirements?: ClientThirdPartyRequirement[];
  units: ClientUnit[];
  createdAt: string;
  updatedAt: string;
};
export type NewClientCompany = Omit<ClientCompany, "id" | "status" | "createdAt" | "updatedAt" | "units"> & {
  units: Omit<ClientUnit, "id">[];
};

function getStorePath() {
  return join(process.cwd(), "data", "clients.json");
}

function readAll(): ClientCompany[] {
  try {
    const value: unknown = JSON.parse(readFileSync(getStorePath(), "utf8"));
    if (!Array.isArray(value)) throw new Error("O arquivo local de empresas tem formato inválido.");
    return value as ClientCompany[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function writeAll(companies: ClientCompany[]) {
  const path = getStorePath();
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(companies, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporaryPath, path);
}

export function listClientCompaniesForTenant(tenantId: string): ClientCompany[] {
  return readAll()
    .filter((company) => company.tenantId === tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((company) => ({ ...company, thirdPartyRequirements: [...(company.thirdPartyRequirements ?? [])], units: company.units.map((unit) => ({ ...unit })) }));
}

export function createClientCompany(input: NewClientCompany): ClientCompany {
  const requirements = input.thirdPartyRequirements ?? [];
  if (requirements.some((kind) => !CLIENT_THIRD_PARTY_REQUIREMENTS.includes(kind)) || new Set(requirements).size !== requirements.length) {
    throw new Error("Confira os documentos padrão para contratadas.");
  }
  const companies = readAll();
  assertTenantCapacity(input.tenantId, "companies", companies.filter(c => c.tenantId === input.tenantId && c.status === "active").length);
  const submittedCnpjs = input.units.map((unit) => unit.cnpj.replace(/\D/g, ""));
  const alreadyUsed = companies.some((company) => company.tenantId === input.tenantId
    && company.units.some((unit) => submittedCnpjs.includes(unit.cnpj.replace(/\D/g, ""))));
  if (alreadyUsed) throw new Error("Este CNPJ já está cadastrado nesta consultoria.");

  const allCnpjs = companies.flatMap((company) => company.tenantId === input.tenantId ? company.units.map((unit) => unit.cnpj.replace(/\D/g, "")) : []);
  if (submittedCnpjs.some((cnpj, index) => submittedCnpjs.indexOf(cnpj) !== index || allCnpjs.includes(cnpj))) {
    throw new Error("Não repita CNPJs no cadastro.");
  }

  const now = new Date().toISOString();
  const company: ClientCompany = {
    ...input,
    id: randomUUID(),
    status: "active",
    units: input.units.map((unit) => ({ ...unit, id: randomUUID() })),
    createdAt: now,
    updatedAt: now,
  };
  writeAll([...companies, company]);
  return { ...company, thirdPartyRequirements: [...(company.thirdPartyRequirements ?? [])], units: company.units.map((unit) => ({ ...unit })) };
}

export function setClientCompanyStatus(tenantId: string, companyId: string, status: ClientCompany["status"]): ClientCompany | null {
  const companies = readAll();
  const company = companies.find((entry) => entry.id === companyId && entry.tenantId === tenantId);
  if (!company) return null;
  if (status === "active" && company.status !== "active") assertTenantCapacity(tenantId, "companies", companies.filter(c => c.tenantId === tenantId && c.status === "active").length);
  company.status = status;
  company.updatedAt = new Date().toISOString();
  writeAll(companies);
  return { ...company, thirdPartyRequirements: [...(company.thirdPartyRequirements ?? [])], units: company.units.map((unit) => ({ ...unit })) };
}
