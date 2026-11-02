import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SST Hoje — Não deixa para amanhã",
  description: "Uma forma simples de acompanhar a Saúde e Segurança do Trabalho.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
