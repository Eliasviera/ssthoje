"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { ClientCompany } from "@/lib/client-store";
import type { PgrInventoryRecord } from "@/lib/pgr-postgres-operations";
import type { PgrPdfImportResult } from "@/lib/pgr-pdf-import";
import type { PgrExposureEvaluation, PgrRiskItem } from "@/lib/pgr-risk-inventory";
import { ESOCIAL_CATALOG_SNAPSHOT, getEsocialCode, searchEsocialCodes } from "@/lib/esocial-catalog";
import { approvePgrInventoryPostgresAction, savePgrInventoryPostgresAction, submitPgrInventoryPostgresAction } from "./pgr-postgres-actions";

type FormState = { error?: string; success?: string };
const statusLabel = { draft: "Rascunho", in_review: "Em revisão", approved: "Revisado internamente" } as const;

function newRiskItem(): PgrRiskItem {
  return {
    id: crypto.randomUUID(), process: "", activity: "", hazard: "", sourceCircumstance: "", possibleHarm: "",
    exposedGroups: [], exposureDescription: "", existingMeasures: [], evidenceRefs: [], assessment: { status: "reported" }, exposureEvaluations: [],
  };
}

function newExposureEvaluation(): PgrExposureEvaluation {
  return { id: crypto.randomUUID(), agent: "", type: "quantitative", status: "planned", evidenceRefs: [] };
}

function lines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function EsocialTable24Picker({ item, onChange, canManage }: { item: PgrRiskItem; onChange: (next: PgrRiskItem) => void; canManage: boolean }) {
  const [query, setQuery] = useState(() => {
    const association = item.esocialTable24;
    return association ? `${association.code} · ${association.label}` : "";
  });
  const selected = item.esocialTable24;
  const matches = searchEsocialCodes("24", query).slice(0, 15);

  if (!canManage) return null;

  return <details className="pgr-structure-note" open={Boolean(selected)}>
    <summary>{selected ? `Referência manual eSocial · ${selected.code}` : "Consultar Tabela 24 do eSocial (opcional)"}</summary>
    <p>A busca não sugere correspondências. Escolha um código manualmente se a equipe entender pertinente; a tabela não confirma aplicabilidade, vigência nem adequação ao caso. A seleção e a justificativa ficam neste item do inventário e seguem para revisão humana do PGR.</p>
    <label className="form-field">Buscar código ou descrição da Tabela 24 · S-2240
      <input type="search" value={query} onChange={(event) => {
        setQuery(event.target.value);
        onChange({ ...item, esocialTable24: undefined });
      }} placeholder="Pesquise código ou descrição" autoComplete="off"/>
    </label>
    {query && !selected && <ul aria-label="Resultados da Tabela 24">{matches.map((entry) => <li key={entry.code}>
      <button type="button" className="text-button" onClick={() => {
        setQuery(`${entry.code} · ${entry.label}`);
        onChange({
          ...item,
          esocialTable24: {
            code: entry.code,
            label: entry.label,
            catalogVersion: ESOCIAL_CATALOG_SNAPSHOT.sourceVersion,
            sourceUrl: ESOCIAL_CATALOG_SNAPSHOT.sourceUrl,
            rationale: "",
          },
        });
      }}>{entry.code} · {entry.label}</button>
    </li>)}</ul>}
    {query && !matches.length && !selected && <p role="status">Nenhum código encontrado neste snapshot.</p>}
    {selected && <>
      <p role="status"><strong>Selecionado manualmente:</strong> {getEsocialCode("24", selected.code)?.code} · {selected.label} · {selected.catalogVersion}</p>
      <label className="form-field">Justificativa informada para esta associação
        <textarea required maxLength={2000} rows={3} value={selected.rationale} onChange={(event) => onChange({
          ...item,
          esocialTable24: { ...selected, rationale: event.target.value },
        })} placeholder="Registre por que a equipe relaciona este código a este risco; não declare apenas que o sistema validou."/>
      </label>
      <p>Fonte: <a href={selected.sourceUrl} target="_blank" rel="noreferrer">tabelas oficiais do eSocial</a>. Snapshot de referência, sem validação de vigência individual.</p>
      <button type="button" className="text-button" onClick={() => {
        setQuery("");
        onChange({ ...item, esocialTable24: undefined });
      }}>Remover associação manual</button>
    </>}
  </details>;
}

