import { Suspense } from "react";
import { connection } from "next/server";
import { findPendingInvite } from "@/lib/invite-store";
import TrialForm from "./form";
export const metadata = { title: "Ativar convite | SST Hoje", robots: { index: false, follow: false }, referrer: "no-referrer" };
type Props = { params: Promise<{ token: string }> };
export default function Page(props: Props) { return <Suspense fallback={<p>Conferindo convite…</p>}><Content {...props}/></Suspense>; }
async function Content({ params }: Props) {
  await connection();
  const { token } = await params;
  const invite = findPendingInvite(token);
  return <main style={{ maxWidth: 600, margin: "2rem auto", padding: "1rem" }}><h1>Seu ambiente de teste SST Hoje</h1>{invite ? <><p>Seu ambiente começa vazio e o acesso dura 30 dias a partir da ativação. A exclusão automática após o prazo ainda não está disponível. Não insira documentos ou dados reais de clientes e trabalhadores.</p><TrialForm token={token}/></> : <p>Convite indisponível, usado ou expirado. Solicite um novo link ao responsável.</p>}</main>;
}
