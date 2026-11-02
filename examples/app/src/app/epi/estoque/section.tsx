"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import type { ClientCompany } from "@/lib/client-store";
import type { EpiStockDocumentFields } from "@/lib/epi-stock-pdf-extractor";
import type { EpiStockItem } from "@/lib/epi-stock-store";
import { createStockAction, moveStockAction, reviewStockCaAction, type StockFormState } from "./actions";

type StockDeliveryContext = {
  id: string;
  workerName: string;
  status: string;
  items: { ca: string; size: string; quantity: number }[];
};

const extractedInputNames = ["quantity", "sourceReference", "supplier", "batchCode", "productValidUntil", "unitCost"] as const;
type ExtractedInputName = typeof extractedInputNames[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function updateInputValue(form: HTMLFormElement, name: ExtractedInputName, value: string) {
  const control = form.elements.namedItem(name);
  if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) || control.value === value) return;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value")?.set;
  if (setter) setter.call(control, value);
  else control.value = value;
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

function clearPreviousSuggestions(form: HTMLFormElement, previous: Partial<Record<ExtractedInputName, string>>) {
  for (const name of extractedInputNames) {
    const suggested = previous[name];
    const control = form.elements.namedItem(name);
    if (suggested && (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) && control.value === suggested) {
      updateInputValue(form, name, "");
    }
    delete previous[name];
  }
}

function readExtractedFields(value: unknown): EpiStockDocumentFields {
  if (!isRecord(value)) return {};
  const keys = ["productName", "ca", "quantity", "sourceReference", "supplier", "batchCode", "productValidUntil", "unitCost"] as const;
  return Object.fromEntries(keys.flatMap(key => typeof value[key] === "string" ? [[key, value[key] as string]] : []));
}

function Feedback({ state }: { state: StockFormState }) {
  return <>
    {state.error && <p role="alert" className="client-form-message client-form-error">{state.error}</p>}
    {state.requiresCaExpiredExitConfirmation && <div className="document-warning pgr-wide">
      <p>O CA informado está vencido. A confirmação registra a decisão do gestor autorizado e não declara conformidade.</p>
      <label className="form-field"><input type="checkbox" name="caExpiredExitConfirmed" required />Confirmo como gestor autorizado que revisei esta saída.</label>
      <label className="form-field pgr-wide">Justificativa da decisão<textarea name="caExpiredExitJustification" maxLength={500} required rows={3} /></label>
    </div>}
    {state.success && <p role="status" className="client-form-message client-form-success">{state.success}</p>}
  </>;
}

function balance(item: EpiStockItem) {
  return item.movements.reduce((sum, movement) => sum + (movement.direction === "entry" ? movement.quantity : movement.direction === "exit" ? -movement.quantity : 0), 0);
}

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function recentDateLimit() {
  return new Date(Date.parse(`${today()}T12:00:00Z`) - 15 * 86400000).toISOString().slice(0, 10);
}

function caCheckStale(date?: string) {
  return !date || date > today() || date < recentDateLimit();
}

function daysUntil(value: string) {
  return Math.floor((Date.parse(`${value}T12:00:00Z`) - Date.parse(`${today()}T12:00:00Z`)) / 86400000);
}

function daysSince(value?: string) {
  return value ? Math.floor((Date.parse(`${today()}T12:00:00Z`) - Date.parse(`${value}T12:00:00Z`)) / 86400000) : null;
}

function displayDate(value?: string) {
  return value?.split("-").reverse().join("/") || "não informada";
}

function sourceLabel(type?: string) {
  return type === "invoice" ? "Nota fiscal" : type === "warehouse_report" ? "Relatório de almoxarifado" : type === "direct_system" ? "Cadastro direto no sistema" : type === "purchase_order" ? "Compra direta · pedido" : type === "warehouse_transfer" ? "Transferência recebida do almoxarifado" : "Ajuste ou outra origem";
}

