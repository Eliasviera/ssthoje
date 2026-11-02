"use client";

import { useState } from "react";

type Reconciliation = {
  status: "ok" | "needs_review" | "unauthenticated" | "access_denied" | "unavailable";
  policyCount?: number;
  scopeMatches?: number;
  scopeMismatches?: number;
  companiesWithAudit?: number;
  policyHistoryAvailable?: boolean;
  readyForImport?: false;
  blockers?: string[];
};

const blockerLabels: Record<string, string> = {
  POLICY_NOT_FOUND_FOR_TENANT: "Nenhuma política foi encontrada para esta consultoria.",
  POLICY_CHANGE_HISTORY_INCOMPLETE: "O histórico de alterações da política está incompleto.",
  TRANSACTIONAL_SOURCE_ADAPTER_NOT_PREPARED: "O caminho transacional de importação ainda não está preparado.",
  POLICY_SCOPE_MISMATCH: "O escopo da política não corresponde ao cadastro da consultoria.",
};

export default function ReconciliationPanel() {
  const [result, setResult] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(false);

  async function reconcile() {
    setLoading(true);
    try {
      const response = await fetch("/api/third-party-rigor/reconcile", { cache: "no-store" });
      const body = await response.json() as Reconciliation;
      setResult(body);
    } catch {
      setResult({ status: "unavailable" });
    } finally {
      setLoading(false);
    }
  }

  return <section aria-labelledby="rigor-reconcile-title">
    <h2 id="rigor-reconcile-title">Conferência de consistência</h2>
    <p>Consulta somente leitura entre a política legada e o escopo cadastrado. Não importa nem altera a política.</p>
    <button className="secondary-button" type="button" onClick={reconcile} disabled={loading}>
      {loading ? "Conferindo…" : "Conferir consistência"}
    </button>
    {result && <div aria-live="polite">
      {result.status === "unauthenticated" || result.status === "access_denied"
        ? <p role="alert">Entre com uma conta autorizada para consultar a conferência.</p>
        : result.status === "unavailable"
          ? <p role="alert">Não foi possível consultar agora. Nenhuma alteração foi feita.</p>
          : <>
            <h3>{result.status === "ok" ? "Leitura concluída" : "Conferência requer revisão"}</h3>
            <dl>
              <dt>Políticas encontradas</dt><dd>{result.policyCount ?? "—"}</dd>
              <dt>Escopos correspondentes</dt><dd>{result.scopeMatches ?? "—"}</dd>
              <dt>Divergências de escopo</dt><dd>{result.scopeMismatches ?? "—"}</dd>
              <dt>Empresas com histórico agregado</dt><dd>{result.companiesWithAudit ?? "—"}</dd>
              <dt>Histórico próprio da política</dt><dd>{result.policyHistoryAvailable ? "Disponível" : "Indisponível"}</dd>
            </dl>
            <p><strong>Importação habilitada: não.</strong> Esta conferência não aprova, importa ou ativa a política.</p>
            {!!result.blockers?.length && <><h4>Pontos pendentes</h4><ul>{result.blockers.map((blocker) => <li key={blocker}>{blockerLabels[blocker] ?? "Há um ponto que exige revisão."}</li>)}</ul></>}
          </>}
    </div>}
  </section>;
}
