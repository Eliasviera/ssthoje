"use client";

import { useActionState, useState } from "react";
import type { ClientCompany } from "@/lib/client-store";
import type { InvitationSummary } from "@/lib/third-party-store";
import { THIRD_PARTY_DOCUMENT_KINDS } from "@/lib/third-party-policy";
import { createInvitationAction, revokeInvitationAction, renewInvitationAction, type InvitationFormState } from "./third-party-actions";

function date(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)); }
function streamKey(invite: InvitationSummary, kind: string) { return `${invite.companyId}|${invite.unitId}|${invite.contractorCnpj}|${invite.scope?.trim().toLocaleLowerCase("pt-BR") || invite.id}|${kind}`; }
function InviteForm({ companies }: { companies: ClientCompany[] }) {
  // Wrapper no cliente: o resultado anterior com o link nunca volta como argumento à ação do servidor.
  const [state, action, pending] = useActionState(async (_previous: InvitationFormState, data: FormData) => createInvitationAction(data), {});
  const [copyMessage, setCopyMessage] = useState("");
  const [selectedCompanyUnit, setSelectedCompanyUnit] = useState("");
  const [selectedRequested, setSelectedRequested] = useState<string[]>([]);
  const [medicalAsoRequired, setMedicalAsoRequired] = useState(false);
  if (!companies.some(c => c.status === "active")) return <p className="permission-note">Cadastre uma empresa e unidade ativas antes de criar um convite.</p>;
  return <><form action={action} className="pgr-form thirdparty-form">
    <div className="form-field"><label htmlFor="third-company">Cliente e unidade relacionada</label><select id="third-company" name="companyUnit" required value={selectedCompanyUnit} onChange={(event) => { const value = event.target.value; setSelectedCompanyUnit(value); const [companyId] = value.split("|"); const selectedCompany = companies.find((company) => company.id === companyId); const policy = selectedCompany?.thirdPartyRequirements ?? []; setSelectedRequested(policy.filter((kind) => THIRD_PARTY_DOCUMENT_KINDS.includes(kind as typeof THIRD_PARTY_DOCUMENT_KINDS[number]))); setMedicalAsoRequired(policy.includes("ASO")); }}><option value="" disabled>Selecione</option>{companies.filter(c => c.status === "active").flatMap(c => c.units.map(u => <option key={u.id} value={`${c.id}|${u.id}`}>{c.tradeName || c.legalName} · {u.name} · {u.cnpj}</option>))}</select></div>
    <div className="form-field"><label htmlFor="third-name">Nome da empresa contratada fictícia</label><input id="third-name" name="contractorName" required maxLength={140}/></div>
    <div className="form-field"><label htmlFor="third-cnpj">CNPJ fictício da contratada</label><input id="third-cnpj" name="contractorCnpj" required inputMode="numeric" maxLength={24} placeholder="14 dígitos fictícios"/></div>
    <div className="form-field pgr-wide"><label htmlFor="third-scope">Escopo / atividade contratada</label><input id="third-scope" name="scope" required maxLength={240} placeholder="Ex.: montagem de estruturas e trabalho em altura"/><p className="aso-help">Identifica a atividade para relacionar documentos, riscos e versões deste contrato.</p></div>
    <div className="form-field"><label htmlFor="third-expiry">Duração técnica do link</label><select id="third-expiry" name="expiresInHours" defaultValue="24"><option value="1">1 hora</option><option value="24">24 horas</option><option value="168">7 dias</option></select><p className="aso-help">Controla somente o acesso ao portal; não é prazo legal de entrega ou validade documental.</p></div>
    <fieldset className="aso-exams pgr-wide"><legend>Documentos não médicos · link público</legend><div className="thirdparty-checks">{THIRD_PARTY_DOCUMENT_KINDS.map(kind => <label key={kind}><input type="checkbox" name="requested" value={kind} checked={selectedRequested.includes(kind)} onChange={(event) => setSelectedRequested((current) => event.target.checked ? [...current, kind] : current.filter((item) => item !== kind))}/>{kind}</label>)}</div></fieldset>
    <label className="thirdparty-medical-policy"><input type="checkbox" name="medicalAsoRequired" value="true" checked={medicalAsoRequired} onChange={(event) => setMedicalAsoRequired(event.target.checked)}/> ASO dos trabalhadores terceiros · revisão médica restrita, relacionada às atividades e aptidões previstas no PGR/PCMSO do terceiro; não será enviado por este link</label>
    {state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}
    <div className="pgr-form-footer"><p>O link permite envio sem login exclusivamente para esta solicitação. Use somente dados e PDFs fictícios.</p><button className="primary-button" disabled={pending}>{pending ? "Criando…" : "Criar link de envio"}</button></div>
  </form>{state.success && <div className="permission-note" role="status"><p>{state.success}</p>{state.link && <div className="pcmso-buttons"><a className="primary-button" href={state.link} target="_blank" rel="noreferrer">Abrir portal de demonstração</a><button className="secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}${state.link}`); setCopyMessage("Link local copiado."); } catch { setCopyMessage("Abra o portal e copie o endereço na barra do navegador."); } }}>Copiar link local</button></div>}<p>{copyMessage}</p></div>}</>;
}
function RevokeForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(async (_previous: InvitationFormState, data: FormData) => revokeInvitationAction(data), {});
  return <form action={action}><input type="hidden" name="invitationId" value={id}/><button className="secondary-button" disabled={pending}>Revogar link</button>{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}</form>;
}
function RenewForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(async (_previous: InvitationFormState, data: FormData) => renewInvitationAction(data), {});
  return <div><form action={action}><input type="hidden" name="invitationId" value={id}/><button className="secondary-button" disabled={pending}>Gerar novo link local · 24 horas</button></form><p>Invalida o endereço anterior. PDFs e pendências permanecem preservados.</p>{state.error && <p role="alert">{state.error}</p>}{state.success && <div role="status"><p>{state.success}</p>{state.link && <a className="primary-button" href={state.link} target="_blank" rel="noreferrer">Abrir portal atualizado</a>}</div>}</div>;
}
export default function ThirdPartySection({ invitations, companies, canManage, canReview = false }: { invitations: InvitationSummary[]; companies: ClientCompany[]; canManage: boolean; canReview?: boolean }) {
  const [initiallyOpen] = useState(invitations.length === 0);
  const supersededReceiptIds = new Set(invitations.flatMap((invite) => invite.receipts.map((receipt) => receipt.replacesReceiptId).filter((id): id is string => Boolean(id))));
  const latestReceiptByStream = new Map<string, { id: string; receivedAt: string }>();
  for (const invite of invitations) for (const receipt of invite.receipts) {
    const stream = streamKey(invite, receipt.kind);
    const current = latestReceiptByStream.get(stream);
    if (!current || current.receivedAt.localeCompare(receipt.receivedAt) < 0) latestReceiptByStream.set(stream, { id: receipt.id, receivedAt: receipt.receivedAt });
  }
  return <section className="panel pgr-section pcmso-section thirdparty-section" aria-labelledby="thirdparty-heading"><div className="panel-heading"><div><h2 id="thirdparty-heading">Terceiros · envio documental</h2><p>Solicite documentos existentes e acompanhe o recebimento.</p></div><span className="period-label">Demonstração local</span></div>
    <div className="document-warning"><strong>Somente dados e PDFs fictícios, sem conteúdo médico.</strong> Receber um arquivo não significa aprová-lo. Quem possui o link pode enviar; o convite não comprova a identidade de uma pessoa.</div>
    {canReview && <p><a className="secondary-button" href="/relatorios/terceiros">Abrir relatório de avaliação documental</a></p>}
    {canManage ? <details className="aso-new" open={initiallyOpen}><summary>Novo convite para empresa contratada</summary><InviteForm companies={companies}/></details> : <p className="permission-note">Seu perfil pode acompanhar e baixar recebimentos. A administradora cria e revoga os links.</p>}
    <div className="pgr-records"><h3>Solicitações e recebimentos</h3>{invitations.length ? invitations.map(invite => <article className="pgr-card" key={invite.id}><header><div><h4>{invite.contractorName}</h4><p>CNPJ fictício: {invite.contractorCnpj}</p><p>Cliente: {invite.companyName} · {invite.unitName} · CNPJ relacionado: {invite.relatedCnpj}</p>{invite.scope && <p>Escopo: {invite.scope}</p>}</div><span className="period-label">{invite.linkStatus === "revoked" ? "Link revogado" : invite.linkStatus === "expired" ? "Link expirado" : "Link ativo"}</span></header>
      <p>Expiração técnica: {date(invite.expiresAt)} (Brasília)</p><ul className="thirdparty-requested">{invite.requested.map(kind => { const stream = streamKey(invite, kind); return <li key={kind}><strong>{kind}</strong> · {latestReceiptByStream.has(stream) ? "Recebido — aguarda avaliação humana" : "Aguardando envio"}</li>; })}{invite.medicalAsoRequired && <li><strong>ASO dos trabalhadores terceiros</strong> · avaliação médica restrita, conferindo aptidões com atividades e riscos do PGR/PCMSO do terceiro; fora do link público</li>}</ul>
      {invite.receipts.map(r => { const stream = streamKey(invite, r.kind); const current = !supersededReceiptIds.has(r.id) && latestReceiptByStream.get(stream)?.id === r.id; return <div className="thirdparty-receipt" key={r.id}><p><strong>{r.kind}</strong> · {r.fileName} · {date(r.receivedAt)} (Brasília) · {current ? "Versão atual, aguardando avaliação humana" : "Histórico preservado · versão substituída"}</p><p>Protocolo: {r.id}</p><a className="secondary-button" href={`/api/third-party-files/${r.id}`}>Baixar PDF recebido</a></div>; })}
      {(invite.issues ?? []).some(i => i.status !== "resolved") && <p className="permission-note">Há correção ou reavaliação em andamento. Acompanhe na área Pendências.</p>}
      {canManage && !invite.revokedAt && <div className="thirdparty-management"><RenewForm id={invite.id}/><RevokeForm id={invite.id}/></div>}
    </article>) : <p className="client-empty">Nenhuma solicitação criada nesta consultoria.</p>}</div>
  </section>;
}
