"use client";

import { useActionState, useState } from "react";
import { WORK_PERMIT_SOURCE_FIELD_MAPS } from "@/lib/work-permit-source-field-maps";
import { saveWorkPermitDraftAction } from "@/app/safety-operations-actions";
import type { SafetyOperationsFormState } from "@/app/safety-operations-actions";
import type { WorkPermitDraft } from "@/lib/work-permit-draft-store";

type WorkPermitSourceMapId = (typeof WORK_PERMIT_SOURCE_FIELD_MAPS)[number]["id"];
const MULTILINE_FIELD_IDS = new Set([
  "work-description", "team-identity", "training-reported", "measurement-readings",
  "ventilation-project-execution", "lockout-devices", "zero-energy-record", "monitoring-record",
  "observations", "closeout-responsible", "grain-mass-condition", "scenario-authorization-record",
  "area-preparation", "fire-watch-record", "fire-resources", "electrical-verification",
  "existing-interferences", "water-soil-conditions", "lifting-plan-equipment", "document-responsibles",
  "completion", "audit-record",
]);
type AprOption = {
  id: string;
  title: string;
  revision: number;
  status: string;
  companyName: string;
  unitName: string;
  workArea: string;
  activityStage: string;
};

export default function WorkPermitSourceFormPreview({ mapId, draft, aprOptions }: { mapId: WorkPermitSourceMapId; draft?: WorkPermitDraft; aprOptions: AprOption[] }) {
  const [values, setValues] = useState<Record<string, string>>(draft?.values ?? {});
  const [title, setTitle] = useState(draft?.title ?? "");
  const [aprId, setAprId] = useState(draft?.aprId ?? "");
  const [state, formAction, pending] = useActionState<SafetyOperationsFormState, FormData>(saveWorkPermitDraftAction, {});
  const source = WORK_PERMIT_SOURCE_FIELD_MAPS.find((item) => item.id === mapId);
  if (!source) return null;

  function clearPreview() {
    setValues({});
  }

  function applyAprContext() {
    const apr = aprOptions.find((item) => item.id === aprId);
    if (!apr) return;
    const fields = mapId === "pte-confined-space"
      ? {
          "identity-activity.apr-reference": `${apr.title} · revisão ${apr.revision}`,
          ...(apr.companyName ? { "identity-activity.company": apr.companyName } : {}),
          ...(apr.workArea ? { "identity-activity.space-location": apr.workArea } : {}),
          ...(apr.activityStage ? { "identity-activity.work-description": apr.activityStage } : {}),
        }
      : {
          "identity-team.apr-reference": `${apr.title} · revisão ${apr.revision}`,
          ...(apr.companyName ? { "identity-team.company-labor-origin": apr.companyName } : {}),
          ...([apr.workArea, apr.unitName].filter(Boolean).length ? { "identity-team.site-area-sector": [apr.workArea, apr.unitName].filter(Boolean).join(" · ") } : {}),
          ...(apr.activityStage ? { "identity-team.work-description": apr.activityStage } : {}),
        };
    setValues((current) => ({ ...current, ...fields }));
  }

  return (
    <details id={`permit-form-${source.id}`} className="pgr-card" open={Boolean(draft)}>
      <summary>{draft ? "Editando rascunho" : "Novo rascunho demonstrativo"} · {source.title}</summary>
      <p className="document-warning"><strong>Somente dados fictícios.</strong> O salvamento guarda um rascunho demonstrativo no servidor, com histórico de revisões. Esta tela não é uma permissão, não contém checklist técnico e não libera atividade.</p>
      <h3>{source.title}</h3>
      <p className="period-label">Revisão técnica pendente</p>
      <form action={formAction}>
        <input type="hidden" name="mapId" value={source.id} />
        {draft ? <><input type="hidden" name="draftId" value={draft.id} /><input type="hidden" name="draftRevision" value={draft.revision} /></> : null}
        <label className="form-field pgr-wide"><span>Título do rascunho</span><input name="title" required maxLength={160} autoComplete="off" placeholder="Ex.: demonstração de atividade" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="form-field pgr-wide"><span>APR de referência (opcional)</span><select name="aprId" value={aprId} onChange={(event) => setAprId(event.target.value)}><option value="">Sem vínculo com APR</option>{aprOptions.map((apr) => <option key={apr.id} value={apr.id}>{apr.title} · revisão {apr.revision} · {apr.status === "in_review" ? "em revisão" : "rascunho"}</option>)}</select></label>
        {!aprOptions.length ? <p className="permission-note">Nenhuma APR desta consultoria está disponível para vincular.</p> : null}
        {aprId ? <div className="pgr-wide"><p className="permission-note">Pode preencher referência, empresa, localização e atividade a partir da APR selecionada. Os campos continuam editáveis; riscos e controles não são copiados.</p><button className="secondary-button" type="button" onClick={applyAprContext}>Preencher contexto da APR</button></div> : null}
        {source.sections.map((section) => (
        <fieldset className="aso-exams pgr-wide" key={section.id}>
          <legend>{section.title}</legend>
          {section.fields.map((field) => {
            const key = `${section.id}.${field.id}`;
            const value = values[key] ?? "";
            const update = (next: string) => setValues((current) => ({ ...current, [key]: next }));
            return (
              <label className="form-field pgr-wide" key={field.id}>
                <span>{field.label}</span>
                {MULTILINE_FIELD_IDS.has(field.id)
                  ? <textarea name={`field.${key}`} rows={3} maxLength={3000} autoComplete="off" value={value} onChange={(event) => update(event.target.value)} />
                  : <input name={`field.${key}`} maxLength={3000} autoComplete="off" value={value} onChange={(event) => update(event.target.value)} />}
              </label>
            );
          })}
        </fieldset>
      ))}
        {state.error ? <p role="alert" className="document-warning">{state.error}</p> : null}
        {state.success ? <p role="status" className="period-label">{state.success}</p> : null}
        <button className="primary-button" type="submit" disabled={pending}>{pending ? "Salvando…" : draft ? "Atualizar rascunho demonstrativo" : "Salvar rascunho demonstrativo"}</button>
        <button className="secondary-button" type="button" onClick={clearPreview}>Limpar campos</button>
      </form>
    </details>
  );
}
