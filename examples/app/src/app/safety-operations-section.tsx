"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import AprRevisionHistory from "./apr-revision-history";
import AprChecklistOrigin from "./apr-checklist-origin";
import type { ClientCompany } from "@/lib/client-store";
import type { PgrInventoryRecord } from "@/lib/pgr-postgres-operations";
import type { SafetyApr, SafetyChecklistTemplate } from "@/lib/safety-operations-store";
import { getSafetyChecklistSuggestion, type SafetyChecklistSuggestionKind } from "@/lib/safety-checklist-suggestions";
import {
  createSafetyAprAction,
  createSafetyChecklistTemplateAction,
  activateSafetyChecklistTemplateAction,
  saveSafetyAprAnswersAction,
  submitSafetyAprForReviewAction,
  type SafetyOperationsFormState,
} from "./safety-operations-actions";

function Feedback({ state }: { state: SafetyOperationsFormState }) {
  return <>{state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}</>;
}

function ChecklistTemplateForm({ templates }: { templates: SafetyChecklistTemplate[] }) {
  const [state, action, pending] = useActionState(createSafetyChecklistTemplateAction, {});
  const activeTemplates = templates.filter((template) => template.status === "active");
  const [previousTemplateId, setPreviousTemplateId] = useState("");
  const [activityKind, setActivityKind] = useState<SafetyChecklistSuggestionKind | "">("");
  const [title, setTitle] = useState("");
  const [activity, setActivity] = useState("");
  const [prompts, setPrompts] = useState("");
  const [referenceTitle, setReferenceTitle] = useState("");
  const [referenceVersion, setReferenceVersion] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [reviewer, setReviewer] = useState("");
  function setReference(reference?: SafetyChecklistTemplate["reference"]) {
    setReferenceTitle(reference?.title ?? "");
    setReferenceVersion(reference?.version ?? "");
    setJurisdiction(reference?.jurisdiction ?? "");
    setValidFrom(reference?.validFrom ?? "");
    setValidUntil(reference?.validUntil ?? "");
    setReviewer(reference?.reviewer ?? "");
  }
  function applySuggestion(kind: SafetyChecklistSuggestionKind) {
    const suggestion = getSafetyChecklistSuggestion(kind);
    setPreviousTemplateId("");
    setActivityKind(kind === "general_activity" ? "general_activity" : "confined_space_nr33");
    setTitle(suggestion.title);
    setActivity(suggestion.activity);
    setPrompts(suggestion.prompts.join("\n"));
    setReference();
  }
  return <details className="aso-new">
    <summary>Configurar modelo reutilizável de checklist</summary>
    <form action={action} className="pgr-form">
      <label className="form-field pgr-wide">Categoria do modelo<select name="activityKind" required value={activityKind} onChange={(event) => { const value = event.target.value; setActivityKind(value === "general_activity" || value === "confined_space_nr33" ? value : ""); }}><option value="" disabled>Selecione</option><option value="confined_space_nr33">Espaço confinado · referência NR-33 a validar</option><option value="general_activity">Atividade diversa · definida pela equipe</option></select></label>
      <p className="permission-note pgr-wide">A categoria de espaço confinado é apenas organizacional. Nenhum item da NR-33 é pré-carregado ou validado pelo sistema.</p>
      <fieldset className="aso-exams pgr-wide"><legend>Estruturas iniciais editáveis</legend><p>São perguntas de organização, não critérios técnicos. Elas só preenchem este formulário; nada é salvo até você enviar como rascunho. Revise e adapte o conteúdo antes de salvar.</p><div className="pgr-form-footer"><button className="secondary-button" type="button" onClick={() => applySuggestion("confined_space_grain_handling")}>01 · APR EC Silos</button><button className="secondary-button" type="button" onClick={() => applySuggestion("confined_space_adaptable")}>02 · APR EC Geral</button><button className="secondary-button" type="button" onClick={() => applySuggestion("general_activity")}>03 · APR Genérica</button></div></fieldset>
      <label className="form-field">Nome do modelo<input name="title" required maxLength={140} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Nome definido pela equipe"/></label>
      <label className="form-field">Atividade relacionada<input name="activity" required maxLength={300} value={activity} onChange={(event) => setActivity(event.target.value)} placeholder="Atividade a que se aplica"/></label>
      <label className="form-field pgr-wide">Perguntas de organização <span>(uma por linha; sem critérios técnicos pré-carregados)</span><textarea name="prompts" required maxLength={16000} rows={6} value={prompts} onChange={(event) => setPrompts(event.target.value)} placeholder={"Descreva cada pergunta revisada pela equipe\nNenhum critério normativo é pré-carregado"}/></label>
      <label className="form-field pgr-wide">Criar nova versão de um modelo existente<select name="previousTemplateId" value={previousTemplateId} onChange={(event) => { const id = event.target.value; setPreviousTemplateId(id); const selected = activeTemplates.find((template) => template.id === id); if (selected) { setActivityKind(selected.activityKind); setTitle(selected.title); setActivity(selected.activity); setPrompts(selected.items.map((item) => item.prompt).join("\n")); setReference(selected.reference); } else { setActivityKind(""); setTitle(""); setActivity(""); setPrompts(""); setReference(); } }}><option value="">Criar modelo novo</option>{activeTemplates.map((template) => <option key={template.id} value={template.id}>{template.title} · versão {template.version}</option>)}</select></label>
      <fieldset className="aso-exams pgr-wide"><legend>Referência revisada, se aplicável</legend><p>Se o checklist reproduzir uma norma ou requisito externo, registre a fonte e a vigência conferidas por uma pessoa responsável.</p>
        <label className="form-field">Fonte<input name="referenceTitle" maxLength={180} value={referenceTitle} onChange={(event) => setReferenceTitle(event.target.value)}/></label>
        <label className="form-field">Versão/edição<input name="referenceVersion" maxLength={80} value={referenceVersion} onChange={(event) => setReferenceVersion(event.target.value)}/></label>
        <label className="form-field">Jurisdição/âmbito<input name="jurisdiction" maxLength={100} value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)}/></label>
        <label className="form-field">Vigente a partir de<input name="validFrom" type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)}/></label>
        <label className="form-field">Vigente até<input name="validUntil" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)}/></label>
        <label className="form-field">Responsável pela revisão<input name="reviewer" maxLength={120} value={reviewer} onChange={(event) => setReviewer(event.target.value)}/></label>
      </fieldset>
      <Feedback state={state}/>
      <div className="pgr-form-footer"><p>Salvar cria um rascunho; o modelo só fica disponível para APR após revisão humana explícita. Versões substituídas permanecem no histórico. O sistema não interpreta fontes nem cria regra normativa.</p><button className="primary-button" disabled={pending}>{pending ? "Salvando…" : "Salvar rascunho"}</button></div>
    </form>
  </details>;
}

