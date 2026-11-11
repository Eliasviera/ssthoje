"use client";

import { useActionState, useState } from "react";
import { pendingDocumentSigners, type DocumentSigner, type DocumentSignature, type DocumentWorkerOption } from "@/lib/document-signatures";
import {
  addRiskAnalysisSignerAction,
  addSafetyAprSignerAction,
  addWorkPermitSignerAction,
  signRiskAnalysisAction,
  signSafetyAprAction,
  signWorkPermitAction,
  type SafetyOperationsFormState,
} from "./safety-operations-actions";
import SignaturePad from "./signature-pad";

function Feedback({ state }: { state: SafetyOperationsFormState }) {
  return <>{state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}</>;
}

function signatureDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

export default function DocumentSignatures({
  kind, recordId, signers, signatures, issuerDefault, canManage, workers = [],
}: {
  kind: "ar" | "apr" | "pt";
  recordId: string;
  signers: DocumentSigner[];
  signatures: DocumentSignature[];
  issuerDefault: string;
  canManage: boolean;
  workers?: DocumentWorkerOption[];
}) {
  const addAction = kind === "ar" ? addRiskAnalysisSignerAction : kind === "apr" ? addSafetyAprSignerAction : addWorkPermitSignerAction;
  const signAction = kind === "ar" ? signRiskAnalysisAction : kind === "apr" ? signSafetyAprAction : signWorkPermitAction;
  const [state, action, pending] = useActionState(addAction, {});
  const [role, setRole] = useState<"participant" | "issuer">("participant");
  const [nameValue, setNameValue] = useState("");
  const [workerId, setWorkerId] = useState("");
  const signed = new Map(signatures.map((signature) => [signature.signerId, signature]));
  const pendingSigners = pendingDocumentSigners(signers, signatures);
  return <section className="document-signatures" aria-label="Assinaturas do documento">
    <h4>{kind === "pt" ? "Registro de ciência no rascunho" : "Assinaturas de ciência"}</h4>
    <p>{kind === "pt"
      ? "Quem emite é o líder/encarregado da atividade; cada participante assina a própria ciência na tela do dispositivo. O rascunho não é permissão de trabalho e a assinatura não libera atividade."
      : "Quem emite é o líder/encarregado da atividade; cada participante assina a própria ciência na tela do dispositivo."}</p>
    {canManage && <form action={action} className="signature-add-form">
      <input type="hidden" name="recordId" value={recordId}/>
      <input type="hidden" name="workerId" value={workerId}/>
      <label className="form-field">Papel<select name="role" value={role} onChange={(event) => { const next = event.target.value === "issuer" ? "issuer" : "participant"; setRole(next); setWorkerId(""); setNameValue(next === "issuer" ? issuerDefault : ""); }}><option value="participant">Participante da atividade</option><option value="issuer">Emissor (líder/encarregado)</option></select></label>
      {workers.length > 0 && <label className="form-field">Trabalhador cadastrado (opcional)<select value={workerId} onChange={(event) => { const id = event.target.value; setWorkerId(id); const worker = workers.find((entry) => entry.id === id); setNameValue(worker ? worker.name : role === "issuer" ? issuerDefault : ""); }}><option value="">Usar nome digitado</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name} · {worker.jobTitle}</option>)}</select></label>}
      <label className="form-field">Nome de quem vai assinar<input name="name" required maxLength={120} value={nameValue} onChange={(event) => setNameValue(event.target.value)}/></label>
      <button className="secondary-button" disabled={pending}>{pending ? "Incluindo…" : "Incluir na lista"}</button>
    </form>}
    <Feedback state={state}/>
    {signers.length === 0
      ? <p className="permission-note">Nenhuma pessoa incluída para assinar. Inclua o emissor e os participantes da atividade.</p>
      : <ul className="signature-list">{signers.map((signer) => {
        const signature = signed.get(signer.id);
        return <li key={signer.id}>
          <p><strong>{signer.name}</strong> · {signer.role === "issuer" ? "emissor (líder/encarregado)" : "participante"}</p>
          {signature
            ? <div className="signature-record"><img src={signature.image} alt={`Assinatura de ${signer.name}`}/><small>Assinado em {signatureDate(signature.signedAt)} (Brasília) · assinatura simples</small></div>
            : canManage
              ? <SignaturePad action={signAction} fields={{ recordId, signerId: signer.id }} label={signer.name} buttonLabel="Registrar assinatura"/>
              : <small>Aguardando assinatura.</small>}
        </li>;
      })}</ul>}
    {signers.length > 0 && <p className="permission-note signature-pending" role="status">{pendingSigners.length === 0
      ? `Todos assinaram · ${signatures.length} de ${signers.length} assinatura(s).`
      : `Faltam assinar: ${pendingSigners.map((signer) => signer.name).join(", ")} · ${signatures.length} de ${signers.length} assinatura(s).`}</p>}
    <p className="permission-note">Assinatura simples desenhada na tela, sem validade de assinatura qualificada (ICP-Brasil). A imagem é dado pessoal: registre apenas com finalidade de SST e acesso restrito.</p>
  </section>;
}
