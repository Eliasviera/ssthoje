"use client";

/**
 * Conjunto de ícones de linha usado nas telas do app.
 * Mantém o mesmo traço do painel (stroke 1.8, 24x24) para que as áreas
 * não destoem do restante da interface.
 */
type IconProps = { name: string; size?: number };

export function Icon({ name, size = 20 }: IconProps) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "home") return <svg {...common}><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-7h6v7"/></svg>;
  if (name === "building") return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3"/></svg>;
  if (name === "file") return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></svg>;
  if (name === "people") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === "equipment") return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/><path d="m6 7 1 1 2-2m-3 6 1 1 2-2m-3 6 1 1 2-2"/></svg>;
  if (name === "permit") return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6m-12 5h8m-8 4h5"/><path d="m15 17 1.5 1.5L20 15"/></svg>;
  if (name === "helmet") return <svg {...common}><path d="M4 17h16"/><path d="M6.2 17v-2.1a5.8 5.8 0 0 1 11.6 0V17"/><path d="M12 6.5v2.8"/></svg>;
  if (name === "training") return <svg {...common}><path d="M12 4 3 8.5l9 4.5 9-4.5L12 4Z"/><path d="M6.5 10.8V15c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3v-4.2"/><path d="M21 8.6v5.4"/></svg>;
  if (name === "speech") return <svg {...common}><path d="M20.5 11.8c0 4-3.8 7.2-8.5 7.2-1 0-2-.2-2.9-.5L4 21l1.4-4.2a6.9 6.9 0 0 1-1.9-5C3.5 7.8 7.3 4.6 12 4.6s8.5 3.2 8.5 7.2Z"/><path d="M8.6 11.8h.01M12 11.8h.01M15.4 11.8h.01"/></svg>;
  if (name === "chart") return <svg {...common}><path d="M4 4v16h16"/><path d="M8.5 16.5v-4M12.5 16.5V8M16.5 16.5V10"/></svg>;
  if (name === "audit") return <svg {...common}><path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5"/><path d="M13.5 3 19 8.5V11"/><path d="M13.5 3v5.5H19"/><circle cx="16.5" cy="16.5" r="2.8"/><path d="m18.7 18.7 1.8 1.8"/></svg>;
  if (name === "machine") return <svg {...common}><rect x="3.2" y="6.6" width="13.6" height="10.4" rx="1.8"/><path d="M6.2 6.6V3.4h3.8v3.2"/><path d="M16.8 10.6h2a1.6 1.6 0 0 1 1.6 1.6v4.8"/><circle cx="7.8" cy="11.8" r="2"/><path d="M12.2 11.8h3.2"/><path d="M5.4 17v2.4M14.6 17v2.4"/></svg>;
  if (name === "firstaid") return <svg {...common}><rect x="3.2" y="6.5" width="17.6" height="13" rx="3"/><path d="M12 10v6M9 13h6"/></svg>;
  if (name === "checklist") return <svg {...common}><path d="M9.5 6h10.5M9.5 12h10.5M9.5 18h10.5"/><path d="m3.2 5.8 1.3 1.3 2.3-2.4M3.2 11.8l1.3 1.3 2.3-2.4M3.2 17.8l1.3 1.3 2.3-2.4"/></svg>;
  if (name === "arrow") return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
  if (name === "warning") return <svg {...common}><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/></svg>;
  if (name === "clipboard") return <svg {...common}><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6m-6 4h6m-6 4h3"/></svg>;
  if (name === "camera") return <svg {...common}><path d="M3 9.5A1.5 1.5 0 0 1 4.5 8h2.2l1.4-2h7.8l1.4 2h2.2A1.5 1.5 0 0 1 21 9.5v9A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5Z"/><circle cx="12" cy="13.5" r="3.6"/></svg>;
  if (name === "spark") return <svg {...common}><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z"/></svg>;
  if (name === "check") return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>;
  if (name === "history") return <svg {...common}><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>;
}