function ChecklistTemplateReviewForm({ template }: { template: SafetyChecklistTemplate }) {
  const [state, action, pending] = useActionState(activateSafetyChecklistTemplateAction, {});
  return <form action={action} className="pgr-form">
    <input type="hidden" name="templateId" value={template.id}/>
    <label className="operations-check"><input type="checkbox" name="confirmReview" value="yes" required/><span>Revisei os itens deste modelo e confirmo que a ativação corresponde ao conteúdo revisado pela equipe.</span></label>
    <p className="permission-note">A revisão fica registrada com a conta autenticada. O sistema não verifica qualificação profissional nem declara conformidade normativa.{template.activityKind === "confined_space_nr33" ? " Para ativar este modelo, complete também os dados da referência NR-33 e da revisão humana." : ""}</p>
    <Feedback state={state}/>
    <button className="secondary-button" disabled={pending}>{pending ? "Registrando revisão…" : "Registrar revisão e ativar modelo"}</button>
  </form>;
}

type AdditionalRiskRow = { key: string; hazard: string; possibleHarm: string; identificationBasis: string; controls: string };
type AdditionalPgrControlRow = { key: string; riskId: string; description: string };

function newRowKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function AprCreateForm({ templates, companies, inventories }: { templates: SafetyChecklistTemplate[]; companies: ClientCompany[]; inventories: PgrInventoryRecord[] }) {
  const [state, action, pending] = useActionState(createSafetyAprAction, {});
  const [scope, setScope] = useState("");
  const scopeParts = scope.split("|");
  const companyId = scopeParts[0] ?? "";
  const unitId = scopeParts[1] ?? "";
  const scopeInventories = inventories.filter((record) => record.status === "approved"
    && record.inventory.companyId === companyId && record.inventory.unitId === unitId);
  const [pgrId, setPgrId] = useState("");
  const selectedPgr = scopeInventories.find((record) => record.id === pgrId) ?? scopeInventories[0];
  const [riskIds, setRiskIds] = useState<string[]>([]);
  const [additionalRisks, setAdditionalRisks] = useState<AdditionalRiskRow[]>([]);
  const [additionalPgrControls, setAdditionalPgrControls] = useState<AdditionalPgrControlRow[]>([]);
  const [templateId, setTemplateId] = useState("");
  const activeTemplates = templates.filter((template) => template.status === "active");
  const selectedTemplate = activeTemplates.find((template) => template.id === templateId) ?? activeTemplates[0];
  const selectedRiskOptions = selectedPgr?.inventory.items.filter((risk) => riskIds.includes(risk.id)) ?? [];

  function changeScope(value: string) {
    setScope(value);
    setPgrId("");
    setRiskIds([]);
    setAdditionalPgrControls([]);
  }
  function changePgr(value: string) {
    setPgrId(value);
    setRiskIds([]);
    setAdditionalPgrControls([]);
  }
  function toggleRisk(riskId: string, checked: boolean) {
    setRiskIds((current) => checked ? [...current, riskId] : current.filter((id) => id !== riskId));
    setAdditionalPgrControls((current) => checked ? current : current.filter((control) => control.riskId !== riskId));
  }
  function updateAdditionalRisk(key: string, field: keyof Omit<AdditionalRiskRow, "key">, value: string) {
    setAdditionalRisks((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
  }
  function updateAdditionalPgrControl(key: string, field: keyof Omit<AdditionalPgrControlRow, "key">, value: string) {
    setAdditionalPgrControls((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
  }

  return <details className="aso-new" open={inventories.length > 0 && activeTemplates.length > 0}>
    <summary>Nova APR · rascunho</summary>
    {!inventories.length && <p className="permission-note">Não há riscos estruturados em PGR aprovado. A APR não inventa nem extrai riscos: regularize e aprove um inventário antes de continuar.</p>}
    {!activeTemplates.length && <p className="permission-note">Configure um modelo de checklist revisado pela equipe antes de criar a APR.</p>}
    {inventories.length > 0 && activeTemplates.length > 0 && <form action={action} className="pgr-form">
      <label className="form-field pgr-wide">Empresa e unidade<select required value={scope} onChange={(event) => changeScope(event.target.value)}><option value="" disabled>Selecione</option>{companies.filter((company) => company.status === "active").flatMap((company) => company.units.map((unit) => <option key={`${company.id}|${unit.id}`} value={`${company.id}|${unit.id}`}>{company.tradeName || company.legalName} · {unit.name}</option>))}</select></label>
      <input type="hidden" name="companyId" value={companyId}/>
      <input type="hidden" name="unitId" value={unitId}/>
      <label className="form-field pgr-wide">Inventário PGR aprovado<select name="pgrInventoryId" required value={selectedPgr?.id ?? ""} onChange={(event) => changePgr(event.target.value)} disabled={!scopeInventories.length}><option value="" disabled>Selecione</option>{scopeInventories.map((record) => <option key={record.id} value={record.id}>{record.inventory.title} · revisão {record.inventory.revision}</option>)}</select></label>
      {selectedPgr && <fieldset className="aso-exams pgr-wide"><legend>Riscos da base PGR</legend><p>Selecione somente riscos já presentes na revisão aprovada do PGR. A escolha é explícita; não há associação automática. Riscos identificados só na tarefa entram no campo seguinte, sem alterar o PGR.</p>{selectedPgr.inventory.items.map((risk) => <label className="operations-check" key={risk.id}><input type="checkbox" name="riskIds" value={risk.id} checked={riskIds.includes(risk.id)} onChange={(event) => toggleRisk(risk.id, event.target.checked)}/><span><strong>{risk.activity}</strong> · {risk.hazard}</span></label>)}</fieldset>}

      {selectedPgr && <fieldset className="aso-exams pgr-wide"><legend>Riscos adicionais identificados na avaliação da tarefa</legend><p>Registre apenas riscos percebidos durante a avaliação da tarefa que não estejam no PGR selecionado. Cada risco adicional exige a origem da identificação e ao menos uma medida de controle adicional. A base PGR permanece registrada acima.</p>
        {additionalRisks.map((row, index) => <fieldset className="aso-exams pgr-wide" key={row.key}><legend>Risco adicional {index + 1}</legend>
          <label className="form-field pgr-wide">Perigo ou risco identificado<input name="additionalRiskHazard" required maxLength={300} value={row.hazard} onChange={(event) => updateAdditionalRisk(row.key, "hazard", event.target.value)}/></label>
          <label className="form-field">Possível dano informado<input name="additionalRiskHarm" maxLength={500} value={row.possibleHarm} onChange={(event) => updateAdditionalRisk(row.key, "possibleHarm", event.target.value)}/></label>
          <label className="form-field pgr-wide">Como foi identificado na avaliação<textarea name="additionalRiskBasis" required maxLength={1000} rows={2} value={row.identificationBasis} onChange={(event) => updateAdditionalRisk(row.key, "identificationBasis", event.target.value)} placeholder="Observação, condição do local ou etapa em que o risco foi percebido"/></label>
          <label className="form-field pgr-wide">Medidas de controle adicionais <span>(uma por linha)</span><textarea name="additionalRiskControls" required maxLength={6000} rows={2} value={row.controls} onChange={(event) => updateAdditionalRisk(row.key, "controls", event.target.value)}/></label>
          <button className="secondary-button" type="button" onClick={() => setAdditionalRisks((current) => current.filter((item) => item.key !== row.key))}>Remover risco adicional</button>
        </fieldset>)}
        <button className="secondary-button" type="button" onClick={() => setAdditionalRisks((current) => [...current, { key: newRowKey(), hazard: "", possibleHarm: "", identificationBasis: "", controls: "" }])}>Adicionar risco adicional</button>
      </fieldset>}

      {selectedPgr && <fieldset className="aso-exams pgr-wide"><legend>Medidas de controle adicionais para riscos do PGR</legend><p>Aplicam-se aos riscos já selecionados do PGR, sem alterar o inventário aprovado. Registre somente medidas que a equipe decidiu adotar nesta tarefa.</p>
        {selectedRiskOptions.length === 0 && <p className="permission-note">Selecione ao menos um risco do PGR acima para registrar medidas adicionais.</p>}
        {additionalPgrControls.map((row, index) => <fieldset className="aso-exams pgr-wide" key={row.key}><legend>Medida adicional {index + 1}</legend>
          <label className="form-field">Risco do PGR<select name="additionalPgrControlRiskId" required value={row.riskId} onChange={(event) => updateAdditionalPgrControl(row.key, "riskId", event.target.value)}><option value="" disabled>Selecione</option>{selectedRiskOptions.map((risk) => <option key={risk.id} value={risk.id}>{risk.activity} · {risk.hazard}</option>)}</select></label>
          <label className="form-field">Medida de controle adicional<input name="additionalPgrControlDescription" required maxLength={600} value={row.description} onChange={(event) => updateAdditionalPgrControl(row.key, "description", event.target.value)}/></label>
          <button className="secondary-button" type="button" onClick={() => setAdditionalPgrControls((current) => current.filter((item) => item.key !== row.key))}>Remover medida adicional</button>
        </fieldset>)}
        <button className="secondary-button" type="button" disabled={!selectedRiskOptions.length} onClick={() => setAdditionalPgrControls((current) => [...current, { key: newRowKey(), riskId: selectedRiskOptions[0]?.id ?? "", description: "" }])}>Adicionar medida para risco do PGR</button>
      </fieldset>}

      <label className="form-field">Título da APR<input name="title" required maxLength={140} placeholder="Identificação da atividade"/></label>
      <label className="form-field">Pessoa responsável pela elaboração<input name="responsible" required maxLength={120}/></label>
      <label className="form-field pgr-wide">Etapa/atividade observada<textarea name="activityStage" required maxLength={1000} rows={3}/></label>
      <label className="form-field pgr-wide">Local e condições do trabalho<textarea name="workArea" required maxLength={500} rows={2}/></label>
      <label className="form-field pgr-wide">Modelo de checklist<select name="templateId" required value={selectedTemplate?.id ?? ""} onChange={(event) => setTemplateId(event.target.value)}><option value="" disabled>Selecione</option>{activeTemplates.map((template) => <option key={template.id} value={template.id}>{template.activityKind === "confined_space_nr33" ? "Espaço confinado · " : "Atividade diversa · "}{template.title} · versão {template.version}</option>)}</select></label>
      <input type="hidden" name="templateVersion" value={selectedTemplate?.version ?? ""}/>
      <Feedback state={state}/>
      <div className="pgr-form-footer"><p>A APR será criada como rascunho, com riscos da base PGR e eventuais riscos/controles adicionais separados. Ela não libera atividade nem substitui a avaliação de profissional responsável.</p><button className="primary-button" disabled={pending || !selectedPgr}>{pending ? "Criando…" : "Criar rascunho de APR"}</button></div>
    </form>}
  </details>;
}

function AprRecord({ apr, canManage }: { apr: SafetyApr; canManage: boolean }) {
  const [state, action, pending] = useActionState(saveSafetyAprAnswersAction, {});
  const [submitState, submitAction, submitPending] = useActionState(submitSafetyAprForReviewAction, {});
  const additionalRisks = apr.additionalRisks ?? [];
  const additionalPgrControls = apr.additionalPgrControls ?? [];
  function riskLabel(riskId: string) {
    const risk = apr.risks.find((item) => item.riskId === riskId);
    return risk ? `${risk.activity} · ${risk.hazard}` : `Risco ${riskId}`;
  }
  return <article className="pgr-card">
    <header><div><h3>{apr.title}</h3><p>{apr.activityStage} · {apr.workArea}</p></div><span className="period-label">{apr.status === "draft" ? "Rascunho" : "Em revisão"}</span></header>
    <p><strong>Responsável pela elaboração:</strong> {apr.responsible}</p>
    <AprRevisionHistory history={apr.history}/>
    <p><strong>Base selecionada:</strong> {apr.pgrTitle} · revisão {apr.pgrRevision} · checklist {apr.checklistTitle} v{apr.checklistTemplateVersion}</p>
    <AprChecklistOrigin origin={apr}/>
    <p><strong>Riscos da base PGR · {apr.risks.length}</strong></p>
    <ul>{apr.risks.map((risk) => <li key={risk.riskId}><strong>{risk.activity}:</strong> {risk.hazard}{risk.possibleHarm ? ` · possível dano informado: ${risk.possibleHarm}` : ""}{risk.exposureDescription ? ` · exposição: ${risk.exposureDescription}` : ""}</li>)}</ul>
    {apr.additionalRisks && <section>
      <p><strong>Riscos adicionais da avaliação da tarefa · {additionalRisks.length}</strong></p>
      {additionalRisks.length ? <ul>{additionalRisks.map((risk) => <li key={risk.id}><strong>{risk.hazard}</strong>{risk.possibleHarm ? ` · possível dano informado: ${risk.possibleHarm}` : ""}{risk.identificationBasis ? ` · identificado em: ${risk.identificationBasis}` : ""}{risk.controls.length > 0 && <ul>{risk.controls.map((control, index) => <li key={index}>{control}</li>)}</ul>}</li>)}</ul> : <p className="permission-note">Nenhum risco adicional foi registrado nesta avaliação.</p>}
    </section>}
    {apr.additionalPgrControls && <section>
      <p><strong>Medidas de controle adicionais para riscos do PGR · {additionalPgrControls.length}</strong></p>
      {additionalPgrControls.length ? <ul>{additionalPgrControls.map((control) => <li key={control.id}><strong>{riskLabel(control.riskId)}:</strong> {control.description}</li>)}</ul> : <p className="permission-note">Nenhuma medida adicional foi registrada para os riscos do PGR.</p>}
    </section>}
    {apr.status === "draft" && canManage ? <>
      <form action={action} className="pgr-form">
        <input type="hidden" name="aprId" value={apr.id}/>
        <input type="hidden" name="expectedRevision" value={apr.revision}/>
        {apr.answers.map((answer, index) => <fieldset className="aso-exams pgr-wide" key={answer.id}><legend>{index + 1}. {answer.prompt}</legend>
          <label className="form-field">Resultado observado<select name={`result_${answer.id}`} defaultValue={answer.result}><option value="unanswered">Ainda não respondido</option><option value="observed">Condição observada</option><option value="attention">Ponto a tratar</option><option value="not_applicable">Não aplicável</option></select></label>
          <label className="form-field">Observações/justificativa<textarea name={`notes_${answer.id}`} maxLength={1200} defaultValue={answer.notes}/></label>
          <label className="form-field">Próximo passo<textarea name={`nextStep_${answer.id}`} maxLength={600} defaultValue={answer.nextStep}/></label>
          <label className="form-field">Responsável pelo próximo passo<input name={`responsible_${answer.id}`} maxLength={120} defaultValue={answer.responsible}/></label>
        </fieldset>)}
        <Feedback state={state}/>
        <div className="pgr-form-footer"><p>Salvar preserva a revisão anterior por controle de revisão. Ponto a tratar exige ação e responsável antes do envio.</p><button className="secondary-button" disabled={pending}>{pending ? "Salvando…" : "Salvar respostas"}</button></div>
      </form>
      <form action={submitAction}><input type="hidden" name="aprId" value={apr.id}/><input type="hidden" name="expectedRevision" value={apr.revision}/><button className="primary-button" disabled={submitPending}>{submitPending ? "Enviando…" : "Enviar para revisão humana"}</button><p>O envio não é uma aprovação nem libera o início do trabalho.</p><Feedback state={submitState}/></form>
    </> : <ol>{apr.answers.map((answer) => <li key={answer.id}><strong>{answer.prompt}</strong> · {answer.result === "unanswered" ? "Sem resposta" : answer.result === "observed" ? "Condição observada" : answer.result === "attention" ? "Ponto a tratar" : "Não aplicável"}{answer.notes && <p>{answer.notes}</p>}{answer.nextStep && <p>Próximo passo: {answer.nextStep} · Responsável: {answer.responsible}</p>}</li>)}</ol>}
  </article>;
}

export default function SafetyOperationsSection({ templates, aprs, companies, inventories, canManage, pgrError }: {
  templates: SafetyChecklistTemplate[];
  aprs: SafetyApr[];
  companies: ClientCompany[];
  inventories: PgrInventoryRecord[];
  canManage: boolean;
  pgrError?: string;
}) {
  const activeTemplates = templates.filter((template) => template.status === "active");
  const approvedInventories = inventories.filter((record) => record.status === "approved" && record.inventory.items.length > 0);
  return <section className="panel pgr-section" id="safety-apr" aria-labelledby="apr-title">
    <p><Link className="secondary-button" href="/nao-conformidades">Relatórios de não conformidade →</Link></p>
    <p><Link className="secondary-button" href="/permissoes-trabalho">Conferir preparação de PT/PTE →</Link></p>
    <div className="panel-heading"><div><h2 id="apr-title">APR e checklists de campo</h2><p>Modelos reutilizáveis são ativados após revisão humana. Cada APR parte dos riscos de um PGR aprovado no escopo da empresa e unidade e pode registrar riscos e medidas de controle adicionais identificados na avaliação da tarefa.</p></div><span className="period-label">{aprs.length} APR(s)</span></div>
    <div className="document-warning"><strong>Revisão humana obrigatória.</strong> A APR organiza informações inseridas pela equipe; não classifica risco, não declara conformidade e não libera trabalho. Use somente dados de demonstração até a validação profissional e a etapa de persistência aprovada.</div>
    {pgrError && <p className="client-form-message client-form-error" role="alert">{pgrError} A APR foi mantida sem vínculo até a fonte poder ser conferida.</p>}
    {canManage ? <ChecklistTemplateForm templates={templates}/> : <p className="permission-note">Seu perfil pode consultar as APRs; somente perfis autorizados configuram modelos.</p>}
    {canManage && <AprCreateForm templates={activeTemplates} companies={companies} inventories={approvedInventories}/>}
    <div className="issue-filter"><h3>Modelos de checklist · histórico preservado</h3></div>
    {!templates.length && <p className="permission-note">Nenhum modelo cadastrado.</p>}
    {templates.map((template) => <article className="pgr-card" key={template.id}><header><div><h3>{template.title} · versão {template.version}</h3><p>{template.activityKind === "confined_space_nr33" ? "Espaço confinado · referência NR-33 a validar" : "Atividade diversa · definida pela equipe"} · {template.activity}</p></div><span className="period-label">{template.status === "active" ? "Ativo para APR" : template.status === "draft" ? "Rascunho · revisão pendente" : "Substituído"}</span></header><ol>{template.items.map((item) => <li key={item.id}>{item.prompt}</li>)}</ol>{!template.items.length && <p className="permission-note">Nenhum item informado; o modelo não pode ser ativado nem usado em uma APR.</p>}{template.reference && <p>Referência registrada: {template.reference.title} · versão {template.reference.version} · {template.reference.jurisdiction} · vigente de {template.reference.validFrom}{template.reference.validUntil ? ` até ${template.reference.validUntil}` : ""} · revisor informado: {template.reference.reviewer}.</p>}{template.status === "draft" && <ChecklistTemplateReviewForm template={template} />}{template.reviewedAt && <p className="permission-note">Revisão humana registrada em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(template.reviewedAt))}; qualificação técnica não verificada pelo sistema.</p>}</article>)}
    <div className="issue-filter"><h3>APR registradas · {aprs.length}</h3></div>
    {!aprs.length && <p className="permission-note">Nenhuma APR foi criada. Primeiro configure um checklist e selecione um PGR aprovado com riscos estruturados.</p>}
    {aprs.map((apr) => <AprRecord key={apr.id} apr={apr} canManage={canManage}/>)}
  </section>;
}
