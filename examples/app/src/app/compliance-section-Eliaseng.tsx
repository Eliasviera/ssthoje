"use client";

import { useActionState, useState } from "react";
import { createComplianceEvaluationAction, createComplianceRuleAction } from "./compliance-actions";
import type { ComplianceEvaluation, ComplianceRule } from "@/lib/compliance-store";
import type { DocumentGroup } from "@/lib/document-store";
import { DOCUMENT_KINDS } from "@/lib/document-categories";
import type { ThirdPartyDocumentSource } from "@/lib/third-party-store";

function dateValue(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${value}T12:00:00`));
}

function resultLabel(result: ComplianceEvaluation["result"]) {
  if (result === "atende") return "Atende ao critério";
  if (result === "pendente") return "Pendente";
  if (result === "inconclusivo") return "Inconclusivo";
  return "Não aplicável";
}

function getRuleState(rule: ComplianceRule, today: string) {
  if (rule.status === "superseded") return "Substituída";
  if (rule.validFrom > today) return "Vigência futura";
  if (rule.validUntil && rule.validUntil < today) return "Vigência encerrada";
  return "Ativa";
}

export default function ComplianceSection({ rules, evaluations, documents, thirdPartyDocuments = [], canManage, canReview, currentDate }: { rules: ComplianceRule[]; evaluations: ComplianceEvaluation[]; documents: DocumentGroup[]; thirdPartyDocuments?: ThirdPartyDocumentSource[]; canManage: boolean; canReview: boolean; currentDate: string }) {
  const [ruleState, ruleAction, rulePending] = useActionState(createComplianceRuleAction, {});
  const [evaluationState, evaluationAction, evaluationPending] = useActionState(createComplianceEvaluationAction, {});
  const [selectedDocument, setSelectedDocument] = useState("");
  const activeRules = rules.filter((rule) => rule.status === "active");
  const documentVersions = documents.flatMap((group) => group.versions);
  const supersededReceiptIds = new Set(thirdPartyDocuments.flatMap((source) => source.receipts.map((receipt) => receipt.replacesReceiptId).filter((id): id is string => Boolean(id))));
  const latestThirdPartyReceipts = thirdPartyDocuments.flatMap((source) => source.receipts.filter((receipt) => !supersededReceiptIds.has(receipt.id)).map((receipt) => ({ source, receipt })));
  const hasEvaluatableDocuments = documentVersions.length > 0 || latestThirdPartyReceipts.length > 0;
  const today = currentDate;
  const eligibleRules = activeRules.filter((rule) => rule.validFrom <= today && (!rule.validUntil || rule.validUntil >= today));
  const selectedDocumentKind = selectedDocument.startsWith("consultoria:")
    ? documentVersions.find((document) => `consultoria:${document.id}` === selectedDocument)?.kind
    : selectedDocument.startsWith("contratada:")
      ? latestThirdPartyReceipts.find(({ receipt }) => `contratada:${receipt.id}` === selectedDocument)?.receipt.kind
      : undefined;
  const applicableRules = eligibleRules.filter((rule) => !selectedDocumentKind || rule.documentKind === selectedDocumentKind);

  return <section className="compliance-section" aria-labelledby="compliance-title">
    <div className="compliance-heading"><div><p className="eyebrow">REVISÃO HUMANA</p><h2 id="compliance-title">Checklist e avaliações</h2><p>Critérios cadastrados pela equipe, vinculados à fonte e à vigência informadas.</p></div><span className="period-label">Sem regras legais pré-carregadas</span></div>
    <p><a href="/referencias">Revisar fontes e referências antes de avaliar →</a></p><div className="compliance-notice" role="note"><strong>Importante:</strong> o sistema não decide conformidade. A avaliação é de responsabilidade de um profissional; confirme a fonte, jurisdição, versão e vigência. Não use este registro como parecer legal ou técnico.
    </div>

    {canManage && <section className="panel rule-form-panel" aria-labelledby="rule-form-title"><div className="panel-heading"><div><h3 id="rule-form-title">Cadastrar critério configurável</h3><p>Informe a referência que a equipe revisou. O sistema não cria texto normativo.</p></div></div>
      <form action={ruleAction} className="rule-form">
        <div className="form-field"><label htmlFor="rule-title">Nome do critério</label><input id="rule-title" name="title" required maxLength={140} placeholder="Ex.: Identificação de perigos presente"/></div>
        <div className="form-field"><label htmlFor="rule-kind">Tipo de documento</label><select id="rule-kind" name="documentKind" required defaultValue=""><option value="" disabled>Selecione</option>{DOCUMENT_KINDS.map((kind) => <option value={kind} key={kind}>{kind}</option>)}</select></div>
        <div className="form-field form-field-wide"><label htmlFor="rule-criteria">O que será verificado</label><textarea id="rule-criteria" name="criteria" maxLength={700} required rows={3} placeholder="Descreva o critério aprovado pela equipe, sem copiar instruções não revisadas."/></div>
        <div className="form-field"><label htmlFor="rule-source">Fonte consultada</label><input id="rule-source" name="sourceTitle" maxLength={180} required placeholder="Nome do documento ou referência"/></div>
        <div className="form-field"><label htmlFor="rule-source-version">Versão / edição da fonte</label><input id="rule-source-version" name="sourceVersion" maxLength={80} required placeholder="Edição ou versão consultada"/></div>
        <div className="form-field"><label htmlFor="rule-jurisdiction">Jurisdição / âmbito</label><input id="rule-jurisdiction" name="jurisdiction" maxLength={100} required placeholder="Ex.: federal, estadual, municipal"/></div>
        <div className="form-field"><label htmlFor="rule-reviewer">Responsável pela revisão</label><input id="rule-reviewer" name="reviewer" maxLength={120} required placeholder="Responsável fictício da revisão"/></div>
        <div className="form-field"><label htmlFor="rule-valid-from">Vigente a partir de</label><input id="rule-valid-from" name="validFrom" type="date" required/></div>
        <div className="form-field"><label htmlFor="rule-valid-until">Vigente até <span>(opcional)</span></label><input id="rule-valid-until" name="validUntil" type="date"/></div>
        <div className="form-field form-field-wide"><label htmlFor="rule-previous">Nova revisão substitui <span>(opcional)</span></label><select id="rule-previous" name="previousRuleId" defaultValue=""><option value="">Não substitui uma regra anterior</option>{activeRules.map((rule) => <option value={rule.id} key={rule.id}>{rule.title} · versão {rule.version}</option>)}</select></div>
        {ruleState.error && <p className="client-form-message client-form-error" role="alert">{ruleState.error}</p>}{ruleState.success && <p className="client-form-message client-form-success" role="status">{ruleState.success}</p>}
        <div className="rule-form-footer"><p>O cadastro mantém cada versão da regra; confirmar a validade e a interpretação é uma responsabilidade humana.</p><button className="primary-button" type="submit" disabled={rulePending}>{rulePending ? "Salvando…" : "Salvar critério"}</button></div>
      </form>
    </section>}

    {canReview && <section className="panel evaluation-form-panel" aria-labelledby="evaluation-form-title"><div className="panel-heading"><div><h3 id="evaluation-form-title">Registrar avaliação</h3><p>Cada envio cria um novo registro e preserva as avaliações anteriores.</p></div></div>
      {eligibleRules.length && hasEvaluatableDocuments ? <form action={evaluationAction} className="evaluation-form">
        <div className="form-field"><label htmlFor="evaluation-document">Versão do documento</label><select id="evaluation-document" name="documentId" required value={selectedDocument} onChange={(event) => setSelectedDocument(event.target.value)}><option value="" disabled>Selecione</option>{documentVersions.map((document) => <option value={`consultoria:${document.id}`} key={`consultoria:${document.id}`}>{document.title} · versão {document.version} · {document.kind} · equipe</option>)}{latestThirdPartyReceipts.map(({ source, receipt }) => <option value={`contratada:${receipt.id}`} key={`contratada:${receipt.id}`}>{receipt.kind} · {source.contractorName} · {source.companyName} · {source.unitName}</option>)}</select></div>
        <div className="form-field"><label htmlFor="evaluation-rule">Critério vigente</label><select id="evaluation-rule" name="ruleId" required defaultValue=""><option value="" disabled>Selecione</option>{applicableRules.map((rule) => <option value={rule.id} key={rule.id}>{rule.title} · v{rule.version} · {rule.documentKind}</option>)}</select>{selectedDocumentKind && applicableRules.length === 0 && <small className="field-help">Cadastre um critério vigente para {selectedDocumentKind} antes de avaliar este arquivo.</small>}</div>
        <fieldset className="evaluation-results"><legend>Resultado da revisão profissional</legend><div className="evaluation-result-options">{([["atende", "Atende ao critério"], ["pendente", "Pendente"], ["inconclusivo", "Inconclusivo"], ["nao_aplicavel", "Não aplicável"]] as const).map(([value, label]) => <label key={value}><input type="radio" name="result" value={value} required/><span>{label}</span></label>)}</div></fieldset>
        <div className="form-field form-field-wide"><label htmlFor="evaluation-notes">Justificativa da avaliação</label><textarea id="evaluation-notes" name="notes" required maxLength={1000} rows={3} placeholder="Registre o motivo da conclusão e os limites da revisão."/></div>
        <div className="form-field form-field-wide"><label htmlFor="evaluation-evidence">Evidência consultada <span>(descrição, sem dados pessoais)</span></label><textarea id="evaluation-evidence" name="evidence" maxLength={500} rows={2} placeholder="Ex.: seção ou página do PDF conferido"/></div>
        <div className="form-field form-field-wide"><label htmlFor="evaluation-evidence-document">PDF de evidência relacionado <span>(opcional)</span></label><select id="evaluation-evidence-document" name="evidenceDocumentId" defaultValue=""><option value="">Sem vínculo a outro PDF</option>{documentVersions.map((document) => <option value={document.id} key={document.id}>{document.title} · v{document.version}</option>)}</select></div>
        <div className="form-field"><label htmlFor="evaluation-responsible">Responsável pela próxima ação <span>(para pendência/incerteza)</span></label><input id="evaluation-responsible" name="responsible" maxLength={120} placeholder="Responsável fictício"/></div>
        <div className="form-field"><label htmlFor="evaluation-next-step">Próximo passo <span>(para pendência/incerteza)</span></label><input id="evaluation-next-step" name="nextStep" maxLength={300} placeholder="Ação necessária, sem prazo presumido"/></div>
        {evaluationState.error && <p className="client-form-message client-form-error" role="alert">{evaluationState.error}</p>}{evaluationState.success && <p className="client-form-message client-form-success" role="status">{evaluationState.success}</p>}
        <div className="evaluation-form-footer"><p>Não há prazo padrão. O responsável define a próxima ação de acordo com o contexto.</p><button className="primary-button" type="submit" disabled={evaluationPending || (Boolean(selectedDocumentKind) && applicableRules.length === 0)}>{evaluationPending ? "Registrando…" : "Registrar avaliação"}</button></div>
      </form> : <div className="compliance-empty"><h4>{!hasEvaluatableDocuments ? "Envie ou receba um PDF primeiro" : "Cadastre um critério vigente primeiro"}</h4><p>Depois, escolha ambos para registrar uma revisão humana.</p></div>}
    </section>}

    <section className="panel rules-list-panel"><div className="panel-heading"><div><h3>Critérios e referências</h3><p>Critérios anteriores permanecem disponíveis para rastreabilidade.</p></div><span className="period-label">{rules.length} {rules.length === 1 ? "versão" : "versões"}</span></div>
      {rules.length ? <div className="rule-list">{rules.map((rule) => { const state = getRuleState(rule, today); return <article className={`rule-card${rule.status === "superseded" ? " rule-card-superseded" : ""}`} key={rule.id}><div className="rule-card-heading"><div><h4>{rule.title}</h4><p>{rule.documentKind} · versão {rule.version}</p></div><span className={`client-status ${state === "Ativa" ? "status-active" : "status-archived"}`}>{state}</span></div><p className="rule-criteria">{rule.criteria}</p><div className="rule-reference"><span><strong>Fonte:</strong> {rule.sourceTitle} · {rule.sourceVersion}</span><span><strong>Âmbito:</strong> {rule.jurisdiction}</span><span><strong>Vigência:</strong> {dateValue(rule.validFrom)}{rule.validUntil ? ` a ${dateValue(rule.validUntil)}` : " em diante (data final não informada)"}</span><span><strong>Revisão humana:</strong> {rule.reviewer}</span></div></article>;})}</div> : <div className="compliance-empty"><h4>Nenhum critério foi cadastrado</h4><p>Não há regras legais ou técnicas pré-carregadas nesta demonstração.</p></div>}
    </section>

    <section className="panel evaluations-list-panel"><div className="panel-heading"><div><h3>Histórico de avaliações</h3><p>Registros são acrescentados; cada um preserva a versão do documento e da fonte.</p></div><span className="period-label">{evaluations.length} {evaluations.length === 1 ? "avaliação" : "avaliações"}</span></div>
      {evaluations.length ? <ol className="evaluation-list">{evaluations.map((evaluation) => { const thirdPartyReceiptAvailable = evaluation.documentSource === "contratada" && thirdPartyDocuments.some((source) => source.receipts.some((receipt) => receipt.id === evaluation.documentId)); const documentHref = evaluation.documentSource === "contratada" ? thirdPartyReceiptAvailable ? `/api/third-party-files/${encodeURIComponent(evaluation.documentId)}` : "" : `/api/document-files/${encodeURIComponent(evaluation.documentId)}`; return <li key={evaluation.id}><div className="evaluation-list-top"><div><h4>{evaluation.documentTitle} · v{evaluation.documentVersion}</h4><p>Critério: {evaluation.ruleTitle} · v{evaluation.ruleVersion}</p></div><span className={`evaluation-result result-${evaluation.result}`}>{resultLabel(evaluation.result)}</span></div><p className="evaluation-source">{evaluation.documentSourceLabel ?? "Documento cadastrado pela equipe"} · {evaluation.companyName ?? "Empresa"} · {evaluation.unitName ?? "Unidade"}</p>{documentHref && <p><a className="download-link" href={documentHref}>Baixar documento avaliado</a></p>}<p className="evaluation-notes">{evaluation.notes}</p>{evaluation.evidence && <p className="evaluation-evidence"><strong>Evidência:</strong> {evaluation.evidence}</p>}{evaluation.evidenceDocumentId && <a className="download-link" href={`/api/document-files/${encodeURIComponent(evaluation.evidenceDocumentId)}`}>Baixar PDF de evidência</a>}{(evaluation.result === "pendente" || evaluation.result === "inconclusivo") && <div className="evaluation-next"><strong>Responsável:</strong> {evaluation.responsible}<span><strong>Próximo passo:</strong> {evaluation.nextStep}</span></div>}<div className="evaluation-source">Referência: {evaluation.sourceTitle} · {evaluation.sourceVersion} · {evaluation.evaluatorRole === "consultoria_admin" ? "Administradora" : evaluation.evaluatorRole} · {dateValue(evaluation.evaluatedAt.slice(0, 10))}</div></li>;})}</ol> : <div className="compliance-empty"><h4>Nenhuma avaliação registrada</h4><p>As análises humanas aparecerão aqui com suas referências e justificativas.</p></div>}
    </section>
  </section>;
}