function batches(item: EpiStockItem) {
  const grouped = new Map<string, { batchCode: string; productValidUntil: string; balance: number }>();
  for (const movement of item.movements) {
    if (!movement.batchCode || !movement.productValidUntil) continue;
    const key = `${movement.batchCode}|${movement.productValidUntil}`;
    const batch = grouped.get(key) ?? { batchCode: movement.batchCode, productValidUntil: movement.productValidUntil, balance: 0 };
    batch.balance += movement.direction === "entry" ? movement.quantity : movement.direction === "exit" ? -movement.quantity : 0;
    grouped.set(key, batch);
  }
  return [...grouped.values()].filter(batch => batch.balance > 0).sort((a, b) => a.productValidUntil.localeCompare(b.productValidUntil));
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function batchUnitCost(item: EpiStockItem, batchCode: string, productValidUntil: string) {
  let quantity = 0, value = 0, hasCost = false, unknownCost = false;
  for (const movement of item.movements) {
    if (movement.batchCode !== batchCode || movement.productValidUntil !== productValidUntil) continue;
    if (movement.direction === "entry") {
      quantity += movement.quantity;
      if (Number.isSafeInteger(movement.unitCostCents)) { value += movement.quantity * movement.unitCostCents!; hasCost = true; }
      else unknownCost = true;
    } else if (movement.direction === "exit") {
      quantity -= movement.quantity;
      if (Number.isSafeInteger(movement.unitCostCents)) value -= movement.quantity * movement.unitCostCents!;
      else unknownCost = true;
    }
  }
  return hasCost && !unknownCost && quantity > 0 ? Math.max(0, Math.round(value / quantity)) : undefined;
}

function ExpiredCaExitConfirmations({ items }: { items: EpiStockItem[] }) {
  const confirmations = items.flatMap(item => item.movements.filter(movement => movement.direction === "exit" && movement.caExpiredExitConfirmed).map(movement => ({ item, movement })));
  return confirmations.length ? <details className="company-detail-panel">
    <summary>Confirmações de saída com CA informado vencido · {confirmations.length}</summary>
    <ol>{confirmations.map(({ item, movement }) => <li key={`${item.id}-${movement.id}`}>
      <strong>{item.name} · CA {item.ca} · {movement.quantity} un.</strong>
      <p>Justificativa: {movement.caExpiredExitJustification}</p>
      <p>Gestor/conta: {movement.actorUserId} · {new Date(movement.occurredAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília)</p>
    </li>)}</ol>
    <p>Registro da decisão interna; não é avaliação nem declaração de conformidade.</p>
  </details> : null;
}

function StockMovementForm({ item, stockItems, canManage, deliveryContext, movementMode }: {
  item: EpiStockItem;
  stockItems: EpiStockItem[];
  canManage: boolean;
  deliveryContext?: StockDeliveryContext;
  movementMode: "exit" | "return";
}) {
  const [state, action, pending] = useActionState(moveStockAction, {});
  const [caState, caAction, caPending] = useActionState(reviewStockCaAction, {});
  const [direction, setDirection] = useState<"entry" | "exit" | "return">(deliveryContext ? movementMode : "entry");
  const [sourceType, setSourceType] = useState("direct_system");
  const [documentExtraction, setDocumentExtraction] = useState<{ fields: EpiStockDocumentFields; error?: string } | null>(null);
  const [extractingDocument, setExtractingDocument] = useState(false);
  const documentRequestId = useRef(0);
  const documentRequestController = useRef<AbortController | null>(null);
  const appliedSuggestions = useRef<Partial<Record<ExtractedInputName, string>>>({});

  useEffect(() => () => documentRequestController.current?.abort(), []);

  const itemMatchesDelivery = !!deliveryContext && deliveryContext.items.some(entry => entry.ca === item.ca && entry.size === item.size);
  const deliveryQuantity = deliveryContext?.items.filter(entry => entry.ca === item.ca && entry.size === item.size).reduce((sum, entry) => sum + entry.quantity, 0) ?? 0;
  const equivalentStock = stockItems.filter(record => record.companyId === item.companyId && record.unitId === item.unitId && record.ca === item.ca && record.size === item.size);
  const alreadyIssued = deliveryContext ? equivalentStock.flatMap(record => record.movements).filter(movement => movement.direction === "exit" && movement.deliveryReference === deliveryContext.id).reduce((sum, movement) => sum + movement.quantity, 0) : 0;
  const alreadyReturned = deliveryContext ? equivalentStock.flatMap(record => record.movements).filter(movement => movement.direction === "return" && movement.sourceReference === deliveryContext.id).reduce((sum, movement) => sum + movement.quantity, 0) : 0;
  const linkedQuantity = direction === "exit" ? deliveryQuantity - alreadyIssued : direction === "return" ? alreadyIssued - alreadyReturned : deliveryQuantity;
  const availableBatches = batches(item);

  async function extractSourceDocument(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0], form = input.form;
    if (!file || !form) return;
    documentRequestController.current?.abort();
    const controller = new AbortController();
    documentRequestController.current = controller;
    const requestId = ++documentRequestId.current;
    clearPreviousSuggestions(form, appliedSuggestions.current);
    setDocumentExtraction(null);
    setExtractingDocument(true);
    try {
      const request = new FormData();
      request.append("file", file);
      const response = await fetch("/api/epi/stock-document/extract", { method: "POST", body: request, signal: controller.signal });
      const payload: unknown = await response.json();
      if (requestId !== documentRequestId.current) return;
      if (!isRecord(payload)) throw new Error("A resposta da leitura do PDF é inválida.");
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Não foi possível ler o PDF.");
      const fields = readExtractedFields(payload.fields);
      for (const name of extractedInputNames) {
        const value = fields[name];
        const control = form.elements.namedItem(name);
        if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) continue;
        if (control.value.trim()) continue;
        if (!value) continue;
        updateInputValue(form, name, value);
        appliedSuggestions.current[name] = value;
      }
      setDocumentExtraction({ fields });
    } catch (error) {
      if (requestId !== documentRequestId.current || (error instanceof DOMException && error.name === "AbortError")) return;
      setDocumentExtraction({ fields: {}, error: error instanceof Error ? error.message : "Não foi possível ler o PDF." });
    } finally {
      if (requestId === documentRequestId.current) {
        documentRequestController.current = null;
        setExtractingDocument(false);
      }
    }
  }

  if (!canManage) return null;

  return canManage && deliveryContext && !itemMatchesDelivery
    ? <p className="permission-note">Esta ficha não contém este CA e tamanho. Abra a baixa no item correspondente.</p>
    : deliveryContext?.status === "canceled"
      ? <p className="document-warning">A ficha está cancelada e não aceita movimentação de estoque.</p>
      : <details className="aso-new" open={!!deliveryContext}>
        <summary>Movimentar estoque próprio de EPI</summary>
        <form action={action} className="pgr-form">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="revision" value={item.revision} />
          <label className="form-field">Movimentação
            <select name="direction" value={direction} onChange={event => setDirection(event.target.value as "entry" | "exit" | "return")}>
              <option value="entry">Entrada no estoque de EPI</option>
              <option value="exit" disabled={!deliveryContext}>Saída / entrega ao trabalhador</option>
              <option value="return" disabled={!deliveryContext}>Devolução recebida</option>
            </select>
          </label>
          <label className="form-field">Quantidade de unidades
            <input name="quantity" type="number" min={1} max={deliveryContext && direction !== "entry" ? Math.max(linkedQuantity, 1) : 1000000} defaultValue={deliveryContext && direction !== "entry" ? Math.max(linkedQuantity, 1) : undefined} step={1} required />
          </label>
          {direction === "entry" ? <>
            <p className="permission-note pgr-wide">Consulte o CAEPI manualmente e transcreva a validade exibida. O sistema registra sua declaração, não consulta nem valida a base oficial.</p>
            <label className="form-field pgr-wide"><input type="checkbox" name="caManualChecked" required />Confirmei manualmente no CAEPI o número do CA deste EPI.</label>
            <label className="form-field">Data da consulta manual<input name="caCheckedOn" type="date" defaultValue={today()} required /></label>
            <label className="form-field">Validade do CA consultada agora<input name="caCheckedValidUntil" type="date" defaultValue={item.caValidUntil} required /></label>
            <label className="form-field">Lote do produto<input name="batchCode" maxLength={80} required /></label>
            <label className="form-field">Validade do produto<input name="productValidUntil" type="date" required /></label>
            <label className="form-field">Custo unitário do lote (R$)
              <input name="unitCost" inputMode="decimal" placeholder="Ex.: 45,90" pattern="[0-9]{1,8}([.,][0-9]{1,2})?" required />
              <small>Usado para totalizar compras e atribuir custo às entregas por área.</small>
            </label>
            <label className="form-field">Forma de entrada
              <select name="sourceType" value={sourceType} onChange={event => {
                documentRequestId.current += 1;
                documentRequestController.current?.abort();
                documentRequestController.current = null;
                if (event.currentTarget.form) clearPreviousSuggestions(event.currentTarget.form, appliedSuggestions.current);
                setExtractingDocument(false);
                setSourceType(event.target.value);
                setDocumentExtraction(null);
              }}>
                <option value="invoice">Nota fiscal (PDF)</option>
                <option value="warehouse_report">Relatório de almoxarifado (PDF)</option>
                <option value="direct_system">Cadastro direto no sistema</option>
                <optgroup label="Outras origens já suportadas">
                  <option value="purchase_order">Compra direta · pedido</option>
                  <option value="warehouse_transfer">Transferência recebida</option>
                  <option value="other">Ajuste ou outra origem</option>
                </optgroup>
              </select>
            </label>
            <label className="form-field">{sourceType === "invoice" ? "Número da nota fiscal" : sourceType === "warehouse_report" ? "Referência do relatório" : sourceType === "direct_system" ? "Referência interna" : "Referência do documento"}
              <input name="sourceReference" maxLength={120} required />
            </label>
            <label className="form-field">Fornecedor (obrigatório em compra direta)
              <input name="supplier" maxLength={160} required={sourceType === "invoice" || sourceType === "purchase_order"} />
            </label>
            <label className="form-field">Responsável pelo recebimento<input name="receivedBy" maxLength={120} required /></label>
            {(sourceType === "invoice" || sourceType === "warehouse_report") && <label className="form-field pgr-wide">
              {sourceType === "invoice" ? "Nota fiscal em PDF" : "Relatório de almoxarifado em PDF"}
              <input name="sourceDocumentPdf" type="file" accept="application/pdf,.pdf" onChange={event => void extractSourceDocument(event)} required />
              <small>PDF pesquisável, até 15 MB. A leitura sugere campos para revisão; o PDF escaneado exige OCR, ainda não disponível.</small>
              {extractingDocument && <span role="status" className="permission-note">Lendo o PDF no sistema…</span>}
              {documentExtraction?.error && <span role="alert" className="client-form-message client-form-error">{documentExtraction.error}</span>}
              {documentExtraction && !documentExtraction.error && <span role="status" className="permission-note">
                Leitura concluída: {Object.keys(documentExtraction.fields).length} campo(s) sugerido(s). Revise antes de registrar.
                {documentExtraction.fields.productName && ` Produto detectado: ${documentExtraction.fields.productName.slice(0, 160)}.`}
                {documentExtraction.fields.ca && ` CA identificado: ${documentExtraction.fields.ca}.`}
                {documentExtraction.fields.ca && documentExtraction.fields.ca !== item.ca && " O CA do documento difere do item selecionado; confira antes de salvar."}
              </span>}
            </label>}
          </> : direction === "exit" ? <>
            <p className="permission-note pgr-wide">Consulte manualmente o CAEPI antes de registrar a saída. A validade transcrita e a confirmação abaixo serão registradas no movimento; o sistema não consulta a base oficial.</p>
            <label className="form-field pgr-wide"><input type="checkbox" name="caManualChecked" required />Confirmei manualmente no CAEPI o número do CA deste EPI.</label>
            <label className="form-field">Data da consulta manual<input name="caCheckedOn" type="date" defaultValue={today()} required /></label>
            <label className="form-field">Validade do CA consultada agora<input name="caCheckedValidUntil" type="date" required /></label>
            <label className="form-field pgr-wide">Lote e validade do produto
              <select name="batchKey" required defaultValue="">
                <option value="">Selecione lote válido com saldo</option>
                {availableBatches.filter(batch => batch.productValidUntil >= today()).map(batch => <option key={`${batch.batchCode}-${batch.productValidUntil}`} value={`${batch.batchCode}|${batch.productValidUntil}`}>
                  {batch.batchCode} · vence {displayDate(batch.productValidUntil)} · saldo {batch.balance}
                  {batchUnitCost(item, batch.batchCode, batch.productValidUntil) === undefined ? "" : ` · custo médio/un. ${money(batchUnitCost(item, batch.batchCode, batch.productValidUntil)!)}`}
                </option>)}
              </select>
            </label>
            {!availableBatches.some(batch => batch.productValidUntil >= today()) && <p className="document-warning pgr-wide">Sem lote válido para saída. Cadastre uma entrada com lote e validade corretos.</p>}
            <label className="form-field">Trabalhador<input name="workerName" maxLength={120} defaultValue={deliveryContext?.workerName} placeholder="Nome do trabalhador" required /></label>
            <label className="form-field">Número da ficha / referência da entrega<input name="deliveryReference" maxLength={120} defaultValue={deliveryContext?.id} placeholder="Código do registro de entrega" required /></label>
            {deliveryContext && linkedQuantity <= 0 && <p className="document-warning pgr-wide">A quantidade já foi baixada ou não há unidades deste CA e tamanho na ficha.</p>}
          </> : <>
            <label className="form-field">Trabalhador que devolveu<input name="returnedBy" maxLength={120} defaultValue={deliveryContext?.workerName} required /></label>
            <label className="form-field">Referência da entrega original<input name="sourceReference" maxLength={120} defaultValue={deliveryContext?.id} placeholder="Número da ficha / registro" required /></label>
            <label className="form-field">Condição após inspeção
              <select name="returnCondition" required defaultValue="">
                <option value="">Selecione</option>
                <option value="inspected_reusable">Íntegro e aprovado para retorno após inspeção</option>
                <option value="quarantine">Em quarentena para avaliação</option>
                <option value="not_reusable">Não reutilizável / descarte</option>
              </select>
            </label>
            {deliveryContext && linkedQuantity <= 0 && <p className="document-warning pgr-wide">Não há unidades deste item registradas como saída para devolução nesta ficha.</p>}
          </>}
          <label className="form-field pgr-wide">Motivo, destino, inspeção e observações<textarea name="reason" maxLength={1200} required rows={3} /></label>
          <Feedback state={state} />
          <div className="pgr-form-footer">
            <p>A saída será valorizada pelo custo médio ponderado do lote e atribuída à área do colaborador da ficha. Devolução é registrada à parte e não altera retroativamente o gasto histórico.</p>
            <button className="primary-button" disabled={pending || (!!deliveryContext && direction !== "entry" && linkedQuantity <= 0)}>{pending ? "Salvando…" : "Registrar movimentação"}</button>
          </div>
        </form>

        <details>
          <summary>Registrar revisão manual do CA</summary>
          <form action={caAction} className="pgr-form">
            <input type="hidden" name="id" value={item.id} />
            <p className="pgr-wide">Abra a consulta oficial, confira o mesmo CA ({item.ca}) e transcreva os dados. Isso atualiza a data do próximo ciclo sem criar entrada ou saída de estoque.</p>
            <label className="form-field">CA consultado<input name="ca" value={item.ca || ""} readOnly /></label>
            <label className="form-field">Data da consulta manual<input name="checkedOn" type="date" defaultValue={today()} required /></label>
            <label className="form-field">Validade exibida no CAEPI<input name="validUntil" type="date" defaultValue={item.caValidUntil} required /></label>
            <label className="form-field pgr-wide"><input name="manualConfirmed" type="checkbox" required />Confirmei manualmente no CAEPI o número e a validade deste CA.</label>
            <Feedback state={caState} />
            <div className="pgr-form-footer">
              <p>O sistema não acessa o CAEPI. Consulta com mais de 15 dias exige nova revisão; CA vencido permanece sinalizado e sujeito às regras de saída já definidas.</p>
              <button className="primary-button" disabled={caPending}>{caPending ? "Registrando revisão…" : "Salvar revisão manual"}</button>
            </div>
          </form>
        </details>
      </details>;
}

