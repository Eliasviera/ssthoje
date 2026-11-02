"use client";

import RecordStatusForm from "./record-status-form";
import { useActionState, useRef, useState } from "react";
import { createWorkerAction, importWorkersAction } from "./worker-actions";
import type { ClientCompany } from "@/lib/client-store";
import type { WorkerRecord } from "@/lib/worker-store";
import { DEMO_RISK_CATEGORIES } from "@/lib/worker-categories";
import WorkerEditForm from "./worker-edit-form";

const riskDescriptions: Record<(typeof DEMO_RISK_CATEGORIES)[number], string> = {
  Ruído: "Som elevado",
  Ergonômico: "Postura ou esforço",
  Químico: "Agentes químicos",
  Biológico: "Agentes biológicos",
  Acidente: "Possibilidade de acidente",
  Outro: "Outra categoria para revisão técnica",
};

export default function WorkerSection({ workers, companies, canManage, onOpenCompanies }: { workers: WorkerRecord[]; companies: ClientCompany[]; canManage: boolean; onOpenCompanies: () => void }) {
  const [state, formAction, pending] = useActionState(createWorkerAction, {});
  const [importState, saveImportAction, savingImport] = useActionState(importWorkersAction, {});
  const activeCompanies = companies.filter((company) => company.status === "active");
  const [companyId, setCompanyId] = useState(activeCompanies[0]?.id ?? "");
  const selectedCompany = activeCompanies.find((company) => company.id === companyId);
  const activeUnits = selectedCompany?.units ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{companyName?:string;workers:{id:string;name:string;role:string;department:string}[]} | null>(null);
  const [selectedWorkerIds,setSelectedWorkerIds]=useState<string[]>([]);
  const [importError, setImportError] = useState("");

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/workers/import-pdf", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao importar");
      const extractedWorkers=(data.extracted?.workers??[]).map((worker:{id:string;name?:string;role?:string;department?:string})=>({id:worker.id,name:worker.name??"",role:worker.role??"",department:worker.department??""}));
      setImportResult({companyName:data.extracted?.companyName,workers:extractedWorkers});
      setSelectedWorkerIds(extractedWorkers.filter((worker:{name:string;role:string})=>worker.name&&worker.role).map((worker:{id:string})=>worker.id));
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : "Erro ao importar");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return <div className="worker-section">
    {canManage && <section className="panel worker-form-panel" aria-labelledby="worker-import-title" style={{ marginBottom: "1rem" }}>
      <div className="panel-heading"><div><h2 id="worker-import-title">Importar lista de colaboradores em PDF</h2><p>Extraia nome, função e área/setor do PDF do RH. Revise os campos antes de salvar.</p></div></div>
      <div className="worker-data-notice" role="note"><strong>Privacidade:</strong> o arquivo é processado temporariamente e não é guardado. Use somente listas fictícias neste ambiente demonstrativo; não envie dados pessoais reais.</div>
      <div className="worker-form">
        <label className="form-field form-field-wide">
          <span>Arquivo PDF</span>
          <input ref={fileRef} type="file" accept="application/pdf" onChange={handleImport} disabled={importing} />
        </label>
        {importing && <p className="permission-note">Importando e extraindo lista de colaboradores...</p>}
        {importError && <p className="client-form-message client-form-error">{importError}</p>}
        {importResult && <form action={saveImportAction} className="pgr-card" style={{ marginTop: "0.5rem" }}>
          <header><div><h4>Revise e selecione os colaboradores</h4><p>Empresa indicada no PDF: {importResult.companyName || "não identificada"}. Confirme a empresa e a unidade de destino.</p></div></header>
          <input type="hidden" name="workersJson" value={JSON.stringify(importResult.workers.filter(worker=>selectedWorkerIds.includes(worker.id)).map(({name,role,department})=>({name,role,department})))} />
          <label className="form-field">Empresa<select name="companyId" value={companyId} required onChange={event=>setCompanyId(event.target.value)}>{activeCompanies.map(company=><option key={company.id} value={company.id}>{company.tradeName||company.legalName}</option>)}</select></label>
          <label className="form-field">Unidade<select name="unitId" required disabled={!activeUnits.length}>{activeUnits.map(unit=><option key={unit.id} value={unit.id}>{unit.name} · {unit.cnpj}</option>)}</select></label>
          <fieldset className="risk-picker"><legend>Categorias para revisão profissional</legend><p>Aplicadas a todos os colaboradores selecionados; não são inferidas do PDF.</p><div className="risk-options">{DEMO_RISK_CATEGORIES.map(category=><label className="risk-option" key={category}><input type="checkbox" name="riskCategory" value={category}/><span><strong>{category}</strong><small>{riskDescriptions[category]}</small></span></label>)}</div></fieldset>
          <div className="worker-import-review">{importResult.workers.map((worker,index)=><fieldset className="epi-item-fields" key={worker.id}><legend><label><input type="checkbox" checked={selectedWorkerIds.includes(worker.id)} onChange={event=>setSelectedWorkerIds(current=>event.target.checked?[...current,worker.id]:current.filter(id=>id!==worker.id))}/> Importar colaborador {index+1}</label></legend><label className="form-field">Colaborador<input value={worker.name} onChange={event=>setImportResult(current=>current?{...current,workers:current.workers.map(item=>item.id===worker.id?{...item,name:event.target.value}:item)}:current)} required={selectedWorkerIds.includes(worker.id)} maxLength={120}/></label><label className="form-field">Função<input value={worker.role} onChange={event=>setImportResult(current=>current?{...current,workers:current.workers.map(item=>item.id===worker.id?{...item,role:event.target.value}:item)}:current)} required={selectedWorkerIds.includes(worker.id)} maxLength={120}/></label><label className="form-field">Área / setor<input value={worker.department} onChange={event=>setImportResult(current=>current?{...current,workers:current.workers.map(item=>item.id===worker.id?{...item,department:event.target.value}:item)}:current)} maxLength={120}/></label></fieldset>)}</div>
          {importState.error&&<p className="client-form-message client-form-error" role="alert">{importState.error}</p>}{importState.success&&<p className="client-form-message client-form-success" role="status">{importState.success}</p>}
          <div className="worker-form-footer"><p>{selectedWorkerIds.length} selecionado(s). Função e área podem ser ajustadas antes da importação.</p><button className="primary-button" disabled={savingImport||!selectedWorkerIds.length||!activeUnits.length}>{savingImport?"Salvando…":"Importar selecionados"}</button></div>
        </form>}
      </div>
    </section>}
    {!companies.length ? <section className="panel worker-prerequisite"><div className="empty-art"><span className="empty-art-circle">1</span></div><h2>Cadastre uma empresa antes</h2><p>O trabalhador precisa estar vinculado a uma empresa e unidade. Os cadastros fictícios serão separados por consultoria.</p><button className="primary-button" type="button" onClick={onOpenCompanies}>Ir para Empresas</button></section> : canManage ? <section className="panel worker-form-panel" aria-labelledby="worker-form-title">
      <div className="panel-heading"><div><h2 id="worker-form-title">Novo colaborador</h2><p>Cadastre um colaborador fictício, a função e as categorias para revisão técnica.</p></div><span className="period-label">Somente dados fictícios</span></div>
      <div className="worker-data-notice" role="note"><strong>Privacidade:</strong> este arquivo fica sem criptografia. Não informe nomes, dados de contato, documentos pessoais ou informações de saúde reais. As categorias abaixo são exemplos e não substituem avaliação profissional.</div>
      {activeCompanies.length ? <form action={formAction} className="worker-form">
        <div className="form-field"><label htmlFor="worker-name">Colaborador (nome fictício)</label><input id="worker-name" name="displayName" autoComplete="off" required maxLength={120} placeholder="Ex.: Colaborador de demonstração"/></div>
        <div className="form-field"><label htmlFor="worker-sex">Sexo demonstrativo</label><select id="worker-sex" name="sex" defaultValue="Não informado"><option>Não informado</option><option>Feminino</option><option>Masculino</option></select></div>
        <div className="form-field"><label htmlFor="worker-role">Função</label><input id="worker-role" name="jobTitle" required maxLength={120} placeholder="Ex.: Auxiliar de produção"/></div>
        <div className="form-field"><label htmlFor="worker-area">Área / setor (centro de custo)</label><input id="worker-area" name="area" maxLength={120} placeholder="Ex.: Produção, Manutenção"/></div>
        <div className="form-field"><label htmlFor="worker-nr35-training">Treinamento NR-35</label><select id="worker-nr35-training" name="nr35TrainingStatus" defaultValue="not_informed"><option value="not_informed">Não informado</option><option value="reported_pending_validation">Informado · pendente de validação</option></select></div>
        <div className="form-field"><label htmlFor="worker-height-supervision-training">Treinamento focado em supervisão de trabalho em altura</label><select id="worker-height-supervision-training" name="heightWorkSupervisionTrainingStatus" defaultValue="not_informed"><option value="not_informed">Não informado</option><option value="reported_pending_validation">Informado · pendente de validação</option></select></div>
        <div className="form-field"><label htmlFor="worker-scaffolding-training">Treinamento para montagem/desmontagem de andaimes</label><select id="worker-scaffolding-training" name="scaffoldingAssemblyTrainingStatus" defaultValue="not_informed"><option value="not_informed">Não informado</option><option value="reported_pending_validation">Informado · pendente de validação</option></select></div>
        <p className="permission-note">“Informado” é somente relato demonstrativo: não comprova conclusão, certificado ou validade do treinamento.</p>
        <div className="form-field"><label htmlFor="worker-company">Empresa</label><select id="worker-company" name="companyId" value={companyId} required onChange={(event) => setCompanyId(event.target.value)}>{activeCompanies.map((company) => <option key={company.id} value={company.id}>{company.tradeName || company.legalName}</option>)}</select></div>
        <div className="form-field"><label htmlFor="worker-unit">Unidade / CNPJ</label><select id="worker-unit" name="unitId" required disabled={!activeUnits.length}>{activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} · {unit.cnpj}</option>)}</select></div>
        <fieldset className="risk-picker"><legend>Categorias de risco para análise</legend><p>Escolha as categorias que serão avaliadas pelo profissional responsável.</p><div className="risk-options">{DEMO_RISK_CATEGORIES.map((category) => <label className="risk-option" key={category}><input type="checkbox" name="riskCategory" value={category}/><span><strong>{category}</strong><small>{riskDescriptions[category]}</small></span></label>)}</div></fieldset>
        {state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}
        {state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}
        <div className="worker-form-footer"><p>O colaborador fica associado à empresa e unidade selecionadas.</p><button className="primary-button" type="submit" disabled={pending || !activeUnits.length}>{pending ? "Salvando…" : "Salvar colaborador"}</button></div>
      </form> : <div className="worker-prerequisite"><h3>Não há unidade ativa disponível</h3><p>Ative ou cadastre uma empresa e unidade antes de criar um vínculo fictício.</p><button className="secondary-button" type="button" onClick={onOpenCompanies}>Ir para Empresas</button></div>}
    </section> : <div className="permission-note"><strong>Consulta de trabalhadores</strong><span>Este perfil pode consultar os vínculos da própria consultoria, mas não criar ou alterar cadastros.</span></div>}

    <section className="worker-list-section" aria-labelledby="worker-list-title"><div className="client-list-heading"><div><h2 id="worker-list-title">Vínculos cadastrados</h2><p>{workers.length} {workers.length === 1 ? "vínculo" : "vínculos"} nesta consultoria</p></div></div>
      {workers.length ? <div className="worker-list">{workers.map((worker) => {
        const company = companies.find((entry) => entry.id === worker.companyId);
        const unit = company?.units.find((entry) => entry.id === worker.unitId);
        return <article className={`worker-card${worker.status === "archived" ? " worker-card-archived" : ""}`} key={worker.id}>
          <div className="worker-card-head"><span className="worker-avatar" aria-hidden="true">{worker.displayName.slice(0, 1).toUpperCase()}</span><div className="worker-title"><h3>{worker.displayName}</h3><p>{worker.jobTitle}{worker.sex && worker.sex !== "Não informado" ? ` · ${worker.sex}` : ""}</p></div><span className={`client-status ${worker.status === "active" ? "status-active" : "status-archived"}`}>{worker.status === "active" ? "Ativo" : "Arquivado"}</span></div>
          <div className="worker-link"><strong>Treinamentos demonstrativos</strong><small>NR-35: {worker.nr35TrainingStatus === "reported_pending_validation" ? "informado · pendente de validação" : "não informado"} · Supervisão em altura: {worker.heightWorkSupervisionTrainingStatus === "reported_pending_validation" ? "informado · pendente de validação" : "não informado"} · Montagem/desmontagem de andaimes: {worker.scaffoldingAssemblyTrainingStatus === "reported_pending_validation" ? "informado · pendente de validação" : "não informado"}</small></div>
          <div className="worker-link"><strong>{company?.tradeName || company?.legalName || "Empresa arquivada"}</strong><small>{unit?.name ?? "Unidade indisponível"}{unit?.cityState ? ` · ${unit.cityState}` : ""} · Área: {worker.area || "não informada"}</small></div>
          <div className="worker-risk-tags" aria-label="Categorias para revisão">{worker.riskCategories.map((category) => <span key={category}>{category}</span>)}</div>
          {canManage && worker.status === "active" && <WorkerEditForm worker={worker}/>}
          <details className="worker-history"><summary>Histórico · {worker.history.length} {worker.history.length === 1 ? "registro" : "registros"}</summary><ol>{worker.history.map((entry) => <li key={entry.id}><span><strong>{entry.action === "created" ? "Vínculo criado" : entry.action === "details_changed" ? `Dados alterados: ${(entry.changedFields ?? []).map((field) => field === "displayName" ? "identificação fictícia" : field === "sex" ? "sexo demonstrativo" : field === "jobTitle" ? "função" : field === "area" ? "área/setor" : field === "riskCategories" ? "categorias de risco" : field === "nr35TrainingStatus" ? "treinamento NR-35" : field === "heightWorkSupervisionTrainingStatus" ? "treinamento focado em supervisão de altura" : "treinamento para montagem/desmontagem de andaimes").join(", ")}` : `Situação alterada: ${entry.fromStatus === "active" ? "ativo" : "arquivado"} → ${entry.toStatus === "active" ? "ativo" : "arquivado"}`}</strong><small>{entry.actorRole === "consultoria_admin" ? "Administradora" : entry.actorRole} · conta fictícia</small></span><time dateTime={entry.occurredAt}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.occurredAt))}</time></li>)}</ol></details>
          <div className="client-card-footer"><small>Atualizado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(worker.updatedAt))}</small>{canManage && <RecordStatusForm resource="worker" id={worker.id} active={worker.status === "active"}/>}</div>
        </article>;
      })}</div> : <div className="client-empty"><span className="client-empty-icon" aria-hidden="true">♙</span><h3>Nenhum vínculo cadastrado</h3><p>Os cadastros de demonstração aparecerão aqui com função, unidade e categorias para análise.</p></div>}
    </section>
  </div>;
}
