"use client";

import { useActionState, useState } from "react";
import type { ClientCompany } from "@/lib/client-store";
import type { RiskAnalysis, RiskAnalysisStage } from "@/lib/risk-analysis-store";
import type { AprCatalogModel } from "@/lib/apr-catalog";
import ChoiceSelect, { ChoiceAppend, vocabularyChoices } from "./choice-select";
import { controlChoicesForRisk } from "@/lib/control-recommendations";
import type { VocabularyEntry } from "@/lib/field-vocabulary";
import { pendingDocumentSigners, type DocumentWorkerOption } from "@/lib/document-signatures";
import RiskDocumentActions from "./risk-document-actions";
import DocumentSignatures from "./document-signatures";
import {
  createRiskAnalysisAction,
  issueRiskAnalysisAction,
  saveRiskAnalysisDraftAction,
  type SafetyOperationsFormState,
} from "./safety-operations-actions";

type HazardApplicability = RiskAnalysisStage["hazards"][number]["applicability"];

function Feedback({ state }: { state: SafetyOperationsFormState }) {
  return <>{state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}</>;
}

function RiskAnalysisFieldsForm({
  values,
  companies,
  catalogModels = [],
  vocabulary = [],
  recordId,
  revision,
  action,
  pending,
}: {
  values?: RiskAnalysis;
  companies: ClientCompany[];
  catalogModels?: AprCatalogModel[];
  vocabulary?: VocabularyEntry[];
  recordId?: string;
  revision?: number;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const [scope, setScope] = useState(values ? `${values.companyId}|${values.unitId}` : "");
  const [companyId, unitId] = scope.split("|");
  const [modelId, setModelId] = useState(values?.catalogModelId ?? "");
  const [controlsValue, setControlsValue] = useState(values?.controls ?? "");
  const [titleValue, setTitleValue] = useState(values?.title ?? "");
  const [activityValue, setActivityValue] = useState(values?.activity ?? "");
  const [locationValue, setLocationValue] = useState(values?.workArea?.split(" · ")[0] ?? "");
  const [conditionValue, setConditionValue] = useState(values?.workArea?.split(" · ")[1] ?? "");
  const [stageState, setStageState] = useState<RiskAnalysisStage[]>(values?.stages ?? []);
  const [newStageName, setNewStageName] = useState("");
  const activityChoices = vocabularyChoices(vocabulary.filter((entry) => entry.kind === "activity"));
  const stageChoices = vocabularyChoices(vocabulary.filter((entry) => entry.kind === "stage"));
  const locationChoices = vocabularyChoices(vocabulary.filter((entry) => entry.kind === "location"));
  const conditionChoices = vocabularyChoices(vocabulary.filter((entry) => entry.kind === "condition"));
  const hazardChoices = vocabularyChoices(vocabulary.filter((entry) => entry.kind === "hazard"));
  const harmChoices = vocabularyChoices(vocabulary.filter((entry) => entry.kind === "harm"));
  const controlEntries = vocabulary.filter((entry) => entry.kind === "control");
  const controlChoices = vocabularyChoices(controlEntries);
  function chooseModel(id: string) {
    setModelId(id);
    const chosen = catalogModels.find((entry) => entry.id === id);
    setStageState(chosen ? chosen.stages.map((stage) => ({
      id: stage.id, order: stage.order, name: stage.name,
      hazards: stage.hazards.map((hazard) => ({
        id: hazard.id, hazard: hazard.hazard, risk: hazard.risk,
        controls: hazard.controls.join("; "), ppe: hazard.ppe.join(", "),
        reference: hazard.reference, applicability: hazard.defaultApplicability, justification: "",
      })),
    })) : []);
  }
  function setApplicability(stageId: string, hazardId: string, applicability: HazardApplicability) {
    setStageState((prev) => prev.map((stage) => stage.id !== stageId ? stage : ({
      ...stage,
      hazards: stage.hazards.map((hazard) => hazard.id !== hazardId ? hazard : ({ ...hazard, applicability })),
    })));
  }
  function setHazardText(stageId: string, hazardId: string, field: "hazard" | "risk" | "controls" | "ppe" | "reference" | "justification", value: string) {
    setStageState((prev) => prev.map((stage) => stage.id !== stageId ? stage : ({
      ...stage,
      hazards: stage.hazards.map((hazard) => hazard.id !== hazardId ? hazard : ({ ...hazard, [field]: value })),
    })));
  }
  function addManualStage() {
    const name = newStageName.trim();
    if (!name) return;
    setStageState((prev) => [...prev, {
      id: `stage-manual-${Date.now().toString(36)}-${prev.length}`,
      order: prev.length + 1,
      name,
      hazards: [],
    }]);
    setNewStageName("");
  }
  function removeStage(stageId: string) {
    setStageState((prev) => prev
      .filter((stage) => stage.id !== stageId)
      .map((stage, index) => ({ ...stage, order: index + 1 })));
  }
  function addManualHazard(stageId: string) {
    setStageState((prev) => prev.map((stage) => stage.id !== stageId ? stage : ({
      ...stage,
      hazards: [...stage.hazards, {
        id: `hazard-manual-${Date.now().toString(36)}-${stage.hazards.length}`,
        hazard: "", risk: "", controls: "", ppe: "", reference: "",
        applicability: "a_confirmar" as HazardApplicability, justification: "",
      }],
    })));
  }
  function removeHazard(stageId: string, hazardId: string) {
    setStageState((prev) => prev.map((stage) => stage.id !== stageId ? stage : ({
      ...stage,
      hazards: stage.hazards.filter((hazard) => hazard.id !== hazardId),
    })));
  }
  return <form action={action} className="pgr-form">
    <h3 className="risk-form-heading pgr-wide">Identificação da atividade</h3>
    {recordId && <><input type="hidden" name="recordId" value={recordId}/><input type="hidden" name="expectedRevision" value={revision}/></>}
    <label className="form-field pgr-wide">Empresa e unidade<select required value={scope} onChange={(event) => setScope(event.target.value)} disabled={Boolean(recordId)}><option value="" disabled>Selecione</option>{companies.filter((company) => company.status === "active").flatMap((company) => company.units.map((unit) => <option key={`${company.id}|${unit.id}`} value={`${company.id}|${unit.id}`}>{company.tradeName || company.legalName} · {unit.name}</option>))}</select></label>
    {!recordId && <><input type="hidden" name="companyId" value={companyId ?? ""}/><input type="hidden" name="unitId" value={unitId ?? ""}/></>}
    <ChoiceSelect label="Título da atividade (escolha ou escreva se não se encaixar)" choices={activityChoices} value={titleValue} onChange={setTitleValue} required/>
    <input type="hidden" name="title" value={titleValue}/>
    <label className="form-field">Profissional responsável pela análise<input name="responsibleName" required maxLength={120} defaultValue={values?.responsibleName ?? ""}/></label>
    <ChoiceSelect label="Atividade ou tarefa avaliada" choices={activityChoices} value={activityValue} onChange={setActivityValue} required/>
    <input type="hidden" name="activity" value={activityValue}/>
    <ChoiceSelect label="Local" choices={locationChoices} value={locationValue} onChange={setLocationValue} required/>
    <ChoiceSelect label="Condições observadas" choices={conditionChoices} value={conditionValue} onChange={setConditionValue}/>
    <input type="hidden" name="workArea" value={[locationValue, conditionValue].filter(Boolean).join(" · ")}/>
    <h3 className="risk-form-heading pgr-wide">Avaliação e medidas de controle</h3>
    <label className="form-field pgr-wide">Análise profissional de riscos<textarea name="assessment" required maxLength={5000} rows={6} defaultValue={values?.assessment ?? ""} placeholder="Registre a avaliação realizada pelo profissional responsável."/></label>
    <ChoiceAppend label="Acrescentar medida do acervo ao texto abaixo" choices={controlChoices} buttonLabel="Acrescentar linha" onAppend={(control) => setControlsValue((current) => current.trim() ? `${current.trimEnd()}\n${control}` : control)} hint="A medida escolhida entra como uma nova linha; o texto continua editável."/>
    <label className="form-field pgr-wide">Medidas de controle e orientações definidas<textarea name="controls" required maxLength={5000} rows={6} value={controlsValue} onChange={(event) => setControlsValue(event.target.value)} placeholder="Registre as medidas definidas pelo profissional responsável."/></label>
    <h3 className="risk-form-heading pgr-wide">Acervo de etapas e perigos</h3>
    <label className="form-field pgr-wide">Modelo do acervo (opcional)<select value={modelId} onChange={(event) => chooseModel(event.target.value)}><option value="">— Sem modelo: montar etapas manualmente —</option>{catalogModels.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label>
    <p className="permission-note pgr-wide">Escolha um modelo para carregar etapas e perigos já organizados no acervo, ou monte as etapas abaixo escolhendo etapa e perigo nas listas. O acervo apoia o preenchimento; a definição técnica continua sendo do profissional responsável.</p>
    <input type="hidden" name="catalogModelId" value={modelId}/>
    <input type="hidden" name="stagesPayload" value={JSON.stringify(stageState)}/>
    {!modelId && <div className="pgr-wide choice-stage-builder">
      <ChoiceSelect label="Adicionar etapa" choices={stageChoices} value={newStageName} onChange={setNewStageName} placeholder="Escolha a etapa"/>
      <button className="secondary-button" type="button" disabled={!newStageName.trim()} onClick={addManualStage}>Adicionar etapa</button>
    </div>}
    {stageState.length > 0 && <div className="pgr-wide" style={{ display: "grid", gap: ".5rem" }}>
      {stageState.map((stage) => {
        const manual = stage.id.startsWith("stage-manual-");
        return <fieldset key={stage.id} className="form-field pgr-wide" style={{ border: "1px solid #d8e3df", borderRadius: ".5rem", padding: ".6rem .8rem" }}>
          <legend><strong>{stage.order}. {stage.name}</strong>{manual ? " · etapa montada nesta AR" : ""}</legend>
          {manual
            ? stage.hazards.length === 0
              ? <p className="permission-note">Nenhum perigo nesta etapa ainda. Use o botão abaixo para escolher um perigo do acervo.</p>
              : stage.hazards.map((hazard) => <div key={hazard.id} className="choice-hazard-row">
                <ChoiceSelect label="Perigo" choices={hazardChoices} value={hazard.hazard} onChange={(value) => setHazardText(stage.id, hazard.id, "hazard", value)} required/>
                <ChoiceSelect label="Risco ou possível dano" choices={harmChoices} value={hazard.risk} onChange={(value) => setHazardText(stage.id, hazard.id, "risk", value)}/>
                <label className="form-field pgr-wide">Medidas de controle<textarea rows={2} maxLength={2000} value={hazard.controls} onChange={(event) => setHazardText(stage.id, hazard.id, "controls", event.target.value)}/></label>
                <ChoiceAppend label="Acrescentar medida do acervo" choices={controlChoicesForRisk(controlEntries, `${hazard.hazard} ${hazard.risk}`)} onAppend={(control) => setHazardText(stage.id, hazard.id, "controls", hazard.controls.trim() ? `${hazard.controls.trimEnd()}\n${control}` : control)}/>
                <label className="form-field">EPI relacionados (separar por vírgula)<input maxLength={600} value={hazard.ppe} onChange={(event) => setHazardText(stage.id, hazard.id, "ppe", event.target.value)}/></label>
                <label className="form-field">Aplicabilidade<select value={hazard.applicability} onChange={(event) => setApplicability(stage.id, hazard.id, event.target.value as HazardApplicability)}>
                  <option value="aplicavel">Aplicável</option>
                  <option value="nao_aplicavel">Não aplicável</option>
                  <option value="a_confirmar">A confirmar</option>
                </select></label>
                {hazard.applicability === "nao_aplicavel" && <input value={hazard.justification} onChange={(event) => setHazardText(stage.id, hazard.id, "justification", event.target.value)} placeholder="Justificativa (mín. 10)" maxLength={500}/>}
                <button className="secondary-button" type="button" onClick={() => removeHazard(stage.id, hazard.id)}>Remover perigo</button>
              </div>)
            : <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
              <thead><tr><th style={{ textAlign: "left", padding: ".25rem" }}>Perigo</th><th style={{ textAlign: "left", padding: ".25rem" }}>Risco</th><th style={{ textAlign: "left", padding: ".25rem" }}>Controles</th><th style={{ textAlign: "left", padding: ".25rem" }}>Aplicabilidade</th></tr></thead>
              <tbody>{stage.hazards.map((hazard) => <tr key={hazard.id} style={{ borderTop: "1px solid #eef3f1" }}>
                <td style={{ padding: ".25rem", verticalAlign: "top" }}>{hazard.hazard}</td>
                <td style={{ padding: ".25rem", verticalAlign: "top" }}>{hazard.risk}</td>
                <td style={{ padding: ".25rem", verticalAlign: "top" }}>{hazard.controls}</td>
                <td style={{ padding: ".25rem", verticalAlign: "top" }}>
                  <select value={hazard.applicability} onChange={(event) => setApplicability(stage.id, hazard.id, event.target.value as HazardApplicability)} style={{ fontSize: ".8rem" }}>
                    <option value="aplicavel">Aplicável</option>
                    <option value="nao_aplicavel">Não aplicável</option>
                    <option value="a_confirmar">A confirmar</option>
                  </select>
                  {hazard.applicability === "nao_aplicavel" && <input value={hazard.justification} onChange={(event) => setHazardText(stage.id, hazard.id, "justification", event.target.value)} placeholder="Justificativa (mín. 10)" maxLength={500} style={{ display: "block", marginTop: ".25rem", fontSize: ".78rem" }}/>}
                </td>
              </tr>)}</tbody>
            </table>}
          <div className="choice-stage-actions">
            {manual && <button className="secondary-button" type="button" onClick={() => addManualHazard(stage.id)}>Adicionar perigo</button>}
            <button className="secondary-button" type="button" onClick={() => removeStage(stage.id)}>Remover etapa desta AR</button>
          </div>
        </fieldset>;
      })}
    </div>}
    <button className="primary-button" disabled={pending}>{pending ? "Salvando…" : recordId ? "Salvar revisão do rascunho" : "Criar rascunho de AR"}</button>
  </form>;
}

function RiskAnalysisRecord({ record, companies, canManage, catalogModels, workers = [] }: { record: RiskAnalysis; companies: ClientCompany[]; canManage: boolean; catalogModels?: AprCatalogModel[]; workers?: DocumentWorkerOption[] }) {
  const [issueState, issueAction, issuePending] = useActionState(issueRiskAnalysisAction, {});
  const company = companies.find((entry) => entry.id === record.companyId);
  const unit = company?.units.find((entry) => entry.id === record.unitId);
  const issuedDate = record.issuedAt
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(record.issuedAt))
    : null;
  const documentHeader = <header><div><h3>{record.documentNumber ? `${record.documentNumber} · ` : ""}{record.title}</h3><p>{company?.tradeName || company?.legalName || "Empresa arquivada"} · {unit?.name ?? "Unidade"}</p></div><span className="period-label">{record.status === "issued" ? `Emitida · revisão ${record.revision}` : `Rascunho · revisão ${record.revision}`}</span></header>;
  const documentContent = <>
    <p className="eyebrow">ANÁLISE DE RISCO · AR</p>
    {documentHeader}
    <p><strong>Atividade:</strong> {record.activity}</p>
    <p><strong>Local e condições observadas:</strong> {record.workArea}</p>
    <p><strong>Análise profissional de riscos:</strong></p><p className="risk-analysis-preserve">{record.assessment}</p>
    <p><strong>Medidas de controle e orientações:</strong></p><p className="risk-analysis-preserve">{record.controls}</p>
    {record.stages && record.stages.length > 0 && <section>
      <p><strong>Etapas operacionais e perigos</strong> · {record.stages.length} etapa(s) · {record.stages.reduce((total, stage) => total + stage.hazards.length, 0)} perigo(s)</p>
      {record.stages.map((stage) => <div key={stage.id} style={{ marginBottom: "1rem" }}>
        <p><strong>{stage.order}. {stage.name}</strong></p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem" }}>
          <thead><tr><th style={{ textAlign: "left", padding: ".25rem", borderBottom: "1px solid #ccc" }}>Perigo</th><th style={{ textAlign: "left", padding: ".25rem", borderBottom: "1px solid #ccc" }}>Risco</th><th style={{ textAlign: "left", padding: ".25rem", borderBottom: "1px solid #ccc" }}>Medidas de controle</th><th style={{ textAlign: "left", padding: ".25rem", borderBottom: "1px solid #ccc" }}>EPI</th><th style={{ textAlign: "left", padding: ".25rem", borderBottom: "1px solid #ccc" }}>Aplicabilidade</th></tr></thead>
          <tbody>{stage.hazards.map((hazard) => <tr key={hazard.id}>
            <td style={{ padding: ".25rem", verticalAlign: "top" }}>{hazard.hazard}</td>
            <td style={{ padding: ".25rem", verticalAlign: "top" }}>{hazard.risk}</td>
            <td style={{ padding: ".25rem", verticalAlign: "top" }}>{hazard.controls}</td>
            <td style={{ padding: ".25rem", verticalAlign: "top" }}>{hazard.ppe}</td>
            <td style={{ padding: ".25rem", verticalAlign: "top" }}>{hazard.applicability === "aplicavel" ? "Aplicável" : hazard.applicability === "nao_aplicavel" ? `Não aplicável — ${hazard.justification || "sem justificativa"}` : "A confirmar"}</td>
          </tr>)}</tbody>
        </table>
      </div>)}
    </section>}
    <p><strong>Profissional responsável:</strong> {record.responsibleName}</p>
    {record.signatures && record.signatures.length > 0 && <section>
      <p><strong>Assinaturas de ciência · {record.signatures.length}</strong></p>
      <ul>{record.signatures.map((signature) => <li key={signature.signerId}>
        <strong>{signature.signerName}</strong> · {signature.role === "issuer" ? "emissor (líder/encarregado)" : "participante"} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(signature.signedAt))}
        <img src={signature.image} alt={`Assinatura de ${signature.signerName}`} style={{ display: "block", maxWidth: "160px" }}/>
      </li>)}</ul>
    </section>}
    {record.status === "issued" && <p><strong>Emissão:</strong> {issuedDate} · conta SST autorizada · revisão {record.revision}</p>}
    <details className="risk-analysis-history"><summary>Histórico de revisões · {record.history.length}</summary><ol>{record.history.map((entry) => <li key={`${entry.revision}-${entry.action}`}>Revisão {entry.revision} · {entry.action === "created" ? "criada" : entry.action === "saved" ? "salva" : "emitida"} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.occurredAt))}</li>)}</ol></details>
  </>;
  return <article className="pgr-card risk-analysis-card">
    {documentHeader}
    <p><strong>Atividade:</strong> {record.activity}</p>
    <RiskDocumentActions title={record.title} label="AR">{documentContent}</RiskDocumentActions>
    <DocumentSignatures kind="ar" recordId={record.id} signers={record.signers ?? []} signatures={record.signatures ?? []} issuerDefault={record.responsibleName} canManage={canManage} workers={workers.filter((worker) => worker.companyId === record.companyId && worker.unitId === record.unitId)}/>
    {record.status === "draft" && canManage && <div className="risk-analysis-controls">
      <RiskAnalysisDraftEditor record={record} companies={companies} catalogModels={catalogModels}/>
      <form action={issueAction} className="pgr-form"><input type="hidden" name="recordId" value={record.id}/><input type="hidden" name="expectedRevision" value={record.revision}/><label className="operations-check"><input type="checkbox" name="confirmIssue" value="yes" required/><span>Revisei o conteúdo e confirmo a emissão desta AR como profissional responsável.</span></label><p className="permission-note">A emissão fica atribuída à conta SST autenticada. O sistema não verifica habilitação profissional nem valida os critérios técnicos registrados.</p><Feedback state={issueState}/><button className="primary-button" disabled={issuePending}>{issuePending ? "Emitindo…" : "Emitir AR"}</button></form>
    </div>}
  </article>;
}

