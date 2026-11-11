"use client";

import { useActionState, useState } from "react";
import { WORK_PERMIT_SOURCE_FIELD_MAPS } from "@/lib/work-permit-source-field-maps";
import { optionsForField } from "@/lib/work-permit-field-options";
import ChoiceSelect, { ChoiceAppend, vocabularyChoices } from "../choice-select";
import type { VocabularyEntry } from "@/lib/field-vocabulary";
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

// Campos de PT/PTE que também recebem opções do acervo genérico de campo.
const ACERVO_FIELD_KIND: Record<string, string> = {
  "space-location": "location",
};

export default function WorkPermitSourceFormPreview({ mapId, draft, aprOptions, vocabulary }: { mapId: WorkPermitSourceMapId; draft?: WorkPermitDraft; aprOptions: AprOption[]; vocabulary: VocabularyEntry[] }) {
  const [values, setValues] = useState<Record<string, string>>(draft?.values ?? {});
  const [title, setTitle] = useState(draft?.title ?? "");
  const [aprId, setAprId] = useState(draft?.aprId ?? "");
  const [state, formAction, pending] = useActionState<SafetyOperationsFormState, FormData>(saveWorkPermitDraftAction, {});
  const source = WORK_PERMIT_SOURCE_FIELD_MAPS.find((item) => item.id === mapId);
  const activityChoices = vocabularyChoices(vocabulary.filter((entry) => entry.kind === "activity"));
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
      <p className="document-warning"><strong>Somente dados fictícios.</strong> O salvamento guarda um rascunho demonstrativo no servidor, com histórico de revisões. Esta tela não é uma permissão, não contém checklist técnico e não libera atividade. Campos com lista oferecem opções do formulário de origem; você pode escolher uma ou escrever outro texto, e nada disso é tratado como critério.</p>
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
            const options = optionsForField(field.id);
            const acervoKind = ACERVO_FIELD_KIND[field.id];
            const acervoChoices = acervoKind ? vocabularyChoices(vocabulary.filter((entry) => entry.kind === acervoKind)) : [];
            const choices = options.length ? options.map((option) => ({ value: option, label: option })) : acervoChoices;
            return choices.length
              ? <div className="pgr-wide" key={field.id}>
                <ChoiceSelect
                  name={`field.${key}`}
                  label={field.label}
                  choices={choices}
                  value={value}
                  onChange={update}
                  customPlaceholder="Escreva outro texto"
                  hint={options.length ? "Escolha uma opção do formulário ou escreva outro texto." : "Opções do acervo de campo; escolha uma ou escreva outro texto."}
                />
              </div>
              : <div className="pgr-wide" key={field.id}>
                <label className="form-field pgr-wide">
                  <span>{field.label}</span>
                  {MULTILINE_FIELD_IDS.has(field.id)
                    ? <textarea name={`field.${key}`} rows={3} maxLength={3000} autoComplete="off" value={value} onChange={(event) => update(event.target.value)} />
                    : <input name={`field.${key}`} maxLength={3000} autoComplete="off" value={value} onChange={(event) => update(event.target.value)} />}
                </label>
                {field.id === "work-description" && <ChoiceAppend label="Acrescentar atividade do acervo" choices={activityChoices} onAppend={(activity) => update(value.trim() ? `${value.trimEnd()}\n${activity}` : activity)}/>}
              </div>;
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
