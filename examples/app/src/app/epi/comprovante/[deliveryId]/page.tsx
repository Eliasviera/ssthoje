import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect, notFound } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { readEpiReceipt } from "@/lib/epi-service";
import PrintButton from "./print-button";

export const metadata = { title: "Comprovante fictício de EPI · SST Hoje", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Page({ params }: { params: Promise<{ deliveryId: string }> }) {
  return <Suspense fallback={<main className="auth-loading">Abrindo comprovante fictício…</main>}><Receipt params={params}/></Suspense>;
}
async function Receipt({ params }: { params: Promise<{ deliveryId: string }> }) {
  await connection(); const access = await getCurrentTenantAccess("epi.read");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const { deliveryId } = await params; const delivery = readEpiReceipt(access.session.userId, deliveryId);
  if (!delivery?.confirmation) notFound();
  const receipt = delivery.confirmation;
  return <main className="epi-receipt"><div className="epi-print-controls"><Link href="/">Voltar ao painel</Link><PrintButton/></div><article><p>SST Hoje · {access.context.tenant.name}</p><h1>Comprovante fictício de EPI</h1><div className="document-warning"><strong>SIMULAÇÃO LOCAL — SEM EFEITO JURÍDICO</strong><p>Não comprova entrega real, identidade, treinamento, validade de CA ou conformidade. Código exibido no simulador, sem envio externo ou assinatura.</p></div><h2>{delivery.workerName}</h2><p>{delivery.companyName} · {delivery.unitName}</p><p>CNPJ relacionado fictício: {delivery.relatedCnpj}</p><p>Data de entrega informada: {delivery.deliveredOn.split("-").reverse().join("/")}</p><h2>Itens registrados</h2><ul>{delivery.items.map((item, i) => <li key={i}><strong>{item.name}</strong> · {item.quantity} unidade(s) · {item.size} · Referência/CA fictício: {item.reference}</li>)}</ul><h2>Registro da simulação</h2><p>{receipt.statement}</p><p>Protocolo: {receipt.protocol}</p><p>Confirmado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(receipt.confirmedAt))} (Brasília).</p><p>Versão da declaração: {receipt.statementVersion} · modo mock</p><p>Resumo SHA-256 dos dados registrados: <code>{receipt.deliveryDigest}</code></p><p>O resumo identifica o conteúdo registrado; não representa assinatura digital ou comprovação de autoria.</p></article></main>;
}
