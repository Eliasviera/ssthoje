import type { SafetyApr } from "@/lib/safety-operations-store";

type Origin = Pick<SafetyApr, "tenantId" | "checklistTemplateId" | "checklistTemplateVersion" | "checklistTitle" | "checklistSnapshot">;
function date(value?: string) {
  if (!value) return "Data não registrada";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Data não registrada" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(parsed) + " (Brasília)";
}
export default function AprChecklistOrigin({ origin }: { origin: Origin }) {
  const snapshot = origin.checklistSnapshot;
  const matches = snapshot && snapshot.tenantId === origin.tenantId && snapshot.id === origin.checklistTemplateId
    && snapshot.version === origin.checklistTemplateVersion && snapshot.title === origin.checklistTitle;
  return <details className="issue-history"><summary>Origem do checklist · versão {origin.checklistTemplateVersion}</summary>
    <p><strong>Modelo registrado na APR:</strong> {origin.checklistTitle} · versão {origin.checklistTemplateVersion}</p>
    {!snapshot ? <p className="permission-note">Esta APR não possui cópia histórica completa do modelo. Referência e revisão de origem não foram reconstruídas a partir do cadastro atual.</p>
      : !matches ? <p className="permission-note">A cópia histórica do modelo diverge da identificação registrada nesta APR. Seus detalhes não são exibidos; confira a origem antes de continuar.</p>
      : <>
        <p><strong>Atividade do modelo:</strong> {snapshot.activity}</p>
        <p><strong>Categoria registrada:</strong> {snapshot.activityKind === "confined_space_nr33" ? "Espaço confinado · referência NR-33 a validar" : snapshot.activityKind === "general_activity" ? "Atividade diversa · definida pela equipe" : "Não registrada"}</p>
        <p><strong>Revisão do modelo registrada em:</strong> {date(snapshot.reviewedAt)}</p>
        <p><strong>Conta que registrou a revisão do modelo:</strong> {snapshot.reviewedBy || "Conta não registrada"}</p>
        {snapshot.reference ? <section aria-label="Referência histórica do checklist"><h4>Referência registrada no modelo de origem</h4>
          <p><strong>Fonte:</strong> {snapshot.reference.title}</p><p><strong>Edição/versão:</strong> {snapshot.reference.version}</p>
          <p><strong>Jurisdição/âmbito informado:</strong> {snapshot.reference.jurisdiction}</p>
          <p><strong>Início de vigência informado:</strong> {snapshot.reference.validFrom || "Não informado"}</p>
          <p><strong>Fim de vigência informado:</strong> {snapshot.reference.validUntil || "Não informado"}</p>
          <p><strong>Pessoa revisora informada na referência:</strong> {snapshot.reference.reviewer}</p>
        </section> : <p>Não foi registrada referência externa nessa versão do modelo.</p>}
        <p>Esta consulta usa a cópia guardada na criação da APR. Alterações posteriores do modelo não atualizam esses dados. O registro não comprova qualificação profissional ou conformidade técnica.</p>
      </>}
  </details>;
}
