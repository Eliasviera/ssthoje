import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/sst-icon";

/**
 * Casca das telas operacionais: menu lateral fixo + topo enxuto (só migalhas
 * de pão e ações contextuais). Antes, cada página repetia a lista de áreas em
 * botões no topo; agora a navegação vive na lateral, como no painel.
 */
type PanelItem = { href: string; label: string; icon: string; scope?: "nrs" | "accident" };

const ITEMS: readonly PanelItem[] = [
  { href: "/", label: "Painel operacional", icon: "home" },
  { href: "/empresas", label: "Empresas", icon: "building" },
  { href: "/pgr", label: "Gestão de PGR", icon: "clipboard" },
  { href: "/epi/entregas", label: "Gestão de EPI", icon: "helmet" },
  { href: "/documentos", label: "Documentos", icon: "file" },
  { href: "/treinamentos", label: "Gestão de Treinamentos", icon: "training" },
  { href: "/dds", label: "DDS", icon: "speech" },
  { href: "/desvios", label: "Desvios", icon: "warning" },
  { href: "/relatorios/desvios", label: "Relatório de desvios", icon: "chart" },
  { href: "/permissoes-trabalho", label: "PT e PTE", icon: "permit" },
  { href: "/checklists", label: "Checklists", icon: "checklist" },
  { href: "/equipamentos", label: "Gestão de Equipamentos", icon: "machine" },
  { href: "/cipa", label: "Gestão de CIPA", icon: "people" },
  { href: "/acidentes", label: "Acidentes e CAT", icon: "firstaid", scope: "accident" },
  { href: "/auditoria-nrs", label: "Auditoria de NRs", icon: "audit", scope: "nrs" },
];

const noUnderline = { textDecoration: "none" } as const;

function NavList({ items, current }: { items: readonly PanelItem[]; current?: string }) {
  return <>{items.map((item) => {
    const active = item.href === current;
    return <Link
      key={item.href}
      className={`nav-link${active ? " nav-link-active" : ""}`}
      href={item.href}
      aria-current={active ? "page" : undefined}
      style={noUnderline}
    >
      <Icon name={item.icon} size={20} />
      <span>{item.label}</span>
    </Link>;
  })}</>;
}

export default function PanelShell({
  tenantName,
  current,
  title,
  showNrs = false,
  showAccidents = false,
  actions,
  children,
}: {
  tenantName: string;
  current?: string;
  title?: string;
  showNrs?: boolean;
  showAccidents?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const items = ITEMS.filter((item) => (item.scope === "nrs" ? showNrs : item.scope === "accident" ? showAccidents : true));
  const currentLabel = title ?? items.find((item) => item.href === current)?.label ?? "";

  return <div className="app-shell">
    <aside className="sidebar" aria-label="Menu principal">
      <Link className="brand" href="/" aria-label="SST Hoje, ir ao painel" style={noUnderline}>
        <Image className="brand-image" src="/logo-sst-hoje.png" alt="" width={72} height={72} priority />
        <span className="brand-name">SST <strong>Hoje</strong><small>Não deixa para amanhã.</small></span>
      </Link>
      <div className="workspace-label" title={tenantName}>{tenantName.toUpperCase()}</div>
      <nav className="navigation" aria-label="Áreas da consultoria">
        <NavList items={items} current={current} />
      </nav>
      <div className="sidebar-bottom">
        <div className="help-card">
          <span className="help-icon"><Icon name="spark" size={18} /></span>
          <strong>Ambiente de demonstração</strong>
          <p>As áreas seguem em construção. Nenhuma decisão técnica é tomada pelo sistema.</p>
        </div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="mobile-brand">
          <Image src="/logo-sst-hoje.png" alt="" width={38} height={38} priority />
          <span>SST <strong>Hoje</strong></span>
        </div>
        <div className="breadcrumbs">
          <span>{tenantName}</span>
          <span className="crumb-separator">/</span>
          <strong>{currentLabel}</strong>
        </div>
        <div className="topbar-right">{actions}</div>
      </header>
      {children}
    </main>

    <nav className="mobile-nav" aria-label="Navegação principal">
      <NavList items={items} current={current} />
    </nav>
  </div>;
}
