import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { scopeClientCompanies } from "@/lib/client-company-scope";
import { listDeviationsForAccess } from "@/lib/company-scoped-reads";
import type { DeviationRecord } from "@/lib/deviation-store";
import PrintReportButton from "./print-report-button";
import "./report.css";

export const metadata = { title: "Relatório de desvios — SST Hoje" };

const kindLabel = { deviation: "Desvio", near_miss: "Quase incidente" } as const;
const statusLabel = { open: "Aberto", in_review: "Em tratamento", closed: "Encerrado" } as const;
const actionLabel = { reported: "Relato registrado", status_changed: "Situação atualizada", ai_reviewed: "Rascunho de IA revisado" } as const;

function day(value: string) {
  const [year, month, date] = value.split("-");
  return `${date}/${month}/${year}`;
}
function moment(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

export default function Page() {
  return <Suspense fallback={<main className="auth-loading">Abrindo relatório de desvios…</main>}><Report /></Suspense>;
}

async function Report() {
  await connection();
  const access = await getCurrentTenantAccess("deviation.manage");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const { tenant } = access.context;
  const companies = scopeClientCompanies(access.context, await listClientCompanies(tenant.id));
  const records = listDeviationsForAccess(access.context, { userId: access.session.userId, canManage: true });

  const groups = new Map<string, DeviationRecord[]>();
  for (const record of records) {
    const company = companies.find((item) => item.id === record.companyId);
    const unit = company?.units.find((item) => item.id === record.unitId);
    const label = company ? `${company.tradeName || company.legalName}${unit ? ` · ${unit.name}` : ""}` : "Sem empresa/unidade informada";
    groups.set(label, [...(groups.get(label) ?? []), record]);
  }
  const total = (status: keyof typeof statusLabel) => records.filter((record) => record.status === status).length;
  const kinds = (kind: keyof typeof kindLabel) => records.filter((record) => record.kind === kind).length;
  const groupsOrdered = [...groups.entries()].sort(([left], [right]) => left === "Sem empresa/unidade informada" ? 1 : right === "Sem empresa/unidade informada" ? -1 : left.localeCompare(right, "pt-BR"));

  return <main className="deviation-report">
    <Link href="/desvios">Voltar aos desvios</Link>
    <h1>Relatório de desvios e quase incidentes</h1>
    <p className="report-meta">{tenant.name} · posição gerada em {moment(new Date().toISOString())} (Brasília).</p>
    <p className="report-control"><PrintReportButton /></p>
    <div className="report-note">
      <p>Consolidação apenas leitura dos relatos registrados neste ambiente de demonstração. O relato é uma informação declarada por quem registrou: o sistema não classifica gravidade, não apura causa e não atesta conformidade. A foto e as assinaturas são dados pessoais; retenção e base legal seguem pendentes de decisão.</p>
      <p>Armazenamento local de demonstração, sem criptografia. Use somente dados fictícios. Para salvar esta posição em PDF, use a impressão do navegador.</p>
    </div>

    <table className="report-summary">
      <caption>Situação atual dos relatos</caption>
      <thead><tr><th scope="col">Situação</th><th scope="col">Quantidade</th></tr></thead>
      <tbody>
        <tr><th scope="row">Aberto</th><td>{total("open")}</td></tr>
        <tr><th scope="row">Em tratamento</th><td>{total("in_review")}</td></tr>
        <tr><th scope="row">Encerrado</th><td>{total("closed")}</td></tr>
        <tr><th scope="row">Total</th><td>{records.length}</td></tr>
      </tbody>
    </table>
    <p className="report-meta">Desvio: {kinds("deviation")} · Quase incidente: {kinds("near_miss")}.</p>

    {!records.length && <p>Nenhum relato registrado nesta consultoria até o momento.</p>}

    {groupsOrdered.map(([label, items]) => <section key={label}>
      <h2>{label}</h2>
      <p className="report-meta">{items.length} relato(s) nesta empresa/unidade.</p>
      {items.map((record) => <article key={record.id}>
        <h3>{kindLabel[record.kind]} · {record.location}</h3>
        <p className="report-meta">{statusLabel[record.status]} · ocorrido em {day(record.occurredOn)} · relatado por {record.reporterName}</p>
        <p>{record.description}</p>
        {record.immediateAction && <p><strong>Ação imediata informada:</strong> {record.immediateAction}</p>}
        {record.photo && <p><a href={`/api/deviation-photos/${encodeURIComponent(record.id)}`} target="_blank" rel="noreferrer">Abrir foto anexada</a> · {Math.max(1, Math.round(record.photo.bytes / 1024))} KB</p>}
        {record.ai && <p><strong>Rascunho de IA simulado:</strong> revisado por pessoa identificada antes de salvar{record.review?.editedBeforeSave ? " (texto editado)" : " (texto mantido)"}. A IA não classificou gravidade nem encerrou o relato.</p>}
        <p><strong>Histórico</strong></p>
        <ul>{record.history.map((entry, index) => <li key={index}>{moment(entry.occurredAt)} · {actionLabel[entry.action]}{entry.action === "status_changed" ? `: ${statusLabel[entry.status]}` : ""}{entry.note ? ` · ${entry.note}` : ""}</li>)}</ul>
      </article>)}
    </section>)}
  </main>;
}
