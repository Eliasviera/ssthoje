"use client";

import { useRef, type ReactNode } from "react";

export default function RiskDocumentActions({ title, label, children }: {
  title: string;
  label: "AR" | "APR";
  children: ReactNode;
}) {
  const preview = useRef<HTMLDialogElement>(null);
  const documentPreview = useRef<HTMLElement>(null);

  function printDocument() {
    if (!documentPreview.current) return;
    const copy = document.createElement("div");
    copy.className = "risk-analysis-print-copy";
    copy.appendChild(documentPreview.current.cloneNode(true));
    copy.querySelectorAll("details").forEach((details) => { details.open = true; });
    document.body.appendChild(copy);
    try {
      window.print();
    } finally {
      copy.remove();
    }
  }

  return <>
    <div className="risk-analysis-document-actions">
      <button className="primary-button" type="button" onClick={() => preview.current?.showModal()}>Visualizar {label}</button>
      <button className="secondary-button" type="button" onClick={printDocument}>Imprimir / salvar PDF</button>
    </div>
    <dialog ref={preview} className="risk-analysis-preview" aria-label={`Visualização de ${title}`}>
      <div className="risk-analysis-document-actions">
        <button className="secondary-button" type="button" onClick={() => preview.current?.close()}>Fechar visualização</button>
        <button className="primary-button" type="button" onClick={printDocument}>Imprimir / salvar PDF</button>
      </div>
      <article ref={documentPreview} className="risk-analysis-card risk-analysis-document">{children}</article>
    </dialog>
  </>;
}
