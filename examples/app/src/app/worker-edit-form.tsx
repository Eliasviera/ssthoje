"use client";

import { useActionState } from "react";
import { updateWorkerAction } from "./worker-actions";
import type { WorkerRecord } from "@/lib/worker-store";
import { DEMO_RISK_CATEGORIES } from "@/lib/worker-categories";

export default function WorkerEditForm({ worker }: { worker: WorkerRecord }) {
  const [state, formAction, pending] = useActionState(updateWorkerAction, {});
  return <details className="worker-edit"><summary>Editar cadastro e treinamentos demonstrativos</summary><form action={formAction}>
    <input type="hidden" name="workerId" value={worker.id}/>
    <label className="worker-edit-label" htmlFor={`edit-name-${worker.id}`}>Identificação fictícia</label><input className="worker-edit-input" id={`edit-name-${worker.id}`} name="displayName" required maxLength={120} defaultValue={worker.displayName}/>
    <label className="worker-edit-label" htmlFor={`edit-sex-${worker.id}`}>Sexo demonstrativo</label><select className="worker-edit-input" id={`edit-sex-${worker.id}`} name="sex" defaultValue={worker.sex ?? "Não informado"}><option>Não informado</option><option>Feminino</option><option>Masculino</option></select>
    <label className="worker-edit-label" htmlFor={`edit-job-${worker.id}`}>Função</label><input className="worker-edit-input" id={`edit-job-${worker.id}`} name="jobTitle" required maxLength={120} defaultValue={worker.jobTitle}/>
    <label className="worker-edit-label" htmlFor={`edit-area-${worker.id}`}>Área / setor (centro de custo)</label><input className="worker-edit-input" id={`edit-area-${worker.id}`} name="area" maxLength={120} defaultValue={worker.area ?? ""}/>
    <label className="worker-edit-label" htmlFor={`edit-nr35-training-${worker.id}`}>Treinamento NR-35</label><select className="worker-edit-input" id={`edit-nr35-training-${worker.id}`} name="nr35TrainingStatus" defaultValue={worker.nr35TrainingStatus ?? "not_informed"}><option value="not_informed">Não informado</option><option value="reported_pending_validation">Informado · pendente de validação</option></select>
    <label className="worker-edit-label" htmlFor={`edit-height-supervision-training-${worker.id}`}>Treinamento focado em supervisão de trabalho em altura</label><select className="worker-edit-input" id={`edit-height-supervision-training-${worker.id}`} name="heightWorkSupervisionTrainingStatus" defaultValue={worker.heightWorkSupervisionTrainingStatus ?? "not_informed"}><option value="not_informed">Não informado</option><option value="reported_pending_validation">Informado · pendente de validação</option></select>
    <label className="worker-edit-label" htmlFor={`edit-scaffolding-training-${worker.id}`}>Treinamento para montagem/desmontagem de andaimes</label><select className="worker-edit-input" id={`edit-scaffolding-training-${worker.id}`} name="scaffoldingAssemblyTrainingStatus" defaultValue={worker.scaffoldingAssemblyTrainingStatus ?? "not_informed"}><option value="not_informed">Não informado</option><option value="reported_pending_validation">Informado · pendente de validação</option></select>
    <fieldset className="worker-edit-risks"><legend>Categorias para revisão</legend>{DEMO_RISK_CATEGORIES.map((category) => <label key={category}><input type="checkbox" name="riskCategory" value={category} defaultChecked={worker.riskCategories.includes(category)}/><span>{category}</span></label>)}</fieldset>
    {state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}
    <button className="secondary-button" type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar alteração"}</button>
  </form></details>;
}
