"use client";
import { useActionState } from "react";
import type { ProbeResult } from "@/lib/object-storage-probe";
import { storageProbeAction } from "./storage-actions";
export default function StoragePanel({ status }: { status: ProbeResult }) {
  const [state, action, pending] = useActionState(storageProbeAction, {});
  const verified = status.state === "verified" || state.success;
  return <section className="platform-card" aria-labelledby="storage-probe-title">
    <h2 id="storage-probe-title">Armazenamento privado de arquivos</h2>
    <p>Verificação exclusiva do Master. Envia um pequeno PDF fictício ao armazenamento da Magalu, confere o download e verifica se o acesso sem autorização é negado.</p>
    <p>{verified ? "Verificação concluída. O resultado não libera anexos de clientes automaticamente." : status.state === "disabled" ? "Conexão desativada. Configure no servidor uma credencial apropriada ao armazenamento." : "Conexão configurada para verificação."}</p>
    <p>O PDF de teste fica preservado. Até três tentativas são permitidas, com um minuto de intervalo; repetir após sucesso não envia outro arquivo.</p>
    {status.verifiedAt && <p>Última confirmação: {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(status.verifiedAt))}.</p>}
    <form action={action} aria-busy={pending}>
      <label className="platform-check"><input type="checkbox" name="acknowledged" required disabled={pending || verified || status.state === "disabled"}/>Autorizo enviar e preservar somente o PDF fictício desta verificação.</label>
      <button disabled={pending || verified || status.state === "disabled" || status.attempts >= 3}>{pending ? "Verificando armazenamento…" : verified ? "Verificação concluída" : "Verificar envio e download"}</button>
    </form>
    {state.message && <p role={state.success ? "status" : "alert"}>{state.message}</p>}
  </section>;
}
