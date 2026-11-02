"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { changeSiteContent } from "@/lib/site-service";
import type { SiteContent } from "@/lib/site-content";
export type ContentState = { error?: string; success?: string };
export async function contentAction(_previous: ContentState, data: FormData): Promise<ContentState> {
  const session = await getSession(); if (!session) return { error: "Entre novamente para editar." };
  try {
    const text = (key: string, max: number) => { const v = data.get(key); if (typeof v !== "string" || v.length > max) throw new Error("Confira os campos e seus limites."); return v; };
    const revision = text("revision", 10), operation = text("operation", 10);
    if (!/^\d+$/.test(revision) || !["save", "publish"].includes(operation)) throw new Error("Atualize o editor antes de continuar.");
    if (operation === "publish" && data.get("reviewed") !== "on") throw new Error("Confirme que revisou a prévia antes de publicar.");
    const content: SiteContent | undefined = operation === "save" ? { eyebrow: text("eyebrow", 70), headline: text("headline", 100), summary: text("summary", 420), ctaLabel: text("ctaLabel", 45), image: text("image", 10) as SiteContent["image"], plans: [0, 1].map(i => ({ title: text(`planTitle${i}`, 60), description: text(`planDescription${i}`, 240) })), faq: [0, 1, 2].map(i => ({ question: text(`question${i}`, 120), answer: text(`answer${i}`, 600) })) } : undefined;
    await changeSiteContent(session.userId, operation as "save" | "publish", Number(revision), text("reason", 600), content);
    revalidatePath("/site"); revalidatePath("/master/conteudo"); revalidatePath("/master/conteudo/preview");
    return { success: operation === "save" ? "Rascunho salvo. A página pública permanece na versão publicada." : "Revisão publicada na página local /site, com histórico preservado." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar o conteúdo." }; }
}
