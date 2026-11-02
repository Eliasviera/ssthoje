import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { listThirdPartyInvitations, getThirdPartyIntegrationState } from "@/lib/third-party-service";
import PrintReportButton from "./print-report-button";
import "../../relatorios/terceiros/report.css";

function pendingAction(blocker: string) {
  if (blocker.startsWith("ASO")) return "Encaminhar para revisão médica restrita.";
  if (blocker.startsWith("PGR")) return "Revisar o PGR e o escopo informado.";
  if (blocker.startsWith("Treinamento")) return "Enviar ou reavaliar o comprovante de treinamento.";
  return "Regularizar a pendência e registrar uma nova avaliação humana.";
}
function rigorLabel(level: "inform" | "authorization" | "block") {
  return level === "inform" ? "Informar" : level === "authorization" ? "Exigir autorização" : "Bloquear integração";
}
function rigorForPending(levels: Record<string, "inform" | "authorization" | "block">, fallback: "inform" | "authorization" | "block", blocker: string) {
  return levels[blocker.split(":", 1)[0].trim()] ?? fallback;
}

export default function IntegrationPage() {
  return <Suspense fallback={<main>Conferindo requisitos…</main>}><Integration /></Suspense>;
}
async function Integration() {
  await connection();
  const access = await getCurrentTenantAccess("thirdparty.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context || !hasTenantPermission(access.context.membership.role, "documents.review")) redirect("/sem-acesso");
  const invitations = listThirdPartyInvitations(access.session.userId);
  const seen = new Set<string>();
  const scopes = invitations.filter((invite) => { const key = JSON.stringify([invite.companyId, invite.unitId, invite.contractorCnpj, invite.scope?.trim().toLocaleLowerCase("pt-BR") || invite.id]); if (seen.has(key)) return false; seen.add(key); return true; });
  return <main className="contractor-report"><Link href="/relatorios/terceiros">Voltar ao relatório documental</Link><h1>Relatório de mobilização de terceiros</h1><p>Resultado da compilação documental por empresa, unidade, contratada e escopo. O relatório não exibe conteúdo clínico e não confirma aptidão médica.</p><p className="print-control"><PrintReportButton/></p>
    {!scopes.length && <p>Nenhum escopo disponível.</p>}
    {scopes.map((invite) => { const state = getThirdPartyIntegrationState(access.session.userId, invite.id); return <section key={invite.id}><h2>{invite.contractorName}</h2><p>{invite.companyName} · {invite.unitName} · CNPJ fictício {invite.contractorCnpj}</p><p>Escopo: {invite.scope || "Não informado"}</p><p className="mobilization-policy"><strong>Política do cliente:</strong> {rigorLabel(state.rigorPolicy.defaultLevel)} · versão {state.rigorPolicy.version || "não configurada"} · vigente desde {state.rigorPolicy.validFrom?.split("-").reverse().join("/") || "data não registrada"} · revisão: {state.rigorPolicy.reviewer}</p>
      {state.approved && !state.approval?.override ? <div className="mobilization-result mobilization-approved"><h3>Aprovado para integração</h3><p>As verificações documentais atuais e a decisão humana registrada permitem seguir para a integração.</p><p>A mobilização depende do registro da integração.</p></div> : <div className="mobilization-result mobilization-pending"><h3>{state.approval?.override ? "Registro legado não validado" : state.blockers.length ? "Revisão técnica com pendências" : "Documentação consistente"}</h3>{state.approval?.override && <><p>Há uma exceção registrada em versão anterior do sistema. Ela não comprova uma decisão de pessoa autorizada pelo cliente, não libera a mobilização e não permite agendamento.</p><p><strong>Nome informado no registro legado:</strong> {state.approval.override.serviceManager}</p><p><strong>Justificativa registrada:</strong> {state.approval.notes}</p><h4>Pendências incluídas no registro</h4><ul>{state.approval.override.blockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul><p>Esta exceção não confirma aptidão médica nem regularização documental.</p></>}{!state.approval?.override && state.blockers.length ? <><p>{state.blockers.length} {state.blockers.length === 1 ? "pendência identificada" : "pendências identificadas"}. Este resultado técnico não é a decisão gerencial do cliente.</p><ol>{state.blockers.map((blocker) => { const rigor = rigorForPending(state.rigorPolicy.levels, state.rigorPolicy.defaultLevel, blocker); return <li key={blocker}><strong>{blocker}</strong><span>Regra do cliente: {rigorLabel(rigor)}. {pendingAction(blocker)}</span></li>; })}</ol><section className="mobilization-policy"><h4>Decisão do cliente</h4><p>O gestor do contrato ou dono previamente cadastrado deverá decidir entre exigir a adequação antes do ingresso ou autorizar o ingresso com plano de adequação posterior. Uma autorização posterior mantém as pendências e o parecer técnico; não representa conformidade.</p><p>O registro dessa decisão ainda depende da implementação do vínculo e da permissão do decisor do cliente. Até lá, o sistema mantém o bloqueio.</p></section></> : !state.approval?.override && <section className="mobilization-policy"><h4>Decisão do cliente</h4><p>A documentação está consistente. A liberação final continua sendo decisão do gestor do contrato ou dono previamente cadastrado e autorizado.</p><p>O registro autenticado dessa decisão ainda não está implementado neste fluxo.</p></section>}</div>}
    </section>; })}
  </main>;
}

