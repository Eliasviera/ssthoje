"use client";

import { useActionState, useState } from "react";
import { archiveDocumentAction, createDocumentAction, replaceDocumentAction } from "./document-actions";
import type { ClientCompany } from "@/lib/client-store";
import { DOCUMENT_KINDS } from "@/lib/document-categories";
import type { DocumentGroup, StoredDocument } from "@/lib/document-store";
import ComplianceSection from "./compliance-section";
import type { ComplianceEvaluation, ComplianceRule } from "@/lib/compliance-store";
import type { ThirdPartyDocumentSource } from "@/lib/third-party-store";

function ReplaceForm({ document }: { document: DocumentGroup }) {
  const [state, action, pending] = useActionState(replaceDocumentAction, {});
  return <details className="document-replace"><summary>Adicionar nova versão</summary><form action={action}><input type="hidden" name="groupId" value={document.groupId}/><label htmlFor={`replace-${document.groupId}`}>Novo arquivo PDF</label><input id={`replace-${document.groupId}`} type="file" name="file" accept="application/pdf,.pdf" required/><small>Até 7 MB. A versão anterior será preservada.</small>{state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}<button className="secondary-button" type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar nova versão"}</button></form></details>;
}

function versionStatus(status: StoredDocument["status"]) {
  if (status === "archived") return "Arquivada";
  if (status === "superseded") return "Substituída";
  return "Recebida";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

export default function DocumentSection({ documents, thirdPartyDocuments = [], companies, canManage, canReview, rules, evaluations, currentDate, onOpenCompanies }: { documents: DocumentGroup[]; thirdPartyDocuments?: ThirdPartyDocumentSource[]; companies: ClientCompany[]; canManage: boolean; canReview: boolean; rules: ComplianceRule[]; evaluations: ComplianceEvaluation[]; currentDate: string; onOpenCompanies: () => void }) {
  const [state, action, pending] = useActionState(createDocumentAction, {});
  const safeThirdPartyDocuments = Array.isArray(thirdPartyDocuments) ? thirdPartyDocuments : [];
  const activeCompanies = companies.filter((company) => company.status === "active");
  const [companyId, setCompanyId] = useState(activeCompanies[0]?.id ?? "");
  const selectedCompany = activeCompanies.find((company) => company.id === companyId);
  const units = selectedCompany?.units ?? [];
  const supersededReceiptIds = new Set(safeThirdPartyDocuments.flatMap((invitation) => (invitation.receipts ?? []).map((receipt) => receipt.replacesReceiptId).filter((id): id is string => Boolean(id))));
  const latestThirdPartyReceipts = safeThirdPartyDocuments.flatMap((invitation) => (invitation.receipts ?? []).filter((receipt) => !supersededReceiptIds.has(receipt.id)).map((receipt) => ({ invitation, receipt })));

  return <div className="document-section">
    {!companies.length && canManage ? <section className="panel document-prerequisite"><span className="client-empty-icon" aria-hidden="true">1</span><h2>Cadastre uma empresa antes</h2><p>Os documentos de demonstração precisam estar ligados a uma empresa e unidade da consultoria.</p><button className="primary-button" type="button" onClick={onOpenCompanies}>Ir para Empresas</button></section> : canManage ? <section className="panel document-form-panel" aria-labelledby="document-form-title">
      <div className="panel-heading"><div><h2 id="document-form-title">Adicionar documento</h2><p>O arquivo original será guardado localmente, sem processamento.</p></div><span className="period-label">Demonstração local</span></div>
      <div className="document-warning" role="note"><strong>Use apenas PDF fictício.</strong> O arquivo fica no PC sem criptografia. Não envie ASO, exames, prontuários, CPF ou documentos reais. PDFs são tratados como arquivos não confiáveis: não serão visualizados nem analisados pelo sistema.</div>
      {activeCompanies.length ? <form action={action} className="document-form">
        <div className="form-field"><label htmlFor="document-title">Nome do documento</label><input id="document-title" name="title" required maxLength={160} placeholder="Ex.: PGR de demonstração"/></div>
        <div className="form-field"><label htmlFor="document-kind">Categoria</label><select id="document-kind" name="kind" required defaultValue=""><option value="" disabled>Selecione</option>{DOCUMENT_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></div>
        <div className="form-field"><label htmlFor="document-company">Empresa</label><select id="document-company" name="companyId" value={companyId} required onChange={(event) => setCompanyId(event.target.value)}>{activeCompanies.map((company) => <option key={company.id} value={company.id}>{company.tradeName || company.legalName}</option>)}</select></div>
        <div className="form-field"><label htmlFor="document-unit">Unidade / CNPJ</label><select id="document-unit" name="unitId" required disabled={!units.length}>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} · {unit.cnpj}</option>)}</select></div>
        <div className="form-field"><label htmlFor="document-validity">Válido até <span>(opcional)</span></label><input id="document-validity" name="validUntil" type="date"/></div>
        <div className="form-field"><label htmlFor="document-file">Arquivo PDF</label><input id="document-file" name="file" type="file" accept="application/pdf,.pdf" required/><small className="field-help">Tamanho máximo: 7 MB.</small></div>
        {state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}
        <div className="document-form-footer"><p>Somente a equipe autorizada desta consultoria poderá consultar o cadastro e baixar o arquivo.</p><button className="primary-button" type="submit" disabled={pending || !units.length}>{pending ? "Salvando…" : "Salvar documento"}</button></div>
      </form> : <div className="permission-note"><strong>Consulta de documentos</strong><span>Este perfil pode consultar e baixar documentos da própria consultoria, mas não enviar, substituir ou arquivar.</span></div>}
    </section> : null}

    <section className="document-list-section" aria-labelledby="document-list-title"><div className="client-list-heading"><div><h2 id="document-list-title">Documentos da consultoria</h2><p>{documents.length} {documents.length === 1 ? "documento" : "documentos"}</p></div></div>
      {documents.length ? <div className="document-list">{documents.map((document) => {
        const company = companies.find((entry) => entry.id === document.companyId);
        const unit = company?.units.find((entry) => entry.id === document.unitId);
        const history = document.versions.flatMap((version) => version.history).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
        return <article className={`document-card${document.status === "archived" ? " document-card-archived" : ""}`} key={document.groupId}>
          <div className="document-card-head"><span className="document-icon" aria-hidden="true">PDF</span><div className="document-title"><h3>{document.title}</h3><p>{document.kind} · {company?.tradeName || company?.legalName || "Empresa"}</p></div><span className={`client-status ${document.status === "received" ? "status-active" : "status-archived"}`}>{versionStatus(document.status)}</span></div>
          <p className="document-unit">{unit?.name ?? "Unidade indisponível"}{unit?.cityState ? ` · ${unit.cityState}` : ""}</p>
          <div className="document-current"><span><strong>Versão {document.version}</strong><small>{document.originalFileName} · {(document.size / (1024 * 1024)).toFixed(1)} MB</small></span><a className="download-link" href={`/api/document-files/${encodeURIComponent(document.id)}`}>Baixar PDF</a></div>
          <div className="document-meta"><span>Enviado em {formatDate(document.uploadedAt)}</span>{document.validUntil && <span>Válido até {formatDate(`${document.validUntil}T12:00:00`)}</span>}</div>
          {document.versions.length > 1 && <details className="document-versions"><summary>Versões anteriores · {document.versions.length - 1}</summary><ul>{document.versions.filter((version) => version.id !== document.id).map((version) => <li key={version.id}><span>Versão {version.version} · {versionStatus(version.status)}<small>{version.originalFileName} · {formatDate(version.uploadedAt)}</small></span><a href={`/api/document-files/${encodeURIComponent(version.id)}`}>Baixar</a></li>)}</ul></details>}
          <details className="document-versions"><summary>Histórico · {history.length} {history.length === 1 ? "evento" : "eventos"}</summary><ul>{history.map((entry) => <li key={entry.id}><span>{entry.action === "uploaded" ? `Versão ${entry.version} adicionada` : entry.action === "superseded" ? `Versão ${entry.version} substituída` : `Versão ${entry.version} arquivada`}<small>{entry.actorRole === "consultoria_admin" ? "Administradora" : entry.actorRole} · {formatDate(entry.occurredAt)}</small></span></li>)}</ul></details>
          {canManage && document.status !== "archived" && <div className="document-actions"><ReplaceForm document={document}/><form action={archiveDocumentAction}><input type="hidden" name="groupId" value={document.groupId}/><button className="text-button" type="submit">Arquivar documento</button></form></div>}
        </article>;
      })}</div> : <div className="client-empty"><span className="client-empty-icon" aria-hidden="true">PDF</span><h3>Nenhum documento cadastrado</h3><p>Os PDFs fictícios aparecerão aqui com metadados, validade e histórico de versões.</p></div>}
    </section>
    <section className="document-list-section" aria-labelledby="third-party-document-list-title"><div className="client-list-heading"><div><h2 id="third-party-document-list-title">PDFs recebidos de contratadas</h2><p>{latestThirdPartyReceipts.length} {latestThirdPartyReceipts.length === 1 ? "arquivo atual" : "arquivos atuais"}</p></div></div>
      <p className="permission-note">Arquivos recebidos são evidências para análise, não uma aprovação. Informações só devem ser incorporadas ao PGR após avaliação técnica da empresa e unidade relacionadas.</p>
      {latestThirdPartyReceipts.length ? <div className="document-list">{latestThirdPartyReceipts.map(({ invitation, receipt }) => <article className="document-card" key={receipt.id}>
        <div className="document-card-head"><span className="document-icon" aria-hidden="true">PDF</span><div className="document-title"><h3>{receipt.kind} · {invitation.contractorName}</h3><p>Enviado pela contratada para {invitation.companyName}</p></div><span className="period-label">Aguarda avaliação</span></div>
        <p className="document-unit">{invitation.unitName} · CNPJ relacionado: {invitation.relatedCnpj}</p>
        <div className="document-current"><span><strong>{receipt.fileName}</strong><small>{(receipt.size / (1024 * 1024)).toFixed(1)} MB</small></span><a className="download-link" href={`/api/third-party-files/${encodeURIComponent(receipt.id)}`}>Baixar PDF</a></div>
        <div className="document-meta"><span>Recebido em {formatDate(receipt.receivedAt)}</span><span>Protocolo {receipt.id}</span></div>
      </article>)}</div> : <div className="client-empty"><span className="client-empty-icon" aria-hidden="true">PDF</span><h3>Nenhum PDF recebido</h3><p>Os arquivos enviados pelas contratadas aparecerão aqui após o recebimento.</p></div>}
    </section>
    {canReview && <ComplianceSection rules={rules} evaluations={evaluations} documents={documents} thirdPartyDocuments={safeThirdPartyDocuments} canManage={canManage} canReview={canReview} currentDate={currentDate}/>}
  </div>;
}
