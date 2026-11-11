"use client";

import { useActionState } from "react";
import { publishNr5Action, saveNr5DraftAction, updateTermDatesAction, type CipaFormState } from "./actions";

// Formulários da CIPA. Nenhum campo normativo é preenchido automaticamente:
// o responsável técnico digita o que conferiu na norma oficial.

const initialState: CipaFormState = {};

const RISK_GRADES = [1, 2, 3, 4];

export type PublishedStandard = { id: string; edition: string; issuingAct: string; validFrom: string };

export default function CipaAdminPanel({
  standards,
  terms,
  canManage,
}: {
  standards: PublishedStandard[];
  terms: Array<{ id: string; label: string; endsOn: string; possessionOn: string | null }>;
  canManage: boolean;
}) {
  const [draftState, draftAction, draftPending] = useActionState(saveNr5DraftAction, initialState);
  const [publishState, publishAction, publishPending] = useActionState(publishNr5Action, initialState);
  const [termState, termAction, termPending] = useActionState(updateTermDatesAction, initialState);

  if (!canManage) {
    return (
      <section className="panel" aria-labelledby="cipa-admin-title">
        <div className="panel-heading"><div><h2 id="cipa-admin-title">Administração da CIPA</h2></div></div>
        <p>Seu perfil pode consultar a CIPA, mas não administrar o catálogo da norma nem os mandatos.</p>
      </section>
    );
  }

  return (
    <>
      <section className="panel" aria-labelledby="nr5-catalog-title">
        <div className="panel-heading">
          <div>
            <h2 id="nr5-catalog-title">Catálogo da NR-5</h2>
            <p>
              Registre a edição conferida da norma e as faixas do Quadro I. O rascunho não vale para
              cálculo até ser publicado com quem conferiu e a data da conferência.
            </p>
          </div>
        </div>

        <form action={draftAction} className="cipa-form">
          <fieldset>
            <legend>Edição da norma</legend>
            <div className="cipa-form-row">
              <label>Edição<input name="edition" required maxLength={80} placeholder="NR-05 atualizada 2022" /></label>
              <label>Portaria<input name="issuingAct" required maxLength={200} placeholder="Portaria MTP nº 4.219, de 20/12/2022" /></label>
              <label>Vigência a partir de<input name="validFrom" type="date" required /></label>
            </div>
            <div className="cipa-form-row">
              <label>Endereço do arquivo oficial<input name="sourceUrl" maxLength={600} placeholder="https://www.gov.br/…/nr-05-atualizada-2022.pdf" /></label>
              <label>SHA-256 do arquivo<input name="sourceHash" required minLength={64} maxLength={64} pattern="[0-9a-fA-F]{64}" placeholder="64 caracteres hexadecimais" /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Quadro I — dimensionamento por grau de risco</legend>
            <p className="field-help">
              Informe uma faixa por grau de risco. Os valores precisam ser transcritos da norma
              conferida; o sistema não calcula nem deduz dimensionamento.
            </p>
            <div className="cipa-form-table">
              <table>
                <thead><tr><th>Grau</th><th>Empregados de</th><th>até</th><th>Efetivos</th><th>Suplentes</th></tr></thead>
                <tbody>
                  {RISK_GRADES.map((grade) => (
                    <tr key={grade}>
                      <th scope="row">GR {grade}</th>
                      <td><input name={`from-${grade}`} type="number" min={0} inputMode="numeric" aria-label={`GR ${grade} empregados de`} /></td>
                      <td><input name={`to-${grade}`} type="number" min={0} inputMode="numeric" aria-label={`GR ${grade} empregados até`} /></td>
                      <td><input name={`effective-${grade}`} type="number" min={0} inputMode="numeric" aria-label={`GR ${grade} efetivos`} /></td>
                      <td><input name={`substitute-${grade}`} type="number" min={0} inputMode="numeric" aria-label={`GR ${grade} suplentes`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </fieldset>

          <div className="cipa-form-footer">
            <button className="primary-button" type="submit" disabled={draftPending}>{draftPending ? "Salvando…" : "Salvar rascunho do catálogo"}</button>
            {draftState.error && <p role="alert" className="form-error">{draftState.error}</p>}
            {draftState.success && <p role="status" className="form-success">{draftState.success}</p>}
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="nr5-publish-title">
        <div className="panel-heading">
          <div>
            <h2 id="nr5-publish-title">Publicar edição conferida</h2>
            <p>Publicar registra quem conferiu, a data e o hash do arquivo. Só assim a edição passa a valer.</p>
          </div>
        </div>
        {standards.length === 0
          ? <p>Nenhuma edição publicada ainda. Salve o rascunho acima e publique depois de conferir.</p>
          : <form action={publishAction} className="cipa-form">
              <div className="cipa-form-row">
                <label>Edição publicada<select name="standardId" required defaultValue={standards[0]?.id}>
                  {standards.map((standard) => <option key={standard.id} value={standard.id}>{standard.edition} · desde {standard.validFrom}</option>)}
                </select></label>
                <label>Quem conferiu<input name="reviewer" required maxLength={160} placeholder="Nome do responsável técnico" /></label>
                <label>Como conferiu<select name="method" defaultValue="manual_transcription">
                  <option value="manual_transcription">Transcrição manual da norma</option>
                  <option value="assisted_extraction">Extração assistida, conferida</option>
                </select></label>
              </div>
              <label>Registro da conferência<textarea name="notes" required minLength={10} maxLength={2000} rows={3} placeholder="O que foi conferido, item por item" /></label>
              <div className="cipa-form-footer">
                <button className="primary-button" type="submit" disabled={publishPending}>{publishPending ? "Publicando…" : "Publicar edição"}</button>
                {publishState.error && <p role="alert" className="form-error">{publishState.error}</p>}
                {publishState.success && <p role="status" className="form-success">{publishState.success}</p>}
              </div>
            </form>}
      </section>

      <section className="panel" aria-labelledby="cipa-term-title">
        <div className="panel-heading">
          <div>
            <h2 id="cipa-term-title">Vigência do mandato</h2>
            <p>Corrige o término e a posse do mandato. A alteração fica registrada na auditoria da CIPA.</p>
          </div>
        </div>
        {terms.length === 0
          ? <p>Nenhum mandato de CIPA cadastrado para os estabelecimentos desta consultoria.</p>
          : <form action={termAction} className="cipa-form">
              <div className="cipa-form-row">
                <label>Mandato<select name="termId" required defaultValue={terms[0]?.id}>
                  {terms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}
                </select></label>
                <label>Término do mandato<input name="endsOn" type="date" required /></label>
                <label>Posse<input name="possessionOn" type="date" /></label>
              </div>
              <label>Motivo da alteração<textarea name="reason" required minLength={10} maxLength={2000} rows={2} placeholder="Por que a vigência está sendo corrigida" /></label>
              <div className="cipa-form-footer">
                <button className="primary-button" type="submit" disabled={termPending}>{termPending ? "Salvando…" : "Atualizar vigência"}</button>
                {termState.error && <p role="alert" className="form-error">{termState.error}</p>}
                {termState.success && <p role="status" className="form-success">{termState.success}</p>}
              </div>
            </form>}
      </section>
    </>
  );
}