function RiskItemEditor({ item, index, onChange, onRemove, canManageTable24 }: {
  item: PgrRiskItem;
  index: number;
  onChange: (next: PgrRiskItem) => void;
  onRemove: () => void;
  canManageTable24: boolean;
}) {
  const set = (field: keyof PgrRiskItem, value: string) => onChange({ ...item, [field]: value });
  return <fieldset className="pgr-risk-entry">
    <legend>Risco {index + 1}</legend>
    <div className="pgr-form-grid">
      <label className="form-field">Processo<input maxLength={3000} value={item.process} onChange={(event) => set("process", event.target.value)}/></label>
      <label className="form-field">Atividade<input maxLength={3000} value={item.activity} onChange={(event) => set("activity", event.target.value)}/></label>
      <label className="form-field">Perigo<textarea maxLength={3000} rows={2} value={item.hazard} onChange={(event) => set("hazard", event.target.value)}/></label>
      <label className="form-field">Fonte e circunstância<textarea maxLength={3000} rows={2} value={item.sourceCircumstance} onChange={(event) => set("sourceCircumstance", event.target.value)}/></label>
      <label className="form-field">Possíveis agravos<textarea maxLength={3000} rows={2} value={item.possibleHarm} onChange={(event) => set("possibleHarm", event.target.value)}/></label>
      <label className="form-field">Grupos expostos<textarea rows={2} value={item.exposedGroups.join("\n")} onChange={(event) => onChange({ ...item, exposedGroups: lines(event.target.value) })}/></label>
      <label className="form-field">Caracterização da exposição<textarea maxLength={3000} rows={2} value={item.exposureDescription} onChange={(event) => set("exposureDescription", event.target.value)}/></label>
      <label className="form-field">Medidas existentes<textarea rows={2} value={item.existingMeasures.join("\n")} onChange={(event) => onChange({ ...item, existingMeasures: lines(event.target.value) })}/></label>
      <label className="form-field">Referências de evidência<textarea rows={2} value={item.evidenceRefs.join("\n")} onChange={(event) => onChange({ ...item, evidenceRefs: lines(event.target.value) })}/></label>
    </div>
    <div className="pgr-form-grid">
      <label className="form-field">Estado da avaliação<select value={item.assessment.status} onChange={(event) => onChange({ ...item, assessment: { ...item.assessment, status: event.target.value as PgrRiskItem["assessment"]["status"] } })}>
        <option value="reported">Relatado</option><option value="under_review">Em avaliação</option><option value="assessed">Avaliado · responsável informado</option>
      </select></label>
      {item.assessment.status === "assessed" && <>
        <label className="form-field">Método<input maxLength={500} value={item.assessment.method ?? ""} onChange={(event) => onChange({ ...item, assessment: { ...item.assessment, method: event.target.value } })}/></label>
        <label className="form-field">Decisão<textarea maxLength={1000} rows={2} value={item.assessment.decision ?? ""} onChange={(event) => onChange({ ...item, assessment: { ...item.assessment, decision: event.target.value } })}/></label>
        <label className="form-field">Responsável informado<input maxLength={200} value={item.assessment.assessor ?? ""} onChange={(event) => onChange({ ...item, assessment: { ...item.assessment, assessor: event.target.value } })}/></label>
        <label className="form-field">Data da avaliação<input type="date" value={item.assessment.assessedAt?.slice(0, 10) ?? ""} onChange={(event) => onChange({ ...item, assessment: { ...item.assessment, assessedAt: event.target.value } })}/></label>
      </>}
    </div>
    <EsocialTable24Picker item={item} onChange={onChange} canManage={canManageTable24}/>
    {item.assessment.status === "assessed" && <p className="pgr-structure-note">O responsável é informado no formulário; o sistema não confirma identidade, habilitação ou registro profissional.</p>}
    <div className="pgr-records">
      <h4>Avaliações ambientais · {item.exposureEvaluations?.length ?? 0}</h4>
      <p className="pgr-structure-note">Responsável, qualificação, registro profissional e ART são informações declaradas; o sistema não confirma identidade, habilitação nem validade do registro.</p>
      {(item.exposureEvaluations ?? []).map((evaluation, evaluationIndex) => <fieldset className="pgr-risk-entry" key={evaluation.id}>
        <legend>Avaliação {evaluationIndex + 1}</legend>
        <div className="pgr-form-grid">
          <label className="form-field">Agente avaliado<input maxLength={300} value={evaluation.agent} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, agent: event.target.value } : entry) })}/></label>
          <label className="form-field">Tipo<select value={evaluation.type} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, type: event.target.value as PgrExposureEvaluation["type"] } : entry) })}><option value="qualitative">Qualitativa</option><option value="quantitative">Quantitativa / medição</option></select></label>
          <label className="form-field">Andamento<select value={evaluation.status} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, status: event.target.value as PgrExposureEvaluation["status"] } : entry) })}><option value="planned">Planejada</option><option value="collected">Realizada · aguarda revisão</option><option value="reviewed">Revisada · responsável informado</option></select></label>
          <label className="form-field">Método<input maxLength={200} value={evaluation.method ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, method: event.target.value } : entry) })}/></label>
          <label className="form-field">Resultado<textarea maxLength={1000} rows={2} value={evaluation.result ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, result: event.target.value } : entry) })}/></label>
          {evaluation.type === "quantitative" && <label className="form-field">Unidade do resultado<input maxLength={200} value={evaluation.unit ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, unit: event.target.value } : entry) })}/></label>}
          <label className="form-field">Data da avaliação<input type="date" value={evaluation.evaluatedAt?.slice(0, 10) ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, evaluatedAt: event.target.value } : entry) })}/></label>
          <label className="form-field">Responsável informado<input maxLength={200} value={evaluation.responsible ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, responsible: event.target.value } : entry) })}/></label>
          <label className="form-field">Qualificação / conselho profissional<input maxLength={300} value={evaluation.qualification ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, qualification: event.target.value } : entry) })}/></label>
          <label className="form-field">Registro profissional<input maxLength={200} value={evaluation.professionalRegistration ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, professionalRegistration: event.target.value } : entry) })}/></label>
          <label className="form-field">Referência da ART (quando aplicável)<input maxLength={200} value={evaluation.artReference ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, artReference: event.target.value } : entry) })}/></label>
          <label className="form-field">Equipamento / instrumento<input maxLength={300} value={evaluation.equipment ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, equipment: event.target.value } : entry) })} placeholder="Ex.: dosímetro, bomba gravimétrica, medidor de calor"/></label>
          <label className="form-field">Marca, modelo e número de série<input maxLength={200} value={evaluation.equipmentId ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, equipmentId: event.target.value } : entry) })}/></label>
          <label className="form-field">Laboratório / entidade de calibração<input maxLength={200} value={evaluation.calibrationLab ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, calibrationLab: event.target.value } : entry) })}/></label>
          <label className="form-field">Certificado / laudo de calibração nº<input maxLength={200} value={evaluation.calibrationCertificate ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, calibrationCertificate: event.target.value } : entry) })}/></label>
          <label className="form-field">Data da calibração<input type="date" value={evaluation.calibrationDate ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, calibrationDate: event.target.value } : entry) })}/></label>
          <label className="form-field">Validade / próxima calibração<input type="date" value={evaluation.calibrationDueDate ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, calibrationDueDate: event.target.value } : entry) })}/></label>
          <label className="form-field">Referência ou link do certificado<input maxLength={200} value={evaluation.calibrationEvidenceRef ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, calibrationEvidenceRef: event.target.value } : entry) })} placeholder="O arquivo ainda deve ser anexado ao repositório documental"/></label>
          <label className="form-field">Estratégia de amostragem<textarea maxLength={1000} rows={2} value={evaluation.samplingStrategy ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, samplingStrategy: event.target.value } : entry) })} placeholder="Grupo, jornada, duração, quantidade e critério de seleção"/></label>
          <label className="form-field">Condições da avaliação<textarea maxLength={1000} rows={2} value={evaluation.environmentalConditions ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, environmentalConditions: event.target.value } : entry) })} placeholder="Processo em operação, tarefa, turno, condições representativas"/></label>
          <label className="form-field">Observações / monitoramento<textarea maxLength={1000} rows={2} value={evaluation.monitoringNotes ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, monitoringNotes: event.target.value } : entry) })}/></label>
          <label className="form-field">Próxima avaliação / monitoramento<input type="date" value={evaluation.nextMonitoringAt ?? ""} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, nextMonitoringAt: event.target.value } : entry) })}/></label>
          <label className="form-field">Referências de evidência<textarea rows={2} value={evaluation.evidenceRefs.join("\n")} onChange={(event) => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).map((entry) => entry.id === evaluation.id ? { ...entry, evidenceRefs: lines(event.target.value) } : entry) })}/></label>
        </div>
        <p className="pgr-structure-note">Cadastre dados conforme o certificado aplicável ao instrumento e aos procedimentos adotados. A referência acima não anexa arquivo; guarde o certificado no repositório documental e registre o vínculo. A ART é registrada como referência, quando aplicável. Confirme atribuições e exigências com o conselho profissional competente; o sistema não as determina.</p>
        <button className="text-button" type="button" onClick={() => onChange({ ...item, exposureEvaluations: (item.exposureEvaluations ?? []).filter((entry) => entry.id !== evaluation.id) })}>Remover avaliação</button>
      </fieldset>)}
      <button className="secondary-button" type="button" onClick={() => onChange({ ...item, exposureEvaluations: [...(item.exposureEvaluations ?? []), newExposureEvaluation()] })}>Adicionar avaliação ambiental</button>
    </div>
    <button className="text-button" type="button" onClick={onRemove}>Remover risco</button>
  </fieldset>;
}

