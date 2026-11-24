"use client";
import { useActionState, useState } from "react";
import { PLANS, OPTIONAL_MODULES, planTotals, type PlanAccount, type PlanConfig } from "@/lib/plan-catalog";
import { masterAction, type MasterActionState } from "./actions";
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
export default function PlanPanel({ tenantId, account, storageBytes }: { tenantId: string; account: PlanAccount; storageBytes: number }) {
  const [state, action, pending] = useActionState<MasterActionState, FormData>(masterAction, {});
  const [consume, consumeAction, busy] = useActionState<MasterActionState, FormData>(masterAction, {});
  const [config, setConfig] = useState(account.config);
  const totals = planTotals(config), current = planTotals(account.config);
  const hidden = <><input type="hidden" name="tenantId" value={tenantId}/><input type="hidden" name="revision" value={account.revision}/></>;
  const confirmation = <><label>Justificativa fictícia<textarea name="reason" maxLength={600} required/></label><label className="platform-check"><input type="checkbox" name="acknowledged" required/>Revisei os valores e o efeito desta alteração.</label></>;
  const message = (value: MasterActionState) => value.error ? <p role="alert" className="platform-error">{value.error}</p> : value.success ? <p role="status">{value.success}</p> : null;
  return <details><summary>Planos e créditos · simulação</summary>
    <p><strong>{PLANS[account.config.plan].name}</strong> · {account.config.cycle === "monthly" ? "Mensal" : "Anual"}</p>
    <p>PDFs armazenados: {(storageBytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} MB ({storageBytes.toLocaleString("pt-BR")} bytes). Reserva simulada: {account.storageUsedMB} MB. Limite total: {current.storageMB} MB. Créditos de IA simulados: {account.creditsUsed}/{current.credits}.</p>
    <p>Preços ilustrativos e adicionais sem preço. Limites de cadastros e de PDFs são aplicados no servidor; versões antigas e arquivos arquivados ocupam espaço. A reserva simulada também ocupa a cota. Ajustes manuais do M15 valem até a próxima alteração de plano.</p>
    <form action={action} aria-busy={pending} key={account.revision}>{hidden}<input type="hidden" name="operation" value="configure"/>
      <label>Plano<select name="plan" value={config.plan} onChange={e => setConfig({ ...config, plan: e.target.value as PlanConfig["plan"] })}>{Object.entries(PLANS).map(([id, plan]) => <option value={id} key={id}>{plan.name}</option>)}</select></label>
      <label>Ciclo<select name="cycle" value={config.cycle} onChange={e => setConfig({ ...config, cycle: e.target.value as PlanConfig["cycle"] })}><option value="monthly">Mensal</option><option value="annual">Anual</option></select></label>
      <fieldset><legend>Módulos e operações habilitados</legend><p>Desmarcar bloqueia novas operações dos módulos aplicáveis. Consulta de registros e comprovantes permanece disponível aos perfis autorizados. A habilitação não amplia as permissões do perfil.</p>{Object.entries(OPTIONAL_MODULES).map(([id, label]) => <label className="platform-check" key={id}><input type="checkbox" name="enabledModules" value={id} defaultChecked={!(account.config.disabledModules ?? []).includes(id as keyof typeof OPTIONAL_MODULES)}/>{label}</label>)}</fieldset>
      <fieldset><legend>Adicional de treinamentos</legend><p>Marque após a contratação para atualizar o status comercial. Este controle não libera o LMS, não configura preço e não gera cobrança.</p><label className="platform-check"><input type="checkbox" name="trainingAddonActive" defaultChecked={account.config.trainingAddonActive === true}/>Adicional contratado</label></fieldset>
      <div className="platform-columns">{([ ["extraCompanies", "Empresas adicionais"], ["extraWorkers", "Trabalhadores adicionais"], ["extraStorageMB", "Armazenamento adicional (MB)"], ["extraCredits", "Créditos adicionais"] ] as const).map(([key, label]) => <label key={key}>{label}<input name={key} type="number" min="0" max="9000" step="1" required value={config[key]} onChange={e => setConfig({ ...config, [key]: Number(e.target.value) })}/></label>)}</div>
      <p aria-live="polite">Prévia: {totals.companies} empresas · {totals.workers} trabalhadores · {totals.storageMB} MB · {totals.credits} créditos. Base: {money(totals.price)}/{config.cycle === "monthly" ? "mês" : "ano"}. Módulos propostos: {PLANS[config.plan].modules}.</p>
      {confirmation}<button disabled={pending}>{pending ? "Registrando…" : "Aplicar configuração do plano"}</button>{message(state)}
    </form>
    <details><summary>Simular consumo</summary><p>O consumo é acumulado, sem renovação automática ou reposição ao trocar o ciclo. Nenhum arquivo é enviado e nenhuma IA é chamada.</p><form action={consumeAction} aria-busy={busy}>{hidden}<input type="hidden" name="operation" value="consume"/><div className="platform-columns"><label>Armazenamento (MB)<input name="storageMB" type="number" min="0" max="100000" step="1" defaultValue="0" required/></label><label>Créditos de IA<input name="credits" type="number" min="0" max="100000" step="1" defaultValue="1" required/></label></div>{confirmation}<button disabled={busy}>{busy ? "Registrando…" : "Registrar consumo simulado"}</button>{message(consume)}</form></details>
  </details>;
}
