"use client";

export default function PrintReportButton() {
  return <button type="button" className="secondary-button" onClick={() => window.print()}>Imprimir ou salvar em PDF</button>;
}