function findPgrCompanyUnit(companies: ClientCompany[], prefill?: PgrPdfImportResult) {
  const cnpj = prefill?.company?.cnpj?.replace(/\D/g, "");
  if (!cnpj) return null;
  for (const company of companies) {
    if (company.status !== "active") continue;
    const unit = company.units.find((entry) => entry.cnpj.replace(/\D/g, "") === cnpj);
    if (unit) return { companyId: company.id, unitId: unit.id };
  }
  return null;
}

function InventoryEditor({ companies, record, prefill, canManageTable24 }: { companies: ClientCompany[]; record?: PgrInventoryRecord; prefill?: PgrPdfImportResult; canManageTable24: boolean }) {
  const [state, action, pending] = useActionState(savePgrInventoryPostgresAction, {} as FormState);
  const matchedCompanyUnit = findPgrCompanyUnit(companies, prefill);
  const [items, setItems] = useState<PgrRiskItem[]>(() => record?.inventory.items.map((item) => ({
    ...item,
    exposedGroups: [...item.exposedGroups],
    existingMeasures: [...item.existingMeasures],
    evidenceRefs: [...item.evidenceRefs],
    assessment: { ...item.assessment },
    exposureEvaluations: (item.exposureEvaluations ?? []).map((evaluation) => ({ ...evaluation, evidenceRefs: [...evaluation.evidenceRefs] })),
  })) ?? prefill?.risks.map((risk) => ({
    id: crypto.randomUUID(), process: "", activity: risk.activity, hazard: risk.hazard,
    sourceCircumstance: risk.sourceCircumstance ?? "", possibleHarm: risk.possibleHarm ?? "", exposedGroups: risk.role ? [risk.role] : [],
    exposureDescription: "", existingMeasures: [...risk.existingMeasures], evidenceRefs: [], assessment: { status: "reported" as const }, exposureEvaluations: [],
  })) ?? []);
  const [companyId, setCompanyId] = useState(record?.inventory.companyId ?? matchedCompanyUnit?.companyId ?? (prefill ? "" : companies.find((company) => company.status === "active")?.id ?? ""));
  const [unitId, setUnitId] = useState(record?.inventory.unitId ?? matchedCompanyUnit?.unitId ?? "");
  const company = companies.find((entry) => entry.id === companyId);
  const units = company?.units ?? [];
  const selectedUnitId = record?.inventory.unitId || unitId || (prefill ? "" : units[0]?.id || "");

  return <form action={action} className="pgr-form">
    {record && <><input type="hidden" name="inventoryId" value={record.id}/><input type="hidden" name="storageRevision" value={record.inventory.revision}/></>}
    <input type="hidden" name="items" value={JSON.stringify(items)}/>
    <div className="pgr-form-grid">
      <label className="form-field">Nome do inventário<input name="title" required maxLength={140} defaultValue={record?.inventory.title ?? prefill?.inventory.title} placeholder="Inventário de riscos · unidade"/></label>
      <label className="form-field">Empresa<select name="companyId" required value={companyId} disabled={!!record} onChange={(event) => { setCompanyId(event.target.value); setUnitId(""); }}>
        <option value="" disabled>Selecione a empresa</option>{companies.filter((entry) => entry.status === "active").map((entry) => <option key={entry.id} value={entry.id}>{entry.tradeName || entry.legalName}</option>)}
      </select></label>
      <label className="form-field">Unidade<select name="unitId" required value={selectedUnitId} disabled={!!record} onChange={(event) => setUnitId(event.target.value)}>
        {!selectedUnitId && <option value="" disabled>Selecione a unidade</option>}
        {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
      </select></label>
      <label className="form-field pgr-wide">Atividades e contexto observado<textarea name="activityDescription" required maxLength={3000} rows={3} defaultValue={record?.inventory.activityDescription} placeholder="Complete com as atividades e o contexto do estabelecimento; não foram inferidos pelo importador."/></label>
      <label className="form-field pgr-wide">Plano de ação definido pela organização<textarea name="actionPlan" required maxLength={5000} rows={3} defaultValue={record?.inventory.actionPlan} placeholder="Complete com as ações definidas pela organização; não foram inferidas pelo importador."/></label>
    </div>
    {record?.inventory.legacySource && <details className="document-versions">
      <summary>Relato legado preservado · revisão de origem {record.inventory.legacySource.revision}</summary>
      {record.inventory.legacySource.snapshots.map((snapshot) => <article className="pgr-risk-entry" key={snapshot.version}>
        <h4>Revisão {snapshot.version} · {snapshot.title}</h4><p>{snapshot.riskInventory}</p>
        <small>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(snapshot.savedAt))} · relato original</small>
      </article>)}
    </details>}
    <div className="pgr-records"><h4>Itens do inventário · {items.length}</h4>
      {items.map((item, index) => <RiskItemEditor key={item.id} item={item} index={index}
        canManageTable24={canManageTable24}
        onChange={(updated) => setItems((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate))}
        onRemove={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))}/>)}
      <button className="secondary-button" type="button" onClick={() => setItems((current) => [...current, newRiskItem()])}>Adicionar risco</button>
    </div>
    {state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}
    {state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}
    <div className="pgr-form-footer"><p>Relatos não são convertidos em avaliação. Classificação exige método, decisão, responsável e data.</p>
      <button className="primary-button" type="submit" disabled={pending || !companyId || !selectedUnitId}>{pending ? "Salvando…" : record ? "Salvar inventário" : "Criar inventário"}</button>
    </div>
  </form>;
}

