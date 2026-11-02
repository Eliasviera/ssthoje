"use client";
import { useActionState } from "react";
import Link from "next/link";
import { logoutAction } from "../actions";
import { masterAction, type MasterActionState } from "./actions";
import type { PlatformOverview } from "@/lib/platform-store";
import "./master.css";
import PlanPanel from "./plan-panel";
import BillingPanel from "./billing-panel";
import type { BillingAccount } from "@/lib/billing-types";

const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
const statusLabel = (value: string) => value === "active" ? "Ativa" : "Suspensa";
type MasterNavIconName = "governance" | "operations" | "integrations" | "content" | "public";
function MasterNavIcon({ name }: { name: MasterNavIconName }) {
  const common = { "aria-hidden": true as const, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "governance") return <svg {...common}><path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg>;
  if (name === "operations") return <svg {...common}><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>;
  if (name === "integrations") return <svg {...common}><path d="M8 7V4m8 3V4M6 8h12v9H6z"/><path d="M9 17v3m6-3v3M9 11h2m2 0h2"/></svg>;
  if (name === "content") return <svg {...common}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8m-8 4h6"/></svg>;
  return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18m-13 5h4"/></svg>;
}
function TenantCard({ tenant, billing }: { tenant: PlatformOverview["tenants"][number]; billing: BillingAccount }) {
  const [state, action, pending] = useActionState<MasterActionState, FormData>(masterAction, {});
  const [support, supportAction, supportPending] = useActionState<MasterActionState, FormData>(masterAction, {});
  return <article className={"platform-card"}>
    <header><div><h2>{tenant.name}</h2><p>Consultoria de demonstração</p></div><span className={tenant.status === "active" ? "platform-active" : "platform-suspended"}>{statusLabel(tenant.status)}</span></header>
    <dl className={"platform-usage"}><div><dt>Empresas ativas</dt><dd>{tenant.usage.companies} <small>/ {tenant.companiesLimit}</small></dd></div><div><dt>Trabalhadores ativos</dt><dd>{tenant.usage.workers} <small>/ {tenant.workersLimit}</small></dd></div><div><dt>Vínculos ativos</dt><dd>{tenant.usage.members}</dd></div></dl>
    <details><summary>Gerenciar estado e limites</summary>
      <p className={"platform-warning"}>Suspender bloqueia os próximos acessos e ações da consultoria, inclusive links locais de terceiros e EPI. Dados e históricos são preservados. Reativar restaura o acesso; limites valem para novos cadastros e reativações.</p>
      <form action={action} aria-busy={pending} key={`${tenant.status}:${tenant.companiesLimit}:${tenant.workersLimit}`}>
        <input type="hidden" name="operation" value="settings"/><input type="hidden" name="tenantId" value={tenant.id}/>
        <input type="hidden" name="expected" value={JSON.stringify({ status: tenant.status, companiesLimit: tenant.companiesLimit, workersLimit: tenant.workersLimit })}/>
        <label>Estado da consultoria<select name="status" defaultValue={tenant.status}><option value="active">Ativa</option><option value="suspended">Suspensa</option></select></label>
        <div className={"platform-columns"}><label>Limite de empresas ativas<input name="companiesLimit" type="number" min="1" max="10000" step="1" defaultValue={tenant.companiesLimit} required/></label><label>Limite de trabalhadores ativos<input name="workersLimit" type="number" min="1" max="100000" step="1" defaultValue={tenant.workersLimit} required/></label></div>
        <label>Justificativa da alteração<textarea name="reason" maxLength={600} required placeholder="Descreva o motivo usando somente dados fictícios."/></label>
        <label className={"platform-check"}><input name="acknowledged" type="checkbox" required/>Revisei o estado, os limites e o efeito sobre os acessos da consultoria.</label>
        <button disabled={pending}>{pending ? "Registrando…" : "Registrar alteração"}</button>
        {state.error ? <p role="alert" className={"platform-error"}>{state.error}</p> : state.success ? <p role="status">{state.success}</p> : null}
      </form>
    </details>
    <PlanPanel tenantId={tenant.id} account={tenant.planAccount} storageBytes={tenant.storageBytes}/>
    <BillingPanel tenantId={tenant.id} account={billing} planAccount={tenant.planAccount}/>
    <details><summary>Diagnóstico de suporte</summary><p>A consulta retorna apenas estado, limites e contagens. A justificativa fica no histórico da plataforma. Não permite entrar como cliente nem consultar seus arquivos.</p>
      <form action={supportAction} aria-busy={supportPending}><input type="hidden" name="operation" value="diagnose"/><input type="hidden" name="tenantId" value={tenant.id}/><label>Justificativa do suporte<textarea name="reason" maxLength={600} required placeholder="Motivo fictício da consulta, sem dados pessoais."/></label><button disabled={supportPending}>{supportPending ? "Consultando…" : "Consultar diagnóstico restrito"}</button></form>
      {support.error ? <p role="alert" className={"platform-error"}>{support.error}</p> : null}
      {support.diagnosis ? <div className={"platform-diagnosis"} role="status"><strong>{support.success}</strong><p>{support.diagnosis.tenantName} · {statusLabel(support.diagnosis.status)}</p><p>Empresas: {support.diagnosis.usage.companies}/{support.diagnosis.companiesLimit} · Trabalhadores: {support.diagnosis.usage.workers}/{support.diagnosis.workersLimit} · Vínculos: {support.diagnosis.usage.members}</p><small>Consulta de {date(support.diagnosis.checkedAt)} (Brasília). Execute novamente para atualizar.</small></div> : null}
    </details>
  </article>;
}
export default function MasterDashboard({ overview, billingOverview }: { overview: PlatformOverview; billingOverview: Record<string, BillingAccount> }) {
  const tenantName = (id: string) => overview.tenants.find(t => t.id === id)?.name ?? "Consultoria";
  const navItems: { href: string; icon: MasterNavIconName; label: string }[] = [
    { href: "/master/governanca", icon: "governance", label: "Governança" },
    { href: "/master/operacao", icon: "operations", label: "Operação" },
    { href: "/master/integracoes", icon: "integrations", label: "Integrações" },
    { href: "/master/conteudo", icon: "content", label: "Conteúdo" },
    { href: "/site", icon: "public", label: "Página pública" },
  ];
  return <main className={"platform-shell"}>
    <header className={"platform-top"}><a className="platform-brand" href="/master" aria-label="SST Hoje — administração">SST <strong>Hoje</strong></a><span className="platform-demo-badge">SaaS Master · demonstração</span><nav className="platform-nav" aria-label="Navegação Master">{navItems.map(item => <a className="platform-navlink" href={item.href} key={item.href}><MasterNavIcon name={item.icon}/><span>{item.label}</span></a>)}</nav><Link className="platform-navlink platform-main-link" href="/?preview=main"><MasterNavIcon name="public"/><span>Painel principal</span></Link><form action={logoutAction}><button>Sair</button></form></header>
    <section className={"platform-intro"}><p>ADMINISTRAÇÃO DA PLATAFORMA</p><h1>Consultorias e acesso</h1><p>Acompanhe o uso, ajuste limites e registre ações de suporte.</p></section>
    <p className={"platform-warning"}>Ambiente local com dados fictícios. Limites técnicos desta demonstração não são planos comerciais. O acesso Master é separado das áreas de SST e dos dados médicos.</p>
    <section className={"platform-stats"} aria-label="Resumo da plataforma"><div><span>Consultorias</span><strong>{overview.tenants.length}</strong></div><div><span>Ativas</span><strong>{overview.tenants.filter(t => t.status === "active").length}</strong></div><div><span>Suspensas</span><strong>{overview.tenants.filter(t => t.status === "suspended").length}</strong></div></section>
    <section className={"platform-grid"} aria-label="Consultorias cadastradas">{overview.tenants.map(tenant => <TenantCard tenant={tenant} billing={billingOverview[tenant.id]} key={tenant.id}/>)}</section>
    <section className={"platform-history"}><h2>Histórico administrativo</h2><p>Últimas 100 alterações e últimas 100 consultas de suporte. Justificativas restritas à plataforma.</p>
      {overview.changes.length ? <ol>{overview.changes.map(change => <li key={change.id}><strong>{tenantName(change.tenantId)} · {date(change.occurredAt)}</strong><p>{statusLabel(change.before.status)} → {statusLabel(change.after.status)} · Empresas: {change.before.companiesLimit} → {change.after.companiesLimit} · Trabalhadores: {change.before.workersLimit} → {change.after.workersLimit}</p><p>{change.reason}</p><small>SaaS Master · conta fictícia</small></li>)}</ol> : <p>Nenhuma alteração registrada.</p>}
      <details><summary>Histórico de planos e consumo · {overview.planEvents.length}</summary>{overview.planEvents.length ? <ol>{overview.planEvents.map(event => <li key={event.id}><strong>{tenantName(event.tenantId)} · {date(event.occurredAt)}</strong><p>Plano: {event.before.config.plan} → {event.after.config.plan} · Ciclo: {event.before.config.cycle} → {event.after.config.cycle}</p><p>Uso: {event.before.storageUsedMB} → {event.after.storageUsedMB} MB · {event.before.creditsUsed} → {event.after.creditsUsed} créditos</p><p>{event.reason}</p><details><summary>Configuração anterior e nova</summary><p>Antes: {JSON.stringify(event.before.config)}</p><p>Depois: {JSON.stringify(event.after.config)}</p></details></li>)}</ol> : <p>Nenhuma simulação registrada.</p>}</details>
      <details><summary>Consultas de suporte · {overview.supportChecks.length}</summary>{overview.supportChecks.length ? <ol>{overview.supportChecks.map(check => <li key={check.id}><strong>{tenantName(check.tenantId)} · {date(check.occurredAt)}</strong><p>{check.reason}</p><small>Diagnóstico restrito · SaaS Master</small></li>)}</ol> : <p>Nenhuma consulta registrada.</p>}</details>
      <details><summary>Eventos da plataforma · últimos 100</summary><ol>{overview.events.map(event => <li key={event.id}><strong>{({ "platform.governance_read": "Governança consultada", "platform.governance_changed": "Governança fictícia alterada", "platform.operations_exported": "Retrato operacional exportado", "platform.jobs_read": "Fila consultada", "platform.job_changed": "Operação fictícia registrada", "platform.integration_read": "Bancada consultada", "platform.integration_run": "Simulação de integração registrada", "platform.overview_read": "Painel administrativo consultado", "platform.billing_read": "Ciclo comercial consultado", "platform.billing_changed": "Evento comercial simulado registrado", "platform.settings_changed": "Estado ou limites alterados", "platform.support_diagnosed": "Diagnóstico restrito consultado", "platform.access_denied": "Acesso administrativo negado", "auth.login_succeeded": "Sessão iniciada", "auth.logout": "Sessão encerrada" } as Record<string, string>)[event.action] ?? "Evento da plataforma"}</strong><p>{date(event.occurredAt)} · {event.actorRole}</p></li>)}</ol></details>
    </section><footer>Sem cobrança real, integrações externas ou exclusão de consultorias nesta etapa.</footer>
  </main>;
}
