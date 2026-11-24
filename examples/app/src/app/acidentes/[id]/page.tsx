import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { accidentPendencies, getAccident } from "@/lib/accident-store";
import { ACCIDENT_STATUS_LABEL, ACCIDENT_TYPE_LABEL, CAT_TYPE_LABEL, TRANSMISSION_CHANNEL_LABEL, formatDateBR } from "@/lib/accident-labels";
import { appendAuditEvent } from "@/lib/audit-log";
import { canAccessCompanyResource } from "@/lib/client-company-scope";
import { listClientCompanies } from "@/lib/client-service";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import PrintCatButton from "./print-cat-button";
import "./cat.css";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<main className="auth-loading">Abrindo CAT…</main>}><CatDocument params={params}/></Suspense>;
}

async function CatDocument({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const access = await getCurrentTenantAccess("accident.report");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");

  const { id } = await params;
  const { tenant, membership } = access.context;
  const canManage = (await getCurrentTenantAccess("accident.manage")).context !== null;
  const canSeeSensitive = (await getCurrentTenantAccess("accident.sensitive.read")).context !== null;
  const record = getAccident(tenant.id, id, canSeeSensitive);
  if (!record || (!canManage && record.createdByUserId !== access.session.userId)
    || !canAccessCompanyResource(access.context, record)) notFound();

  const company = (await listClientCompanies(tenant.id)).find((item) => item.id === record.companyId);
  const unit = company?.units.find((item) => item.id === record.unitId);
  const pending = accidentPendencies(record);
  const medical = canSeeSensitive ? record.medical : undefined;
  appendAuditEvent({ tenantId: tenant.id, actorUserId: access.session.userId, actorRole: membership.role, action: "accident.cat_read", targetId: id });

  return <main className="cat-document">
    <Link href="/acidentes">Voltar para acidentes</Link>
    <h1>CAT — dados para transmissão</h1>
    <p className="cat-meta">{CAT_TYPE_LABEL[record.catType]} · {ACCIDENT_STATUS_LABEL[record.status]}</p>
    <p className="cat-meta">Protocolo interno {record.protocol}</p>
    <p className="cat-note">Demonstração. Use dados fictícios. O cliente transmite a CAT no canal oficial e informa o número do comprovante no SST Hoje.</p>
    {canSeeSensitive && <div className="cat-control"><PrintCatButton/></div>}
    <section>
      <h2>Empresa e trabalhador</h2>
      <dl>
        <dt>Empresa</dt><dd>{company?.legalName || "Cadastro indisponível"}</dd>
        <dt>Unidade</dt><dd>{unit?.name || "Cadastro indisponível"}</dd>
        <dt>Trabalhador</dt><dd>{record.workerName}</dd>
        <dt>Documento</dt><dd>{record.workerDocument || "Não informado"}</dd>
        <dt>Função</dt><dd>{record.workerRole || "Não informada"}</dd>
      </dl>
    </section>
    <section>
      <h2>Acidente</h2>
      <dl>
        <dt>Tipo</dt><dd>{ACCIDENT_TYPE_LABEL[record.type]}</dd>
        <dt>Data e hora</dt><dd>{formatDateBR(record.occurredOn)} {record.occurredAtTime}</dd>
        <dt>Local</dt><dd>{record.location}</dd>
        <dt>Descrição</dt><dd>{record.description}</dd>
        <dt>Houve afastamento</dt><dd>{record.hadLeave ? "Sim" : "Não"}</dd>
        <dt>Último dia trabalhado</dt><dd>{formatDateBR(record.lastWorkDay) || "Não informado"}</dd>
        <dt>Houve óbito</dt><dd>{record.death ? formatDateBR(record.deathDate) || "Sim, data pendente" : "Não"}</dd>
        {record.previousCatNumber && <><dt>CAT de origem</dt><dd>{record.previousCatNumber}</dd></>}
      </dl>
    </section>
    {medical && <section>
      <h2>Atestado médico</h2>
      <dl>
        <dt>Profissional</dt><dd>{medical.doctorName}</dd>
        <dt>Registro profissional (CRM/UF)</dt><dd>{medical.crm}/{medical.crmUf}</dd>
        <dt>Data do atendimento</dt><dd>{formatDateBR(medical.attendedOn)}</dd>
        <dt>Código do diagnóstico (CID)</dt><dd>{medical.cid || "Não informado"}</dd>
        <dt>Dias de afastamento</dt><dd>{medical.daysOff ?? "Não informado"}</dd>
      </dl>
    </section>}
    {pending.length > 0 && <section className="cat-pending">
      <h2>Pendências</h2>
      <ul>{pending.map((item) => <li key={item.key}>{item.label}</li>)}</ul>
    </section>}
    {record.transmission && <section>
      <h2>Comprovante informado</h2>
      <dl>
        <dt>Canal</dt><dd>{TRANSMISSION_CHANNEL_LABEL[record.transmission.channel]}</dd>
        <dt>Número</dt><dd>{record.transmission.number}</dd>
      </dl>
    </section>}
  </main>;
}