function TransitionForm({ record, approve = false }: { record: PgrInventoryRecord; approve?: boolean }) {
  const action = approve ? approvePgrInventoryPostgresAction : submitPgrInventoryPostgresAction;
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const missingRiskFields = record.inventory.items.some((item) =>
    [item.process, item.activity, item.hazard, item.sourceCircumstance, item.possibleHarm, item.exposureDescription]
      .some((field) => !field.trim()));
  const approvalBlocker = approve
    ? record.inventory.items.length === 0
      ? "A revisão interna aguarda riscos estruturados informados pelo responsável. O relato legado segue preservado."
      : missingRiskFields
        ? "Complete processo, atividade, perigo, circunstância, possível dano e exposição em cada risco antes da revisão interna."
        : null
    : null;
  return <form action={formAction}>
    <input type="hidden" name="inventoryId" value={record.id}/>
    <input type="hidden" name="storageRevision" value={record.inventory.revision}/>
    {state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}
    {state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}
    {approvalBlocker && <p className="client-form-message" role="note">{approvalBlocker}</p>}
    <button className="secondary-button" type="submit" disabled={pending}>{pending ? "Processando…" : approve ? "Registrar revisão interna" : "Enviar para revisão"}</button>
  </form>;
}

export default function PgrPostgresSection({ records, companies, canManage, canReview, canManageTable24 = false, prefill }: {
  records: PgrInventoryRecord[];
  companies: ClientCompany[];
  canManage: boolean;
  canReview: boolean;
  canManageTable24?: boolean;
  prefill?: PgrPdfImportResult | null;
}) {
  return <section className="panel pgr-section" aria-labelledby="pgr-postgres-title">
    <div className="panel-heading"><div><h2 id="pgr-postgres-title">PGR · inventário estruturado</h2><p>Registros e revisões preservados por unidade.</p><p><Link href="/referencias">Consultar o catálogo completo das Tabelas 24 e 27 do eSocial →</Link></p></div><span className="period-label">Demonstração local</span></div>
    <div className="document-warning"><strong>O sistema não classifica nem calcula riscos.</strong> Relatos e avaliações dependem de revisão humana responsável.</div>
    {canManage && <details className="pgr-edit" open={!!prefill}><summary>{prefill ? "Rascunho preenchido com dados do PDF" : "Novo inventário"}</summary><InventoryEditor key={prefill?.fileId ?? "new"} companies={companies} prefill={prefill ?? undefined} canManageTable24={canManageTable24}/></details>}
    <div className="pgr-records"><h3>Inventários e revisões</h3>
      {records.length ? records.map((record) => {
        const company = companies.find((entry) => entry.id === record.inventory.companyId);
        const unit = company?.units.find((entry) => entry.id === record.inventory.unitId);
        return <article className="pgr-card" key={record.id}>
          <header><div><h4>{record.inventory.title}</h4><p>{company?.tradeName || company?.legalName || "Empresa"} · {unit?.name || "Unidade"} · revisão {record.inventory.revision}</p></div><span className="period-label">{statusLabel[record.status]}</span></header>
          <p className="pgr-export-notice">DEMONSTRAÇÃO · Conteúdo sujeito à validação profissional; não declara conformidade.</p>
          <section><h5>Atividades e contexto</h5><p>{record.inventory.activityDescription}</p></section>
          <section><h5>Itens estruturados · {record.inventory.items.length}</h5>
            <p className="pgr-structure-note">Os responsáveis e registros profissionais exibidos são informados no formulário e não são verificados pelo sistema.</p>
            {record.inventory.items.length ? record.inventory.items.map((item) => <article className="pgr-risk-entry" key={item.id}>
              <h6>{item.hazard || "Perigo ainda não detalhado"}</h6><p>{item.sourceCircumstance || "Fonte/circunstância a registrar."}</p>
              <dl className="pgr-field-grid"><dt>Processo / atividade</dt><dd>{[item.process, item.activity].filter(Boolean).join(" · ") || "A registrar"}</dd><dt>Agravos possíveis</dt><dd>{item.possibleHarm || "A avaliar"}</dd><dt>Grupos expostos</dt><dd>{item.exposedGroups.join(", ") || "A identificar"}</dd><dt>Exposição</dt><dd>{item.exposureDescription || "A caracterizar"}</dd><dt>Medidas existentes</dt><dd>{item.existingMeasures.join("; ") || "A verificar"}</dd><dt>Evidências</dt><dd>{item.evidenceRefs.join("; ") || "Nenhuma referência registrada"}</dd><dt>Avaliação</dt><dd>{item.assessment.status === "assessed" ? `${item.assessment.decision} · método: ${item.assessment.method} · responsável informado: ${item.assessment.assessor} · data: ${item.assessment.assessedAt}` : item.assessment.status === "under_review" ? "Em avaliação" : "Relatado, sem classificação"}</dd></dl>
              {item.esocialTable24 && <section className="pgr-structure-note"><h6>Associação manual à Tabela 24 · S-2240</h6><p><strong>{item.esocialTable24.code} · {item.esocialTable24.label}</strong></p><p>{item.esocialTable24.rationale}</p><p>Snapshot: {item.esocialTable24.catalogVersion}. Associação informada manualmente; aplicabilidade e vigência precisam ser conferidas na fonte oficial.</p></section>}
              {(item.exposureEvaluations?.length ?? 0) > 0 && <section><h6>Avaliações ambientais</h6>{item.exposureEvaluations?.map((evaluation) => <dl className="pgr-field-grid" key={evaluation.id}>
                <dt>Agente / tipo</dt><dd>{evaluation.agent} · {evaluation.type === "quantitative" ? "quantitativa / medição" : "qualitativa"}</dd>
                <dt>Andamento</dt><dd>{evaluation.status === "planned" ? "Planejada" : evaluation.status === "collected" ? "Realizada · aguarda revisão" : "Revisada · responsável informado"}</dd>
                <dt>Método / resultado</dt><dd>{evaluation.method || "A registrar"} · {evaluation.result || "A registrar"}{evaluation.unit ? ` ${evaluation.unit}` : ""}</dd>
                <dt>Data</dt><dd>{evaluation.evaluatedAt || "A registrar"}</dd>
                <dt>Responsável informado</dt><dd>{evaluation.responsible || "A registrar"}{evaluation.qualification ? ` · ${evaluation.qualification}` : ""}{evaluation.professionalRegistration ? ` · Registro informado: ${evaluation.professionalRegistration}` : ""}</dd>
                <dt>ART</dt><dd>{evaluation.artReference || "Não informada · verificar aplicabilidade"}</dd>
                <dt>Instrumento / identificação</dt><dd>{[evaluation.equipment, evaluation.equipmentId].filter(Boolean).join(" · ") || "A informar"}</dd>
                <dt>Calibração / certificado</dt><dd>{[evaluation.calibrationLab, evaluation.calibrationCertificate && `Certificado ${evaluation.calibrationCertificate}`, evaluation.calibrationDate && `calibrado em ${evaluation.calibrationDate}`, evaluation.calibrationDueDate && `validade ${evaluation.calibrationDueDate}`, evaluation.calibrationEvidenceRef].filter(Boolean).join(" · ") || "A informar"}</dd>
                <dt>Amostragem / condições</dt><dd>{[evaluation.samplingStrategy, evaluation.environmentalConditions].filter(Boolean).join(" · ") || "A informar"}</dd>
                <dt>Monitoramento</dt><dd>{[evaluation.monitoringNotes, evaluation.nextMonitoringAt && `próxima avaliação: ${evaluation.nextMonitoringAt}`].filter(Boolean).join(" · ") || "Sem programação registrada"}</dd>
                <dt>Evidências</dt><dd>{evaluation.evidenceRefs.join("; ") || "Nenhuma referência registrada"}</dd>
              </dl>)}</section>}
            </article>) : <p className="page-description">Nenhum risco estruturado foi inferido do relato legado.</p>}
          </section>
          <p><strong>Plano de ação</strong><br/>{record.inventory.actionPlan}</p>
          {record.inventory.legacySource?.snapshots.at(-1) && <section className="pgr-content"><h5>Relato original preservado · não convertido em itens estruturados</h5><p>{record.inventory.legacySource.snapshots.at(-1)?.riskInventory}</p></section>}
          {record.inventory.legacySource && <details className="document-versions"><summary>Relato original preservado · {record.inventory.legacySource.snapshots.length} revisões</summary>
            {record.inventory.legacySource.snapshots.map((snapshot) => <article key={snapshot.version}><h5>Revisão de origem {snapshot.version} · {snapshot.title}</h5><p>{snapshot.riskInventory}</p></article>)}
            <ul>{record.inventory.legacySource.history.map((entry) => <li key={entry.id}>{entry.action} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.occurredAt))}</li>)}</ul>
          </details>}
          {record.status === "draft" && canManage && <details className="pgr-edit"><summary>Editar inventário</summary><InventoryEditor companies={companies} record={record} canManageTable24={canManageTable24}/></details>}
          {record.status === "draft" && canManage && <TransitionForm record={record}/>}
          {record.status === "in_review" && canReview && <TransitionForm record={record} approve/>}
          {record.reviewerUserId && <p className="pgr-review-note">Revisão interna registrada. Isso não representa assinatura eletrônica.</p>}
          <button className="text-button pgr-print" type="button" onClick={(event) => {
            const card = event.currentTarget.closest(".pgr-card");
            if (!card) return;
            const copy = document.createElement("div");
            copy.className = "pgr-print-copy";
            copy.appendChild(card.cloneNode(true));
            document.body.appendChild(copy);
            try { window.print(); } finally { copy.remove(); }
          }}>Imprimir / salvar cópia</button>
        </article>;
      }) : <p className="client-empty">Nenhum inventário de PGR foi registrado.</p>}
    </div>
  </section>;
}
