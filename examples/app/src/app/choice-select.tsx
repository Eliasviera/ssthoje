"use client";

import { useMemo, useState } from "react";
import type { VocabularyEntry } from "@/lib/field-vocabulary";

// Listas suspensas nativas para os formulários de AR, APR, PT e PTE.
// A pessoa vê a seta, abre a lista e escolhe; "Outro (escrever)" mantém o texto livre.
// As opções são apoio de digitação, não critério técnico, trava ou liberação.

export type Choice = { value: string; label: string; group?: string };
const CUSTOM = "__custom__";

/** Converte o acervo de campo em opções agrupadas (ex.: Físico, EPI, Medida administrativa). */
export function vocabularyChoices(entries: VocabularyEntry[]): Choice[] {
  return entries.map((entry) => ({ value: entry.label, label: entry.simpleLabel ?? entry.label, group: entry.group }));
}

function Options({ choices }: { choices: Choice[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, Choice[]>();
    for (const choice of choices) {
      const key = choice.group ?? "";
      const list = map.get(key);
      if (list) list.push(choice);
      else map.set(key, [choice]);
    }
    return [...map.entries()];
  }, [choices]);
  return <>{groups.map(([group, list]) => group
    ? <optgroup key={group} label={group}>{list.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</optgroup>
    : list.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>))}</>;
}

export default function ChoiceSelect({
  label,
  choices,
  value,
  onChange,
  required,
  disabled,
  name,
  placeholder = "Selecione",
  customLabel = "Outro (escrever)",
  customPlaceholder = "Escreva outro texto",
  hint,
}: {
  label: string;
  choices: Choice[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  placeholder?: string;
  customLabel?: string;
  customPlaceholder?: string;
  hint?: string;
}) {
  const [custom, setCustom] = useState(false);
  const known = choices.some((choice) => choice.value === value);
  const isCustom = custom || (value !== "" && !known);
  return <div className="form-field choice-field">
    <span>{label}{required ? " *" : ""}</span>
    <select
      className="choice-select"
      value={isCustom ? CUSTOM : value}
      required={required && !isCustom}
      disabled={disabled}
      name={isCustom ? undefined : name}
      onChange={(event) => {
        const next = event.target.value;
        if (next === CUSTOM) { setCustom(true); return; }
        setCustom(false);
        onChange(next);
      }}
    >
      <option value="">{placeholder}</option>
      <Options choices={choices}/>
      <option value={CUSTOM}>{customLabel}</option>
    </select>
    {isCustom && <input
      name={name}
      value={value}
      required={required}
      maxLength={500}
      autoComplete="off"
      placeholder={customPlaceholder}
      onChange={(event) => onChange(event.target.value)}
    />}
    {hint && <small className="choice-hint">{hint}</small>}
  </div>;
}

/** Lista suspensa + botão para acrescentar o item escolhido a um texto (ex.: medidas). */
export function ChoiceAppend({
  label,
  choices,
  onAppend,
  buttonLabel = "Acrescentar",
  hint,
}: {
  label: string;
  choices: Choice[];
  onAppend: (value: string) => void;
  buttonLabel?: string;
  hint?: string;
}) {
  const [value, setValue] = useState("");
  return <div className="form-field choice-append">
    <span>{label}</span>
    <div className="choice-append-row">
      <select className="choice-select" value={value} onChange={(event) => setValue(event.target.value)}>
        <option value="">Selecione uma opção do acervo</option>
        <Options choices={choices}/>
      </select>
      <button className="secondary-button" type="button" disabled={!value} onClick={() => { onAppend(value); setValue(""); }}>{buttonLabel}</button>
    </div>
    {hint && <small className="choice-hint">{hint}</small>}
  </div>;
}
