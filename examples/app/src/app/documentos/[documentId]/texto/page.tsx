import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listDocumentGroupsForTenant, readDocumentFileForTenant } from "@/lib/document-store";
import { extractFullPdfText, type FullText } from "@/lib/pdf-full-text";
import { buildPgrSourceCandidates } from "@/lib/pgr-source-candidates";

type Props = { params: Promise<{ documentId: string }>; searchParams: Promise<{ pagina?: string }> };
export default function Page({ params, searchParams }: Props) {
  return <Suspense fallback={<main className="auth-loading">Extraindo todas as páginas do documento…</main>}><TextContent params={params} searchParams={searchParams}/></Suspense>;
}
async function TextContent({ params, searchParams }: Props) {
  await connection();
  const access = await getCurrentTenantAccess("documents.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context) notFound();
  const { documentId } = await params;
  const document = listDocumentGroupsForTenant(access.context.tenant.id).flatMap(group => group.versions).find(version => version.id === documentId);
  if (!document) notFound();
  const file = readDocumentFileForTenant(documentId, access.context.tenant.id);
  if (!file) notFound();
  let extraction: FullText | undefined;
  try { extraction = await extractFullPdfText(file.bytes); } catch { /* Do not expose parser internals or document contents in errors. */ }
  const candidates = extraction && document.kind === "PGR" ? buildPgrSourceCandidates(extraction) : undefined;
  const query = await searchParams;
  const selectedPage = Math.max(1, Math.min(extraction?.pageCount ?? 1, /^\d+$/.test(query.pagina ?? "") ? Number(query.pagina) : 1));
  return <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
    <a href={`/empresas/${encodeURIComponent(document.companyId)}?tab=pgr`}>Voltar ao PGR da empresa</a>
    <h1>{document.title} · texto integral</h1>
    <p><a href={`/api/document-files/${encodeURIComponent(documentId)}`}>Baixar PDF original · versão {document.version}</a></p>
    <p>Texto extraído para consulta, sem limite de riscos ou corte de páginas. Consulte uma página por vez ou baixe o texto completo para pesquisar. Tabelas, imagens, assinaturas e ordem de leitura devem ser conferidas no original. A extração não aprova o PGR nem cria riscos, trabalhadores ou avaliações.</p>
    {!extraction ? <p role="alert">Não foi possível extrair este PDF. O original está preservado; pode ser necessário reconhecimento de texto (OCR) ou tratamento do arquivo.</p> : <>
      <p><strong>{extraction.pageCount} páginas</strong> · {extraction.pages.filter(page => page.status === "text").length} com texto · {extraction.pages.filter(page => page.status === "no_text").length} sem texto selecionável · {extraction.pages.filter(page => page.status === "failed").length} com falha.</p>
      <details><summary>Identificação do original (SHA-256)</summary><code style={{ overflowWrap: "anywhere" }}>{extraction.sha256}</code></details>
      {candidates && <section aria-labelledby="candidates-title"><h2 id="candidates-title">Dados encontrados para conferência</h2>
        <p>Leitura por rótulos do documento. Esta lista pode ser parcial em tabelas com outra estrutura. Cada ocorrência mantém sua página; não representa cadastro efetivado, avaliação técnica ou confirmação de vínculo entre função e risco.</p>
        <details><summary>Funções e setores · {candidates.roles.length} ocorrências identificadas</summary><ul>{candidates.roles.map((role, index) => <li key={index}>{role.role}{role.sector ? ` · setor ${role.sector}` : " · setor não identificado"} · <a href={`?pagina=${role.page}#page-${role.page}`}>página {role.page}</a></li>)}</ul></details>
        <details><summary>Linhas de classificação de riscos · {candidates.riskRows.length} ocorrências identificadas</summary><p>Valores são os informados no PDF. Confira as colunas e os vínculos no original, especialmente quando a tabela continua de outra página.</p><ul>{candidates.riskRows.map((risk, index) => <li key={index}>{risk.raw} · <a href={`?pagina=${risk.page}#page-${risk.page}`}>página {risk.page}</a></li>)}</ul></details>
        <details><summary>Plano de ação · {candidates.actionPages.length} páginas identificadas</summary><p>{candidates.actionPages.map(page => <a key={page} href={`?pagina=${page}#page-${page}`} style={{ marginRight: 12 }}>Página {page}</a>)}</p></details>
        <details><summary>Avaliações de exposição · {candidates.exposurePages.length} páginas identificadas</summary><p>{candidates.exposurePages.map(page => <a key={page} href={`?pagina=${page}#page-${page}`} style={{ marginRight: 12 }}>Página {page}</a>)}</p></details>
        <p>As demais informações, controles, anexos e trechos não reconhecidos continuam disponíveis nas páginas abaixo e no PDF original. Ausência nesta lista não significa ausência no documento.</p>
      </section>}
      <p><a href={`/api/document-text/${documentId}`}>Baixar texto completo · todas as páginas</a></p>
      <nav aria-label="Páginas do documento"><p>Página {selectedPage} de {extraction.pageCount}</p>{selectedPage > 1 && <a href={`?pagina=${selectedPage - 1}`}>← Anterior</a>} {selectedPage < extraction.pageCount && <a href={`?pagina=${selectedPage + 1}`}>Próxima →</a>}<details><summary>Ir para uma página</summary><p style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{extraction.pages.map(page => <a key={page.number} href={`?pagina=${page.number}`}>{page.number}</a>)}</p></details></nav>
      {extraction.pages.filter(page => page.number === selectedPage).map(page => <section key={page.number} aria-labelledby={`page-${page.number}`} style={{ borderTop: "1px solid #bbc7bd", marginTop: 28, paddingTop: 12 }}>
        <h2 id={`page-${page.number}`}>Página {page.number}</h2>
        {page.status === "text" ? <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "inherit", lineHeight: 1.65 }}>{page.text}</pre> : <p role="status">{page.status === "failed" ? "Falha de extração nesta página. Consulte o original." : "Sem texto selecionável. Confira imagens e tabelas no original; OCR ainda não executado."}</p>}
      </section>)}
    </>}
  </main>;
}

