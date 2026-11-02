import Image from "next/image";
import type { ReactNode } from "react";
import { DOCUMENT_RESPONSIBILITY, type DocumentResponsibilityType } from "@/lib/document-responsibility";

export type PrintDocumentSection = { id: string; title: string };
export type PrintDocumentField = { label: string; value: string };

/** Shared print structure for SST Hoje documents: repeated brand, cover, author, index and contact footer. */
export default function DocumentPrintTemplate({ documentType, title, companyName, companyLogo, companyFields, authorName, authorRole, professionalRegistration = "", issueDate, sections, consultancyPhone, consultancyEmail, preparationLabel = "Consultoria SST Hoje", professionalHeading, responsibilityNote, children }: {
  documentType: DocumentResponsibilityType;
  title: string; companyName: string; companyLogo?: string; companyFields: PrintDocumentField[];
  authorName: string; authorRole: string; professionalRegistration?: string; issueDate: string; sections: PrintDocumentSection[];
  consultancyPhone: string; consultancyEmail: string; children: ReactNode;
  preparationLabel?: string; professionalHeading?: string; responsibilityNote?: string;
}) {
  const responsibility = DOCUMENT_RESPONSIBILITY[documentType];
  const responsibleLabel = professionalHeading ?? responsibility.responsibleRole;
  const note = responsibilityNote ?? `Documento preparado pela consultoria. ${responsibility.validationLabel} pendente com o responsável designado. ${responsibility.organizationRole}.`;
  return <>
    <header className="pgr-updated-print-header"><Image src="/logo-sst-hoje.png" alt="SST Hoje" width={240} height={64}/><div><strong>{title}</strong><span>{companyName}</span></div></header>
    <section className="pgr-print-cover pgr-print-page"><h1>{title}</h1>{companyLogo && <Image className="pgr-company-logo" src={companyLogo} alt={`Logo de ${companyName}`} width={480} height={240} unoptimized/>}<p className="pgr-cover-subtitle">Identificação da empresa · documento atualizado SST Hoje</p><dl>{companyFields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value || "Não informado"}</dd></div>)}</dl></section>
    <section className="pgr-print-author pgr-print-page"><h1>Elaboração e validação técnica</h1><p>{note}</p><dl><div><dt>Preparação documental</dt><dd>{preparationLabel}</dd></div><div><dt>{responsibleLabel}</dt><dd>{authorName || "A designar"}</dd></div><div><dt>Qualificação / função</dt><dd>{authorRole || responsibility.responsibleRole}</dd></div><div><dt>{responsibility.credentialLabel}</dt><dd>{professionalRegistration || "A preencher pelo responsável designado"}</dd></div><div><dt>Data da emissão da minuta</dt><dd>{issueDate}</dd></div><div><dt>Estado</dt><dd>Pendente de validação pelo responsável indicado</dd></div></dl><div className="pgr-author-signature"><span/><strong>{authorName || "Profissional responsável"}</strong><small>{responsibility.validationLabel} · assinatura e data</small></div></section>
    <nav className="pgr-print-toc pgr-print-page" aria-label={`Índice do ${title}`}><h1>Índice</h1><ol>{sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol><p>Índice do conteúdo deste documento. A paginação pode variar conforme a impressão e as opções do navegador.</p></nav>
    {children}
    <footer className="pgr-updated-print-footer"><span>Telefone: {consultancyPhone}</span><span>E-mail: {consultancyEmail}</span></footer>
  </>;
}
