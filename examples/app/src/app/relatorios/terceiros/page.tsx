import { correctionPeriodLabel } from "@/lib/correction-period";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { listThirdPartyInvitations } from "@/lib/third-party-service";
import { listComplianceEvaluationsForTenant } from "@/lib/compliance-store";
import { brasiliaDate, buildThirdPartyReport } from "@/lib/third-party-report";
import "./report.css";

const results = { atende: "Atende ao critério", pendente: "Pendente", inconclusivo: "Inconclusivo", nao_aplicavel: "Não aplicável" };
const statuses = { open: "Correção solicitada", awaiting_review: "Aguardando reavaliação", resolved: "Resolvida" };
function date(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)); }
function dateOnly(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
const validityLabels = { not_received: "não recebida", not_informed: "não informada", current: "vigente na data de referência", expired: "vencida na data de referência" };

export default function ReportPage() {
  return <Suspense fallback={<main>Carregando relatório…</main>}><Report /></Suspense>;
}

async function Report() {
  await connection();
  const access = await getCurrentTenantAccess("thirdparty.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context || !hasTenantPermission(access.context.membership.role, "documents.review")) redirect("/sem-acesso");
  const { tenant } = access.context;
  const asOfDate = brasiliaDate();
  const groups = buildThirdPartyReport(tenant.id, listThirdPartyInvitations(access.session.userId), listComplianceEvaluationsForTenant(tenant.id), asOfDate);
  return <main className="contractor-report"><Link href="/?section=terceiros">Voltar ao painel</Link><h1>Relatório de avaliação documental de contratadas</h1>
    <p><Link href="/integracoes/terceiros">Abrir relatório de mobilização</Link></p>
    <p>Posição dos registros em {date(new Date(`${asOfDate}T12:00:00-03:00`).toISOString())} (Brasília). Demonstração local.</p>
    <p>Consolidação das avaliações humanas registradas por critério. Recebimento e resultado “Atende” em um critério não representam aprovação global nem liberação para integração. Use a impressão do navegador para salvar esta posição em PDF.</p>
    <p>A validade é declarada manualmente no envio e não autentica o PDF nem comprova conformidade. Confirme a informação no documento; ela não libera a integração.</p>
    {!groups.length && <p>Nenhuma solicitação disponível nesta consultoria.</p>}
    {groups.map((group, index) => <section key={index}><h2>{group.contractorName}</h2><p>CNPJ fictício: {group.contractorCnpj} · Cliente: {group.companyName} · Unidade: {group.unitName}</p><p>Escopo: {group.scope || "Não informado no convite legado; mantido separado."}</p>
      {group.rows.map((row) => <article key={row.kind}><h3>{row.kind}</h3><p>{row.current ? `${row.current.fileName} · recebido em ${date(row.current.receivedAt)} · ${row.versions} versão(ões) preservada(s)` : "Aguardando envio"}</p>
        {row.current && <p>Protocolo da versão atual: {row.current.id}</p>}
        <p>Validade informada pela contratada: {row.current?.validUntil ? `${dateOnly(row.current.validUntil)} · ${validityLabels[row.validityStatus]}` : validityLabels[row.validityStatus]}.</p>
        {!row.reviews.length && <p>Avaliação da versão atual: não registrada.</p>}
        {row.reviews.map((review) => <div key={review.id}><p><strong>{review.criterion} · v{review.criterionVersion}: {results[review.result]}</strong></p><p>Avaliado em {date(review.evaluatedAt)} · Responsável: {review.responsible}</p><p>Próximo passo: {review.nextStep || "Não registrado"}</p></div>)}
        {row.issues.map((issue) => <div key={issue.id}><p><strong>Pendência: {statuses[issue.status]}</strong> · Responsável (identificador): {issue.responsible}</p><p>Correção solicitada: {issue.requestedChange}</p><p>{correctionPeriodLabel(issue.correctionPeriod)}</p><p>Protocolo relacionado: {issue.receiptId}</p></div>)}
      </article>)}
      {group.medicalAsoRequired && <p><strong>ASO: requisito médico separado.</strong> Avaliação de trabalhadores terceiros ainda não disponível neste fluxo; situação médica não consolidada.</p>}
    </section>)}
  </main>;
}
