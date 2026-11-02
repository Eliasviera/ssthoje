import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { getWorkPermitDraftRevision } from "@/lib/work-permit-draft-store";
import { WORK_PERMIT_SOURCE_FIELD_MAPS } from "@/lib/work-permit-source-field-maps";

type Params = Promise<{ draft?: string; revision?: string }>;
export default function Page({ searchParams }: { searchParams: Params }) {
  return <Suspense fallback={<main className="auth-loading">Consultando revisão…</main>}><History searchParams={searchParams}/></Suspense>;
}
async function History({ searchParams }: { searchParams: Params }) {
  await connection();
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const params = await searchParams;
  const valid = typeof params.draft === "string" && params.draft.length > 0 && params.draft.length <= 36
    && typeof params.revision === "string" && /^[1-9]\d{0,9}$/.test(params.revision);
  const entry = valid ? await getWorkPermitDraftRevision(access.context.tenant.id, params.draft!, Number(params.revision)) : null;
  const source = WORK_PERMIT_SOURCE_FIELD_MAPS.find((item) => item.id === entry?.mapId);
  return <main className="main-area" style={{ marginLeft: 0 }}><div className="content-wrap">
    <Link className="secondary-button" href="/permissoes-trabalho">Voltar aos rascunhos</Link>
    <section className="panel pgr-section"><h1>Revisão histórica de PT/PTE</h1>
      <p className="document-warning">Somente leitura. Este registro preserva um salvamento demonstrativo; não representa revisão técnica, assinatura ou liberação de atividade.</p>
      {!entry || !source ? <p role="status">Revisão indisponível nesta consultoria. Retorne aos rascunhos para consultar as versões disponíveis.</p> : <>
        <h2>{entry.title}</h2><p>{source.title} · versão {entry.revision} · {new Date(entry.occurredAt).toLocaleString("pt-BR")}</p>
        <p>APR registrada nesta versão: {entry.aprId ? "há referência salva; o conteúdo da APR não faz parte deste histórico" : "nenhuma"}.</p>
        <p><Link className="secondary-button" href={`/permissoes-trabalho?draft=${encodeURIComponent(params.draft!)}#permit-form-${entry.mapId}`}>Abrir versão atual para edição</Link></p>
        {source.sections.map((section) => {
          const fields = section.fields.map((field) => ({ label: field.label, value: entry.values[`${section.id}.${field.id}`] })).filter((field) => field.value);
          return fields.length ? <section key={section.id}><h3>{section.title}</h3><dl>{fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd style={{ whiteSpace: "pre-wrap" }}>{field.value}</dd></div>)}</dl></section> : null;
        })}
      </>}
    </section></div></main>;
}
