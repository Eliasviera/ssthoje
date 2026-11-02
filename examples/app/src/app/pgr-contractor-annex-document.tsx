import { ANNEX_FIELDS, type ContractorAnnex } from "@/lib/pgr-contractor-annex";
export function AnnexContent({ record }: { record: ContractorAnnex }) {
  return <dl>{Object.entries(ANNEX_FIELDS).map(([key, label]) => record.fields[key as keyof typeof ANNEX_FIELDS] ? <div key={key}><dt>{label}</dt><dd style={{ whiteSpace: "pre-wrap" }}>{record.fields[key as keyof typeof ANNEX_FIELDS]}</dd></div> : null)}
    <div><dt>Contratada e participantes informados</dt><dd>{record.fields.contractorType.toUpperCase()} · {({ owner_only: "Titular sozinho", partners_only: "Somente sócios", with_workers: "Com empregados", unknown: "A confirmar" })[record.fields.participants]}</dd></div>
    <div><dt>Cobertura dos riscos declarada pela equipe</dt><dd>{({ covered: "Contemplados no PGR, conforme referência registrada", not_covered: "Não contemplados no PGR base", unknown: "Ainda não avaliada" })[record.fields.coverage]}</dd></div>
  </dl>;
}
export default function PgrContractorAnnexDocument({ records }: { records: ContractorAnnex[] }) {
  const included = records.filter(record => record.status === "included");
  const closed = records.filter(record => record.status === "closed");
  return <section aria-label="Anexos de serviços contratados no PGR"><h3>Anexos · serviços contratados e riscos de interferência</h3>
    <p>Anexos vinculados a esta origem do PGR e à unidade. A inclusão registra a revisão declarada pela conta autenticada; não comprova qualificação, conformidade ou liberação do serviço.</p>
    {!included.length ? <p>Nenhum anexo incluído no documento de trabalho.</p> : included.map(record => <article className="pgr-card" key={record.id}><h4>{record.fields.title} · revisão {record.revision}</h4><p>Referência do anexo: {record.id} · inclusão registrada em {new Date(record.recordedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p><AnnexContent record={record}/></article>)}
    {records.some(record => record.status === "draft") && <p>Há rascunhos de anexos aguardando revisão. Seu conteúdo ainda não integra esta prévia.</p>}
    {closed.length > 0 && <section><h4>Índice histórico · atividades encerradas</h4><ul>{closed.map(record => <li key={record.id}>{record.fields.title} · anexo {record.id} · término informado: {record.closure?.endedOn}.<p style={{ whiteSpace: "pre-wrap" }}>Pendências e encaminhamentos registrados: {record.closure?.remainingActions}</p></li>)}</ul><p>O encerramento retira o anexo da relação atual acima, preservando as versões e a rastreabilidade. Ações remanescentes não são dadas como resolvidas automaticamente; a equipe deve acompanhar os encaminhamentos registrados.</p></section>}
  </section>;
}
