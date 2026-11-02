"use client";
import { useRef, useState } from "react";
import type { ImportedPgrProfile } from "@/lib/pgr-digitalization-store";
import type { WorkingEntry } from "@/lib/pgr-working-store";
import { workingDocumentItems, workingFieldLabels } from "@/lib/pgr-working-document";
import type { ContractorAnnex } from "@/lib/pgr-contractor-annex";
import PgrContractorAnnexDocument from "./pgr-contractor-annex-document";
import DocumentPrintTemplate from "./document-print-template";
export default function PgrWorkingDocument({ profile, history, annexes = [], initialReviewerName = "", hidden = false }: { profile: ImportedPgrProfile; history: WorkingEntry[]; annexes?: ContractorAnnex[]; initialReviewerName?: string; hidden?: boolean }) {
  const documentRef = useRef<HTMLElement>(null);
  const [printing, setPrinting] = useState(false);
  const [reviewerName, setReviewerName] = useState(initialReviewerName);
  const [representativeName, setRepresentativeName] = useState(() => Object.entries(profile.companyFields).find(([label]) => label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes("responsavel legal"))?.[1].map(value => value.value).find(Boolean) || "");
  const [consultancyPhone, setConsultancyPhone] = useState("64 99906-9494");
  const [consultancyEmail, setConsultancyEmail] = useState("eliasvieiraeng@gmail.com");
  const [signatureDate, setSignatureDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [companyLogo, setCompanyLogo] = useState("");
  const companyName = Object.entries(profile.companyFields).find(([label]) => label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes("razao social"))?.[1].map(value => value.value).filter(Boolean).join(" / ") || "Empresa não identificada";
  const normalizedCompanyField = (label: string) => label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const companyDetails = Object.entries(profile.companyFields).filter(([label]) => !normalizedCompanyField(label).includes("responsavel tecnico") && !normalizedCompanyField(label).includes("responsavel legal") && !normalizedCompanyField(label).includes("razao social")).map(([label, values]) => ({ label, value: values.map(value => value.value).join(" / ") }));
  const tocSections = [
    { id: "pgr-content-0", title: "Funções e atividades" },
    { id: "pgr-content-1", title: "Inventário de riscos e medidas de prevenção" },
    { id: "pgr-content-2", title: "Plano de ação" },
    { id: "pgr-content-3", title: "Avaliações quantitativas" },
    ...(annexes.length ? [{ id: "pgr-content-4", title: "Anexo de riscos da atividade contratada" }] : []),
    { id: `pgr-content-${annexes.length ? 5 : 4}`, title: "Assinaturas" },
  ];
  function printDocument() {
    if (!documentRef.current || printing || typeof window.print !== "function") return;
    setPrinting(true);
    const copy = documentRef.current.cloneNode(true) as HTMLElement;
    copy.removeAttribute("hidden");
    copy.classList.add("pgr-import-print-copy");
    document.body.appendChild(copy);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      copy.remove();
      window.removeEventListener("afterprint", finish);
      setPrinting(false);
    };
    window.addEventListener("afterprint", finish, { once: true });
    try {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        try { window.print(); } catch { finish(); }
      }));
    } catch { finish(); }
  }
  return <section id="pgr-updated-preview" ref={documentRef} hidden={hidden} className="pgr-working-document" aria-label="Documento atualizado do PGR">
    <div className="pgr-print-controls" data-print-hide="true">
      <label className="form-field">Representante da EMA<input value={representativeName} onChange={event => setRepresentativeName(event.target.value)} maxLength={160} placeholder="Nome do representante legal"/></label>
      <label className="form-field">Elaborador / revisor do PGR<input value={reviewerName} onChange={event => setReviewerName(event.target.value)} maxLength={160} placeholder="Nome do profissional"/></label>
      <label className="form-field">Data das assinaturas<input type="date" value={signatureDate} onChange={event => setSignatureDate(event.target.value)}/></label>
      <label className="form-field">Telefone da consultoria<input value={consultancyPhone} onChange={event => setConsultancyPhone(event.target.value)} maxLength={40}/></label>
      <label className="form-field">E-mail da consultoria<input type="email" value={consultancyEmail} onChange={event => setConsultancyEmail(event.target.value)} maxLength={160}/></label>
      <label className="form-field">Logo da EMA (opcional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; if (!file) { setCompanyLogo(""); return; } if (file.size > 2_000_000) { event.currentTarget.value = ""; return; } const reader = new FileReader(); reader.onload = () => setCompanyLogo(typeof reader.result === "string" ? reader.result : ""); reader.readAsDataURL(file); }}/></label>
      <button id="pgr-print-updated-button" type="button" className="secondary-button" disabled={printing || !reviewerName.trim()} onClick={printDocument}>{printing ? "Preparando impressão…" : "Imprimir PGR atualizado"}</button>
      <small>Depois de salvar em PDF, aguarde o Windows concluir a gravação antes de abrir o arquivo.</small>
      <small>No Edge, em Mais configurações, desmarque “Cabeçalhos e rodapés” para retirar data, título da aba, endereço e numeração automáticos.</small>
      {!reviewerName.trim() && <small>Informe o nome do revisor para habilitar a impressão.</small>}
    </div>
    <DocumentPrintTemplate documentType="PGR" title="Programa de Gerenciamento de Riscos · PGR" companyName={companyName} companyLogo={companyLogo} companyFields={companyDetails} authorName={reviewerName} authorRole="Eng. de Segurança do Trabalho" issueDate={signatureDate.split("-").reverse().join("/")} sections={tocSections} consultancyPhone={consultancyPhone} consultancyEmail={consultancyEmail}>
    <header className="pgr-working-document-status"><p>Documento de trabalho · revisão técnica pendente</p><p>As funções, riscos e ações abaixo refletem as alterações salvas nesta versão do PGR. As informações cadastrais estão na capa.</p></header>
    {(["role", "risk", "action"] as const).map((kind,index) => <section id={`pgr-content-${index}`} key={kind}><h3>{kind === "role" ? "Funções e atividades" : kind === "action" ? "Plano de ação" : "Inventário de riscos e medidas de prevenção"}</h3>{workingDocumentItems(profile, history, kind).map(item => <article className="pgr-card" key={item.id}><h4>{item.fields.name}</h4><p>{item.revision ? `Edição salva · revisão ${item.revision}` : "Extraído da fonte"}</p><dl>{Object.entries(item.fields).filter(([key, value]) => key !== "name" && value).map(([key, value]) => <div key={key}><dt>{(workingFieldLabels(kind) as Record<string, string>)[key]}</dt><dd style={{whiteSpace:"pre-wrap"}}>{value}</dd></div>)}</dl></article>)}</section>)}
    <section id="pgr-content-3"><h3>Avaliações quantitativas · dados da fonte</h3>{profile.exposures.map((item,index) => <article className="pgr-card" key={index}><h4>Quadro {index+1} · página {item.page}</h4><p>Data: {item.date || "Não informada"} · Intensidade: {item.intensity || "Não informada"} · Nível de ação: {item.actionLevel || "Não informado"} · Limite: {item.limit || "Não informado"} · Técnica: {item.method || "Não informada"}</p></article>)}</section>
    {annexes.length > 0 && <div id="pgr-content-4"><PgrContractorAnnexDocument records={annexes}/></div>}
    <p>Fonte: documento cadastrado, {profile.pageCount} páginas. Conteúdo organizado a partir dos dados extraídos e das alterações salvas na estrutura SST Hoje. Este documento permanece pendente de revisão técnica e não constitui aprovação.</p>
    <section id={`pgr-content-${annexes.length ? 5 : 4}`} className="pgr-signatures"><h3>Assinaturas</h3><div className="pgr-signature-grid"><div><div className="pgr-signature-line"/><strong>{representativeName || "Representante da EMA"}</strong><span>Representante da EMA</span><span>Data: {signatureDate.split("-").reverse().join("/")}</span></div><div><div className="pgr-signature-line"/><strong>{reviewerName || "Elaborador / revisor do PGR"}</strong><span>Eng. de Segurança do Trabalho · SST Hoje</span><span>Data: {signatureDate.split("-").reverse().join("/")}</span></div></div><p>Assinaturas manuscritas nos campos acima.</p></section>
    </DocumentPrintTemplate>
  </section>;
}
