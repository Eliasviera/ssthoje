"use client";

import { useState } from "react";

type Scenario = "valid" | "expiring" | "expired" | "unknown";
const scenarios: Record<Scenario, { label: string; status: string; tone: string; note: string }> = {
  valid: { label: "Treinamentos em dia (simulação)", status: "Sem pendências neste cenário", tone: "ok", note: "Todos os itens demonstrativos estão dentro da validade fictícia." },
  expiring: { label: "Treinamento perto do vencimento", status: "Atenção demonstrativa", tone: "attention", note: "NR-35 vence em 12 dias no cenário fictício." },
  expired: { label: "Treinamento vencido", status: "Bloqueio demonstrativo", tone: "blocked", note: "NR-35 vencida no cenário. A tela demonstra o alerta; não libera nem decide atividade real." },
  unknown: { label: "Evidência não validada", status: "Não confirmado", tone: "unknown", note: "A informação foi relatada, mas não há validação documental neste cenário." },
};

export default function PassaporteDemoPanel() {
  const [view, setView] = useState<"worker" | "field">("worker");
  const [scenario, setScenario] = useState<Scenario>("expiring");
  const [code, setCode] = useState("");
  const [searched, setSearched] = useState(false);
  const current = scenarios[scenario];
  const found = code.trim().toUpperCase() === "PASS-DEMO-001";

  return <div className="passport-demo">
    <div className="document-warning" role="note"><strong>Ambiente de teste.</strong> Nome, empresa, identificador, status e validade são fictícios. Não há gravação, câmera, QR autenticável, validação médica, decisão de liberação ou transmissão externa.</div>
    <div className="passport-tabs" role="group" aria-label="Telas do protótipo">
      <button type="button" className={view === "worker" ? "primary-button" : "secondary-button"} onClick={() => setView("worker")}>Minha carteira</button>
      <button type="button" className={view === "field" ? "primary-button" : "secondary-button"} onClick={() => setView("field")}>Ensaio do líder</button>
    </div>

    {view === "worker" ? <>
      <section className="panel passport-card" aria-labelledby="worker-passport-heading">
        <div className="passport-heading"><div><p className="eyebrow">CARTÃO DO COLABORADOR · FICTÍCIO</p><h2 id="worker-passport-heading">Marina Oliveira</h2><p>Operadora de produção · Horizonte Demonstração Ltda.</p></div><span className="passport-avatar" aria-hidden="true">MO</span></div>
        <div className={`passport-status passport-status-${current.tone}`}><span aria-hidden="true"/><div><strong>{current.status}</strong><small>{current.note}</small></div></div>
        <div className="passport-body-grid">
          <div className="passport-qr-panel"><div className="passport-qr-illustration" role="img" aria-label="Ilustração de QR fictício, não escaneável"><span>QR</span></div><strong>PASS-DEMO-001</strong><small>Ilustração estática · não autenticável</small></div>
          <div className="passport-evidence"><h3>Habilitações do cenário</h3>
            <article><span><strong>NR-35 · Trabalho em altura</strong><small>{scenario === "valid" ? "Válido até 10/2027 · fictício" : scenario === "expiring" ? "Vence em 12 dias · fictício" : scenario === "expired" ? "Vencido · fictício" : "Informado, aguardando validação"}</small></span><b>{scenario === "valid" ? "VÁLIDO" : scenario === "expiring" ? "VENCENDO" : scenario === "expired" ? "VENCIDO" : "PENDENTE"}</b></article>
            <article><span><strong>NR-10 · Segurança em eletricidade</strong><small>Válido até 10/2027 · fictício</small></span><b>VÁLIDO</b></article>
            <article><span><strong>ASO · status mínimo</strong><small>Registro demonstrativo; detalhes clínicos não são exibidos</small></span><b>FICTÍCIO</b></article>
          </div>
        </div>
      </section>
      <section className="panel passport-scenario"><div><h2>Trocar cenário para teste</h2><p>Altere os dados sintéticos para conferir os estados visuais.</p></div><label className="form-field" htmlFor="passport-scenario">Cenário<select id="passport-scenario" value={scenario} onChange={event => setScenario(event.target.value as Scenario)}>{Object.entries(scenarios).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label><p className="permission-note">O status é apenas uma saída de demonstração baseada neste seletor. Não representa aptidão, conformidade ou autorização.</p></section>
    </> : <section className="panel passport-field" aria-labelledby="field-scan-heading">
      <p className="eyebrow">NÍVEL 02 · SIMULAÇÃO DE CONSULTA</p><h2 id="field-scan-heading">Consultar colaborador</h2><p>Digite o código fictício abaixo. Esta tela não usa câmera nem lê QR real.</p>
      <form onSubmit={event => { event.preventDefault(); setSearched(true); }} className="passport-lookup"><label className="form-field" htmlFor="passport-code">Código de demonstração<input id="passport-code" value={code} onChange={event => { setCode(event.target.value); setSearched(false); }} placeholder="Ex.: PASS-DEMO-001" autoComplete="off" maxLength={40}/></label><button className="primary-button" type="submit">Consultar cenário</button></form>
      {searched && (found ? <div className={`passport-status passport-status-${current.tone}`} role="status"><span aria-hidden="true"/><div><strong>Colaboradora fictícia localizada · {current.status}</strong><small>{current.note} · Empresa e unidade: Horizonte Demonstração Ltda. / Unidade Central (fictícias).</small></div></div> : <div className="passport-status passport-status-blocked" role="alert"><span aria-hidden="true"/><div><strong>Código não reconhecido</strong><small>Confira o identificador fictício ou use a contingência manual.</small></div></div>)}
      <details className="passport-manual"><summary>Modo manual / contingência</summary><p>Ensaio: selecione “PASS-DEMO-001” e consulte o cadastro sintético. Não captura nome, CPF, selfie nem assinatura provisória.</p><button type="button" className="secondary-button" onClick={() => { setCode("PASS-DEMO-001"); setSearched(true); }}>Carregar colaboradora fictícia</button></details>
      <div className="document-warning">Este protótipo não registra presença de DDS, não abre APR/PT/PTE e não libera atividade. QR assinado, câmera, operação offline e validação atual exigem implementação própria.</div>
    </section>}
  </div>;
}
