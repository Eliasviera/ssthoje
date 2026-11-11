"use client";

import { useActionState, useState } from "react";
import type { SafetyApr } from "@/lib/safety-operations-store";
import { saveSafetyAprAnswersAction, type SafetyOperationsFormState } from "./safety-operations-actions";

// Checklist da APR: cada item é marcado e a marcação abre o campo de análise
// correspondente. Ponto a tratar exige análise, próximo passo e responsável;
// não aplicável exige justificativa — as mesmas regras já validadas no servidor.

const RESULT_OPTIONS = [
  { value: "observed", label: "Condição observada", hint: "Item conforme o esperado" },
  { value: "attention", label: "Ponto a tratar", hint: "Exige análise, próximo passo e responsável" },
  { value: "not_applicable", label: "Não aplicável", hint: "Exige justificativa" },
  { value: "unanswered", label: "Ainda não respondido", hint: "Item pendente" },
] as const;

type AnswerState = { result: string; notes: string; nextStep: string; responsible: string };

function Feedback({ state }: { state: SafetyOperationsFormState }) {
  return <>{state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}</>;
}

export default function AprChecklistForm({ apr }: { apr: SafetyApr }) {
  const [state, action, pending] = useActionState(saveSafetyAprAnswersAction, {});
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() => Object.fromEntries(
    apr.answers.map((answer) => [answer.id, { result: answer.result, notes: answer.notes, nextStep: answer.nextStep, responsible: answer.responsible }]),
  ));
  const answered = Object.values(answers).filter((answer) => answer.result !== "unanswered").length;
  function setResult(id: string, result: string) {
    setAnswers((current) => ({
      ...current,
      [id]: {
        ...current[id],
        result,
        ...(result === "attention" ? {} : { nextStep: "", responsible: "" }),
        ...(result === "unanswered" ? { notes: "" } : {}),
      },
    }));
  }
  function setField(id: string, field: "notes" | "nextStep" | "responsible", value: string) {
    setAnswers((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }
  return <form action={action} className="pgr-form apr-checklist">
    <input type="hidden" name="aprId" value={apr.id}/>
    <input type="hidden" name="expectedRevision" value={apr.revision}/>
    <p className="permission-note pgr-wide" role="status">{answered} de {apr.answers.length} item(ns) marcado(s). Marque o resultado e o campo de análise abre conforme a escolha.</p>
    {apr.answers.map((answer, index) => {
      const value = answers[answer.id];
      return <fieldset className="aso-exams pgr-wide" key={answer.id}>
        <legend>{index + 1}. {answer.prompt}</legend>
        <div className="apr-result-options" role="radiogroup" aria-label={`Resultado do item ${index + 1}`}>
          {RESULT_OPTIONS.map((option) => <label key={option.value} className={value.result === option.value ? "apr-result-option apr-result-selected" : "apr-result-option"}>
            <input
              type="radio"
              name={`result_${answer.id}`}
              value={option.value}
              checked={value.result === option.value}
              onChange={() => setResult(answer.id, option.value)}
            />
            <span><strong>{option.label}</strong><small>{option.hint}</small></span>
          </label>)}
        </div>
        {value.result === "attention" && <div className="apr-result-fields">
          <label className="form-field pgr-wide">Análise do item<textarea name={`notes_${answer.id}`} required maxLength={1200} rows={3} value={value.notes} onChange={(event) => setField(answer.id, "notes", event.target.value)} placeholder="O que foi observado e por que é ponto a tratar."/></label>
          <label className="form-field pgr-wide">Próximo passo<textarea name={`nextStep_${answer.id}`} required maxLength={600} rows={2} value={value.nextStep} onChange={(event) => setField(answer.id, "nextStep", event.target.value)} placeholder="Ação definida para tratar o item."/></label>
          <label className="form-field">Responsável pelo próximo passo<input name={`responsible_${answer.id}`} required maxLength={120} value={value.responsible} onChange={(event) => setField(answer.id, "responsible", event.target.value)}/></label>
        </div>}
        {value.result === "not_applicable" && <div className="apr-result-fields">
          <label className="form-field pgr-wide">Justificativa<textarea name={`notes_${answer.id}`} required maxLength={1200} rows={2} value={value.notes} onChange={(event) => setField(answer.id, "notes", event.target.value)} placeholder="Por que o item não se aplica a esta atividade."/></label>
          <input type="hidden" name={`nextStep_${answer.id}`} value=""/>
          <input type="hidden" name={`responsible_${answer.id}`} value=""/>
        </div>}
        {value.result === "observed" && <div className="apr-result-fields">
          <label className="form-field pgr-wide">Observação (opcional)<textarea name={`notes_${answer.id}`} maxLength={1200} rows={2} value={value.notes} onChange={(event) => setField(answer.id, "notes", event.target.value)} placeholder="Detalhe do que foi observado em campo."/></label>
          <input type="hidden" name={`nextStep_${answer.id}`} value=""/>
          <input type="hidden" name={`responsible_${answer.id}`} value=""/>
        </div>}
        {value.result === "unanswered" && <>
          <input type="hidden" name={`notes_${answer.id}`} value=""/>
          <input type="hidden" name={`nextStep_${answer.id}`} value=""/>
          <input type="hidden" name={`responsible_${answer.id}`} value=""/>
        </>}
      </fieldset>;
    })}
    <Feedback state={state}/>
    <div className="pgr-form-footer"><p>Salvar preserva a revisão anterior por controle de revisão. Ponto a tratar exige análise, próximo passo e responsável antes do envio.</p><button className="secondary-button" disabled={pending}>{pending ? "Salvando…" : "Salvar respostas"}</button></div>
  </form>;
}
