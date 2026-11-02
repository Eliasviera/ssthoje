import Link from "next/link";

const links = [
  { href: "/dds", label: "DDS" },
  { href: "/checklists", label: "Checklists" },
  { href: "/desvios", label: "Desvios" },
] as const;

// O perfil Campo não tem painel: esta barra liga as três áreas dele.
export default function TopbarActions({ role, current }: { role: string; current: (typeof links)[number]["href"] }) {
  if (role !== "campo") return <Link className="secondary-button" href="/">Voltar ao painel</Link>;
  return <nav aria-label="Áreas do campo" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {links.map((item) => <Link key={item.href} className="secondary-button" href={item.href} aria-current={item.href === current ? "page" : undefined} style={item.href === current ? { fontWeight: 700 } : undefined}>{item.label}</Link>)}
  </nav>;
}