function Item({ item, stockItems, company, canManage, deliveryContext, movementMode }: {
  item: EpiStockItem;
  stockItems: EpiStockItem[];
  company: ClientCompany | undefined;
  canManage: boolean;
  deliveryContext?: StockDeliveryContext;
  movementMode: "exit" | "return";
}) {
  const caExpired = !!item.caValidUntil && item.caValidUntil < today();
  const caStale = caCheckStale(item.caCheckedOn);
  const currentBalance = balance(item);
  const threshold = item.minimumBalance ?? 0;
  const caExpiryNotice = caExpired ? "CA informado vencido" : item.caValidUntil && daysUntil(item.caValidUntil) <= 15 ? `CA vence em ${daysUntil(item.caValidUntil)} dia(s)` : caStale ? "Consulta do CA desatualizada" : "";
  const expiredBatches = batches(item).filter(batch => batch.productValidUntil < today());
  const stockLabel = (currentBalance === 0 ? "Sem estoque" : threshold > 0 && currentBalance <= threshold ? "Abaixo do mínimo" : "Saldo disponível") + (caExpiryNotice ? ` · ${caExpiryNotice}` : "") + (expiredBatches.length ? ` · ${expiredBatches.length} lote(s) de produto vencido(s)` : "");

  return <article id={`stock-item-${item.id}`} className="pgr-card">
    <header>
      <div><h3>{item.code} · {item.name}</h3><p>{company?.tradeName || company?.legalName || "Empresa indisponível"} · {company?.units.find(unit => unit.id === item.unitId)?.name || "Unidade indisponível"}</p></div>
      <span className="period-label">{stockLabel}: {currentBalance} un. · mínimo: {threshold}</span>
    </header>
    <p>Referência: {item.reference} · CA {item.ca || "não informado"} · validade informada no cadastro: {displayDate(item.caValidUntil)}</p>
    <p><strong>Descrição transcrita do CAEPI:</strong> {item.officialDescription || "Não registrada"} · <strong>Proteções transcritas:</strong> {item.approvedProtection || "Não registradas"}</p>
    <p>Consulta manual informada no cadastro em: {displayDate(item.caCheckedOn)} · {caStale && <strong>ALERTA: renove a conferência manual do CA (mais de 15 dias).</strong>} <a href={item.caSource || "https://caepi.trabalho.gov.br/internet/ConsultaCAInternet.aspx"} target="_blank" rel="noreferrer">Abrir consulta CAEPI</a></p>
    <p className="permission-note">O sistema não consulta o CAEPI automaticamente. Para cada entrada ou saída, informe data da consulta e validade transcritas manualmente. Conferência com mais de 15 dias gera alerta; não é verificação oficial.</p>
    <p>Tamanho/modelo: {item.size} · Local: {item.storageLocation}</p>
    {item.caCheckHistory?.length ? <details>
      <summary>Histórico de conferências do CA · {item.caCheckHistory.length}</summary>
      <ol>{[...item.caCheckHistory].reverse().map(check => <li key={check.id}>
        <strong>Validade informada {displayDate(check.validUntil)} · consulta declarada em {displayDate(check.checkedOn)}</strong>
        <p>Registrada por {check.recordedBy} em {new Date(check.recordedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília) · {check.source === "manual_cycle_review" ? "revisão manual do ciclo" : check.source === "stock_movement" ? "movimentação de estoque" : "cadastro inicial"}</p>
        {check.previousCheckedOn && <p>Valor anterior arquivado: validade {displayDate(check.previousValidUntil)} · consulta {displayDate(check.previousCheckedOn)}.</p>}
      </li>)}</ol>
      <p>Histórico de informações transcritas manualmente; não é prova de consulta automatizada.</p>
    </details> : null}
    {batches(item).length > 0 && <details>
      <summary>Lotes com saldo · {batches(item).length}</summary>
      <ul>{batches(item).map(batch => <li key={`${batch.batchCode}-${batch.productValidUntil}`}>Lote {batch.batchCode} · validade do produto {displayDate(batch.productValidUntil)} · {batch.balance} un.</li>)}</ul>
    </details>}
    <StockMovementForm item={item} stockItems={stockItems} canManage={canManage} deliveryContext={deliveryContext} movementMode={movementMode} />
    <details>
      <summary>Histórico · {item.movements.length} movimentações</summary>
      <p>Cadastro: {new Date(item.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília) · Conta: {item.createdBy}</p>
      {!item.movements.length && <p>Nenhuma movimentação.</p>}
      <ol>{item.movements.map(movement => <li key={movement.id}>
        <strong>{movement.direction === "entry" ? "Entrada" : movement.direction === "exit" ? "Saída / entrega" : "Devolução recebida"} · {movement.quantity} un.</strong>
        <p>{movement.reason}</p>
        {movement.caManualChecked && <p>Conferência manual do CAEPI declarada por {movement.actorUserId}: validade do CA informada {displayDate(movement.caCheckedValidUntil)} · consulta em {displayDate(movement.caCheckedOn)} · registrada em {new Date(movement.occurredAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília). O sistema não consultou a fonte.</p>}
        {movement.caPreviousCheckedOn && <p>Valor anterior arquivado no cadastro: validade {displayDate(movement.caPreviousValidUntil)} · consulta em {displayDate(movement.caPreviousCheckedOn)}.</p>}
        {movement.caExpiredExitConfirmed && <p>Confirmação justificada de gestor: {movement.caExpiredExitJustification} · não declara conformidade.</p>}
        {movement.direction === "exit" && <p>Trabalhador: {movement.workerName} · Área: {movement.workerArea || "não informada"} · Ficha/entrega: {movement.deliveryReference}</p>}
        {movement.direction === "return" && <p>Devolvido por: {movement.returnedBy} · Entrega original: {movement.sourceReference} · Condição: {movement.returnCondition === "inspected_reusable" ? "Inspecionado; avaliado como reutilizável" : movement.returnCondition === "quarantine" ? "Em quarentena" : "Não reutilizável / descarte"} · não acrescentado ao saldo</p>}
        {movement.batchCode && <p>Lote {movement.batchCode} · validade do produto {displayDate(movement.productValidUntil)}</p>}
        {movement.unitCostCents !== undefined && <p>Custo unitário registrado: {money(movement.unitCostCents)} · total: {money(movement.unitCostCents * movement.quantity)}</p>}
        {movement.direction === "entry" && <p>Forma de entrada: {sourceLabel(movement.sourceType)} · Referência: {movement.sourceReference} · Fornecedor: {movement.supplier || "—"} · Recebido por: {movement.receivedBy}</p>}
        {(movement.sourceDocumentFileId || movement.invoiceFileId) && <p><a href={`/api/epi/invoices/${item.id}/${movement.id}`}>Baixar documento vinculado: {movement.sourceDocumentFileName || movement.invoiceFileName || "PDF"}</a></p>}
        <p>{new Date(movement.occurredAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília) · Conta: {movement.actorUserId}</p>
      </li>)}</ol>
    </details>
  </article>;
}

export default function StockSection({ items, companies, canManage, deliveryContext, deliveryMissing, movementMode }: {
  items: EpiStockItem[];
  companies: ClientCompany[];
  canManage: boolean;
  deliveryContext?: StockDeliveryContext;
  deliveryMissing: boolean;
  movementMode: "exit" | "return";
}) {
  const [state, action, pending] = useActionState(createStockAction, {});
  const purchasedCents = items.flatMap(item => item.movements).filter(movement => movement.direction === "entry" && (movement.sourceType === "invoice" || movement.sourceType === "purchase_order") && Number.isSafeInteger(movement.unitCostCents)).reduce((sum, movement) => sum + movement.quantity * (movement.unitCostCents ?? 0), 0);
  const stockValueCents = items.reduce((sum, item) => sum + batches(item).reduce((subtotal, batch) => subtotal + batch.balance * (batchUnitCost(item, batch.batchCode, batch.productValidUntil) ?? 0), 0), 0);
  const unvaluedBalance = items.reduce((sum, item) => sum + batches(item).filter(batch => batchUnitCost(item, batch.batchCode, batch.productValidUntil) === undefined).reduce((total, batch) => total + batch.balance, 0), 0);
  const caReviewQueue = items.map(item => ({ item, age: daysSince(item.caCheckedOn) })).filter(({ item, age }) => age === null || age >= 10 || caCheckStale(item.caCheckedOn) || !!item.caValidUntil && daysUntil(item.caValidUntil) <= 15).sort((a, b) => (b.age ?? 100) - (a.age ?? 100));
  const spendByArea = new Map<string, { label: string; quantity: number; costCents: number; missingCost: number }>();
  for (const item of items) for (const movement of item.movements) if (movement.direction === "exit") {
    const company = companies.find(entry => entry.id === item.companyId), unit = company?.units.find(entry => entry.id === item.unitId);
    const label = [company?.tradeName || company?.legalName || "Empresa", unit?.name || "Unidade", movement.workerArea || "Área não informada"].join(" · ");
    const row = spendByArea.get(label) ?? { label, quantity: 0, costCents: 0, missingCost: 0 };
    row.quantity += movement.quantity;
    if (Number.isSafeInteger(movement.unitCostCents)) row.costCents += movement.quantity * (movement.unitCostCents ?? 0);
    else row.missingCost += movement.quantity;
    spendByArea.set(label, row);
  }

  return <section className="panel pgr-section" aria-label="Controle de estoque">
    <div className="document-warning">Controle de estoque demonstrativo. A baixa é lançada pelo gestor com a referência da ficha; o sistema confere trabalhador, unidade, CA, tamanho e quantidade. Devoluções também se vinculam à ficha e têm limite pelo que já foi baixado; não voltam automaticamente ao saldo. Para novas entradas, consulte o CA no portal oficial e informe validade e data da consulta. O sistema bloqueia entrada com CA vencido; o EPI já adquirido deve observar validade e condições de armazenamento do fabricante.</div>
    {deliveryMissing && <p className="document-warning">Não encontrei a ficha vinculada. Volte à lista de entregas e abra a movimentação pelo botão da ficha.</p>}
    {deliveryContext && <p className="permission-note">Ficha {deliveryContext.id} · {deliveryContext.workerName} · {deliveryContext.status === "canceled" ? "cancelada" : "CA e tamanho serão conferidos por item"}. Escolha o item correspondente para registrar saída ou devolução.</p>}
    <section className="company-detail-panel" aria-label="Custos e distribuição por área">
      <h2>Custos de EPI por área</h2>
      <p>Compras diretas, saídas entregues e saldo atual aparecem separados. O custo da entrega é atribuído à área do colaborador e usa o custo médio ponderado do lote.</p>
      <div className="pgr-metrics">
        <article><span>Compras diretas registradas</span><strong>{money(purchasedCents)}</strong></article>
        <article><span>Valor conhecido do estoque atual</span><strong>{money(stockValueCents)}</strong></article>
      </div>
      {unvaluedBalance > 0 && <p className="document-warning">{unvaluedBalance} unidade(s) em estoque sem custo completo registrado; não entraram no valor calculado.</p>}
      {spendByArea.size ? <div className="worker-list">{[...spendByArea.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR")).map(row => <article className="worker-card" key={row.label}>
        <h3>{row.label}</h3><p>{row.quantity} unidade(s) entregues · custo atribuído: {money(row.costCents)}</p>
        {row.missingCost > 0 && <p className="document-warning">{row.missingCost} unidade(s) sem custo histórico informado; não entraram no total.</p>}
      </article>)}</div> : <p className="permission-note">Ainda não há saídas de estoque relacionadas a colaboradores e áreas.</p>}
    </section>
    {canManage ? <details className="aso-new">
      <summary>Cadastrar item de estoque</summary>
      <form action={action} className="pgr-form">
        <label className="form-field pgr-wide">Empresa e unidade
          <select name="scope" required defaultValue=""><option value="">Selecione</option>{companies.filter(company => company.status === "active").flatMap(company => company.units.map(unit => <option key={`${company.id}|${unit.id}`} value={`${company.id}|${unit.id}`}>{company.tradeName || company.legalName} · {unit.name}</option>))}</select>
        </label>
        <label className="form-field">Código do estoque (opcional)<input name="code" maxLength={60} placeholder="Automático: CA-tamanho" /></label>
        <label className="form-field">Nome curto do EPI<input name="name" required maxLength={120} /></label>
        <label className="form-field">Referência do produto<input name="reference" required maxLength={80} /></label>
        <label className="form-field">Número do CA<input name="ca" required inputMode="numeric" pattern="[0-9]{1,8}" maxLength={40} /></label>
        <label className="form-field">Validade do CA consultada<input name="caValidUntil" required type="date" /></label>
        <label className="form-field">Data da consulta oficial<input name="caCheckedOn" required type="date" defaultValue={today()} /></label>
        <p className="permission-note pgr-wide">Abra o <a href="https://caepi.trabalho.gov.br/internet/ConsultaCAInternet.aspx" target="_blank" rel="noreferrer">portal oficial de consulta do MTE</a>. Transcreva exatamente a descrição e as proteções aprovadas. A conferência será registrada com a data informada; o sistema não consulta a base ao vivo.</p>
        <label className="form-field pgr-wide">Descrição oficial no CAEPI<textarea name="officialDescription" maxLength={500} required rows={3} /></label>
        <label className="form-field pgr-wide">Proteções aprovadas no CAEPI<textarea name="approvedProtection" maxLength={500} required rows={3} /></label>
        <label className="form-field">Tamanho ou modelo<input name="size" required maxLength={60} /></label>
        <label className="form-field">Estoque mínimo para alerta<input name="minimumBalance" type="number" min={0} max={1000000} step={1} defaultValue={0} required /></label>
        <label className="form-field pgr-wide">Local de armazenamento<input name="storageLocation" required maxLength={200} /></label>
        <Feedback state={state} />
        <div className="pgr-form-footer">
          <p>O item começa com saldo zero. Cada tamanho/modelo recebe código próprio na unidade. Ex.: CA 32546 + tamanho 41 gera 32546-41. As entradas são controladas por lote e validade do produto.</p>
          <button className="primary-button" disabled={pending}>{pending ? "Cadastrando…" : "Cadastrar item"}</button>
        </div>
      </form>
    </details> : <p className="permission-note">Seu perfil consulta o estoque e o histórico. Movimentação restrita a perfis autorizados.</p>}
    <section className="company-detail-panel" aria-label="Ciclo de revisão manual do CA">
      <h2>Revisão manual de CA · ciclo de 15 dias</h2>
      <p>Fila calculada ao abrir esta tela: alerta preventivo após 10 dias e revisão vencida quando a consulta manual ultrapassa 15 dias. CAs com validade nos próximos 15 dias ou vencida também entram na fila. Não há tarefa em segundo plano nem consulta automática ao MTE/CAEPI.</p>
      {caReviewQueue.length ? <ol>{caReviewQueue.map(({ item, age }) => <li key={item.id}>
        <strong>{item.name} · CA {item.ca || "não informado"} · {item.size}</strong>
        <p>{!item.caCheckedOn ? "Sem data de consulta registrada" : age !== null && age > 15 ? `Revisão vencida · última consulta há ${age} dias` : age !== null && age >= 10 ? `Revisar em até ${15 - age} dia(s) · última consulta há ${age} dias` : "Consulta precisa ser revisada"}{item.caValidUntil && ` · validade informada ${displayDate(item.caValidUntil)}${item.caValidUntil < today() ? " (vencida)" : ""}`}</p>
        <a className="secondary-button" href={`#stock-item-${item.id}`}>Abrir cadastro e revisar</a>
      </li>)}</ol> : <p className="permission-note">Nenhum CA na janela de revisão preventiva ou vencida.</p>}
    </section>
    <h2>Itens cadastrados · {items.length}</h2>
    {!items.length && <p className="permission-note">Nenhum item cadastrado. Cadastre um item fictício e depois registre sua entrada.</p>}
    {items.map(item => <Item key={item.id} item={item} stockItems={items} company={companies.find(company => company.id === item.companyId)} canManage={canManage} deliveryContext={deliveryContext} movementMode={movementMode} />)}
    <ExpiredCaExitConfirmations items={items} />
  </section>;
}
