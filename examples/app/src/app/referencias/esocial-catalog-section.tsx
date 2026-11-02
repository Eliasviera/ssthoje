"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ESOCIAL_CATALOG_SNAPSHOT,
  searchEsocialCodes,
  type EsocialTableId,
} from "@/lib/esocial-catalog";

export default function EsocialCatalogSection({ canOpenMappings = false }: { canOpenMappings?: boolean }) {
  const [tableId, setTableId] = useState<EsocialTableId>("24");
  const [query, setQuery] = useState("");
  const table = ESOCIAL_CATALOG_SNAPSHOT.tables.find((entry) => entry.table === tableId);
  const matches = searchEsocialCodes(tableId, query);
  const visible = matches.slice(0, 50);

  if (!table) throw new Error("Tabela eSocial indisponível neste snapshot.");

  return <section className="platform-card esocial-catalog" aria-labelledby="esocial-catalog-title">
    <h2 id="esocial-catalog-title">Consulta de códigos oficiais do eSocial</h2>
    <p>Snapshot de referência oficial: {ESOCIAL_CATALOG_SNAPSHOT.sourceVersion} · revisão publicada em 20/10/2026.</p>
    <div className="esocial-catalog-tabs" role="group" aria-label="Tabela eSocial">
      <button type="button" aria-pressed={tableId === "24"} onClick={() => setTableId("24")}>Tabela 24 · S-2240</button>
      <button type="button" aria-pressed={tableId === "27"} onClick={() => setTableId("27")}>Tabela 27 · S-2220</button>
    </div>
    <p><strong>{table.title}</strong> · {table.entries.length.toLocaleString("pt-BR")} códigos no snapshot.</p>
    <label className="esocial-catalog-search">Buscar por código ou descrição
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Digite um código ou termo"/>
    </label>
    <p role="status" aria-live="polite">{matches.length.toLocaleString("pt-BR")} resultado(s){matches.length > visible.length ? "; mostrando os 50 primeiros" : ""}.</p>
    <ul className="esocial-catalog-results">{visible.map((entry) => <li key={entry.code}><code>{entry.code}</code><span>{entry.label}</span></li>)}</ul>
    <p className="platform-warning">Consulta informativa somente. A Tabela 24 lista agentes nocivos/atividades do S-2240; a Tabela 27 lista procedimentos diagnósticos usados no contexto do S-2220. A pesquisa não decide aplicabilidade, não vincula códigos a riscos ou exames e não valida vigência individual. Confira a fonte oficial antes de usar.</p>
    <p>Fonte: <a href={ESOCIAL_CATALOG_SNAPSHOT.sourceUrl} target="_blank" rel="noreferrer">publicação oficial do eSocial</a>. Consultada em 01/11/2026. Nenhum evento é gerado, assinado ou transmitido.</p>
    {canOpenMappings && <p><Link href="/esocial">Abrir associações manuais com revisão humana →</Link></p>}
  </section>;
}