function RiskAnalysisDraftEditor({ record, companies, catalogModels, vocabulary }: { record: RiskAnalysis; companies: ClientCompany[]; catalogModels?: AprCatalogModel[]; vocabulary?: VocabularyEntry[] }) {
  const [state, action, pending] = useActionState(saveRiskAnalysisDraftAction, {});
  return <details className="aso-new"><summary className="risk-form-toggle">Editar rascunho</summary><RiskAnalysisFieldsForm values={record} companies={companies} catalogModels={catalogModels} vocabulary={vocabulary} recordId={record.id} revision={record.revision} action={action} pending={pending}/><Feedback state={state}/></details>;
}

export default function RiskAnalysisSection({
  records,
  companies,
  canManage,
  catalogModels = [],
  vocabulary = [],
  workers = [],
}: {
  records: RiskAnalysis[];
  companies: ClientCompany[];
  catalogModels?: AprCatalogModel[];
  vocabulary?: VocabularyEntry[];
  canManage: boolean;
  workers?: DocumentWorkerOption[];
}) {
  const [state, action, pending] = useActionState(createRiskAnalysisAction, {});
  const pendingSignatureCount = records.filter((record) => pendingDocumentSigners(record.signers ?? [], record.signatures ?? []).length > 0).length;
  return <section className="panel pgr-section risk-analysis-section" aria-labelledby="risk-analysis-title">
    <div className="panel-heading"><div><h2 id="risk-analysis-title">AR · Análise de Risco</h2></div><span className="period-label">{records.length} AR(s){pendingSignatureCount > 0 ? ` · ${pendingSignatureCount} com assinatura pendente` : ""}</span></div>
    <div className="document-warning"><strong>Responsabilidade profissional.</strong> Não há checklist ou critério normativo pré-carregado. A permissão depende do perfil SST definido no sistema; a qualificação profissional não é verificada automaticamente. A emissão registra a decisão do profissional e não libera automaticamente uma atividade.</div>
    {canManage
      ? <details className="aso-new" open={!records.length}><summary className="risk-form-toggle">Nova AR</summary><RiskAnalysisFieldsForm companies={companies} catalogModels={catalogModels} vocabulary={vocabulary} action={action} pending={pending}/><Feedback state={state}/></details>
      : <p className="permission-note">Acesso somente para consulta.</p>}
    <div className="issue-filter"><h3>Análises registradas · {records.length}</h3></div>
    {!records.length && <p className="permission-note">Nenhuma AR foi registrada para esta consultoria.</p>}
    {records.map((record) => <RiskAnalysisRecord key={record.id} record={record} companies={companies} canManage={canManage} catalogModels={catalogModels} workers={workers}/>)}
  </section>;
}
