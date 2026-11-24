import Link from "next/link";

const links = [
  { href: "/dds", label: "DDS" },
  { href: "/checklists", label: "Checklists" },
  { href: "/desvios", label: "Desvios" },
] as const;

// O perfil Campo não tem painel: esta barra liga as três áreas dele.
export default function TopbarActions({ role, current }: { role: string; current: (typeof links)[number]["href"] | "/acidentes" | "/treinamentos" }) {
  if (role === "trabalhador") return null;
  if (role !== "campo" && role !== "cliente") return <Link className="secondary-button" href="/">Voltar ao painel</Link>;
  return <nav aria-label={role === "cliente" ? "Áreas da empresa" : "Áreas do campo"} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {links.map((item) => <Link key={item.href} className="secondary-button" href={item.href} aria-current={item.href === current ? "page" : undefined} style={item.href === current ? { fontWeight: 700 } : undefined}>{item.label}</Link>)}
    {role === "cliente" && <Link className="secondary-button" href="/treinamentos" aria-current={current === "/treinamentos" ? "page" : undefined} style={current === "/treinamentos" ? { fontWeight: 700 } : undefined}>Treinamentos</Link>}
    {role === "cliente" && <Link className="secondary-button" href="/minha-empresa/logo">Logo da empresa</Link>}
  </nav>;
}
