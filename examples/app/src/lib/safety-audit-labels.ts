export function getSafetyAuditActionLabel(action: string): string | undefined {
  switch (action) {
    case "safety.checklist_draft_created":
      return "Rascunho de modelo de APR criado";
    case "safety.checklist_activated":
      return "Modelo de checklist ativado para APR";
    case "safety.apr_created":
      return "APR criada como rascunho";
    case "safety.apr_saved":
      return "Respostas da APR salvas";
    case "safety.apr_submitted":
      return "APR enviada para revisão humana";
    case "safety.risk_analysis_created":
      return "Análise de risco criada como rascunho";
    case "safety.risk_analysis_saved":
      return "Rascunho de análise de risco atualizado";
    case "safety.risk_analysis_issued":
      return "Análise de risco emitida";
    case "safety.work_permit_draft_saved":
      return "Rascunho demonstrativo de PT/PTE salvo";
    case "esocial.mapping_created":
      return "Associação de código eSocial criada como rascunho";
    case "esocial.mapping_saved":
      return "Rascunho de associação eSocial atualizado";
    case "esocial.mapping_reviewed":
      return "Revisão humana de associação eSocial registrada";
    default:
      return undefined;
  }
}
