import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { getWorkPermitDraftRevisionsPair } from "@/lib/work-permit-draft-store";
import { WORK_PERMIT_SOURCE_FIELD_MAPS } from "@/lib/work-permit-source-field-maps";
import { compareWorkPermitDraftRevisions } from "@/lib/work-permit-draft-comparison";

type Params = Promise<{ draft?: string; left?: string; right?: string }>;

export default function Page({ searchParams }: { searchParams: Params }) {
  return <Suspense fallback={<main className="auth-loading">Comparando revisões…</main>}><Cmp searchParams={searchParams} /></Suspense>;
}

async function Cmp({ searchParams }: { searchParams: Params }) {
  await connection();
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const p = await searchParams;
  const ok = typeof p.draft === "string" && p.draft.length > 0 && p.draft.length <= 36
    && typeof p.left === "string" && /^[1-9]\d{0,9}$/.test(p.left)
    && typeof p.right === "string" && /^[1-9]\d{0,9}$/.test(p.right);
  const pair = ok ? await getWorkPermitDraftRevisionsPair(access.context.tenant.id, p.draft!, Number(p.left), Number(p.right)) : null;
  const src = pair ? WORK_PERMIT_SOURCE_FIELD_MAPS.find((x) => x.id === pair.mapId) : null;
  const a = pair?.left; const b = pair?.right;
  if (!pair || !src || !a || !b) {
    return <main className="main-area" style={{ marginLeft: 0 }}><div className="content-wrap">
      <Link className="secondary-button" href="/permissoes-trabalho">Voltar</Link>
      <section className="panel pgr-section"><h1>Comparação de revisões</h1><p role="status">Comparação indisponível nesta consultoria. Volte aos rascunhos e escolha duas versões distintas com conteúdo histórico disponível.</p></section>
    </div></main>;
  }
  const { older, newer, changes } = compareWorkPermitDraftRevisions(pair);
  return <main className="main-area" style={{ marginLeft: 0 }}><div className="content-wrap">
    <Link className="secondary-button" href="/permissoes-trabalho">Voltar aos rascunhos</Link>
    <section className="panel pgr-section"><h1>Comparação v{older.revision} × v{newer.revision} · {src.title}</h1>
      <p className="document-warning">Somente leitura. Demonstração; não representa revisão técnica, assinatura ou liberação.</p>
      <p>Rótulos e seções usam o mapa atual do formulário. A comparação não inclui o conteúdo da APR referenciada.</p>
      {changes.length === 0 ? <p>Sem alterações de conteúdo entre as versões selecionadas.</p> : <div style={{ overflowX: "auto" }} tabIndex={0} role="region" aria-label="Campos alterados entre revisões"><table className="pgr-table"><caption>{changes.length} campo(s) alterado(s)</caption><thead><tr><th scope="col">Seção</th><th scope="col">Campo</th><th scope="col">Versão {older.revision} · antes</th><th scope="col">Versão {newer.revision} · depois</th></tr></thead><tbody>
        {changes.map((change) => <tr key={change.key}><td>{change.section}</td><th scope="row">{change.label}</th><td style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{change.before || "Não preenchido"}</td><td style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{change.after || "Não preenchido"}</td></tr>)}
      </tbody></table></div>}
    </section></div></main>;
}
