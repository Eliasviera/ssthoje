"use client";

import Image from "next/image";
import { useRef, useState, type FormEvent, type PointerEvent } from "react";
import { createTrainingDemoCertificatePreview, getTrainingDemoCertificateGate, signaturesForTrainingDemoCertificate, type TrainingDemoSignatures } from "@/lib/training-demo-workflow";

type Question = { id: string; prompt: string; choices: string[]; answer: string };
type Signatures = TrainingDemoSignatures;
type Attempt = { questions: Question[]; answers: Record<string, string>; submitted: boolean; startedAt: string; resultAt?: string; modality: "app" | "presencial"; participant: string; facilitator: string; location: string; attendanceSignatures?: Signatures; certificateSignatures?: Signatures; certificateFinalized?: boolean };

const questionBank: Question[] = [
  { id: "q1", prompt: "Na dinâmica fictícia, apareceu um cartão amarelo no painel. O que o curso de demonstração orienta?", choices: ["Marcar como atenção e chamar o facilitador", "Ignorar o cartão", "Apagar o registro anterior"], answer: "Marcar como atenção e chamar o facilitador" },
  { id: "q2", prompt: "Um dado obrigatório do exercício não foi informado. Qual é a resposta esperada neste cenário?", choices: ["Preencher qualquer valor para continuar", "Registrar como pendente, sem presumir a resposta", "Copiar o dado de outra pessoa"], answer: "Registrar como pendente, sem presumir a resposta" },
  { id: "q3", prompt: "Uma tela de demonstração mostra uma versão antiga do material. O que fazer?", choices: ["Continuar e misturar as versões", "Registrar a divergência e consultar o facilitador", "Alterar o arquivo publicado"], answer: "Registrar a divergência e consultar o facilitador" },
  { id: "q4", prompt: "Para encerrar a atividade fictícia, qual registro deve ficar associado ao resultado?", choices: ["Participante, modalidade e versão do exercício", "Somente o total de acertos", "Nenhum registro"], answer: "Participante, modalidade e versão do exercício" },
  { id: "q5", prompt: "O resultado automático da tela de teste deve ser entendido como:", choices: ["Certificado profissional válido", "Resultado ilustrativo que precisa de revisão", "Liberação para qualquer atividade"], answer: "Resultado ilustrativo que precisa de revisão" },
];

const modules = [
  { id: "m1", title: "Módulo 1 · Sinalização do cenário", body: "Nesta dinâmica original e fictícia, os cartões do painel são exemplos de interface. Cartão amarelo representa uma situação para conferir com o facilitador da simulação." },
  { id: "m2", title: "Módulo 2 · Registro e revisão", body: "Quando faltar informação ou houver divergência de versão, a dinâmica orienta registrar a pendência e pedir revisão, sem presumir a resposta." },
];
const PASS_SCORE = 2;

function shuffled<T>(values: T[]): T[] {
  const output = [...values];
  for (let i = output.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

function newAttempt(modality: Attempt["modality"], participant: string, facilitator: string): Attempt {
  const questions = shuffled(questionBank).slice(0, 3).map(question => ({ ...question, choices: shuffled(question.choices) }));
  return { questions, answers: {}, submitted: false, startedAt: new Date().toISOString(), modality, participant, facilitator, location: modality === "presencial" ? "Sala de demonstração fictícia" : "Não aplicável" };
}

function scoreAttempt(attempt: Attempt) {
  return attempt.questions.reduce((score, question) => score + (attempt.answers[question.id] === question.answer ? 1 : 0), 0);
}

function SignatureCapture({ label, value, onSave }: { label: string; value?: string; onSave: (signature?: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
  }
  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current, position = point(event), context = canvas?.getContext("2d");
    if (!canvas || !context || !position) return;
    canvas.setPointerCapture(event.pointerId); drawingRef.current = true; context.beginPath(); context.moveTo(position.x, position.y); context.strokeStyle = "#214c39"; context.lineWidth = 2.4; context.lineCap = "round"; context.lineJoin = "round";
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext("2d"), position = point(event);
    if (!context || !position) return;
    context.lineTo(position.x, position.y); context.stroke();
  }
  function stop() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas) onSave(canvas.toDataURL("image/png"));
  }
  function clear() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); onSave(undefined);
  }
  return <div className="training-signature-capture"><strong>{label}</strong><canvas ref={canvasRef} width={560} height={140} aria-label={`Desenhe a assinatura de ${label}`} onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}/><div className="training-signature-controls"><small>{value ? "Assinatura simples capturada nesta demonstração" : "Desenhe acima com o dedo, caneta ou mouse"}</small><button type="button" className="secondary-button" onClick={clear}>{value ? "Refazer" : "Limpar"}</button></div></div>;
}

function SignatureImage({ label, value }: { label: string; value?: string }) {
  return <div className="training-signature-capture"><strong>{label}</strong>{value ? <Image className="training-signature-image" src={value} width={560} height={140} unoptimized alt={`Assinatura demonstrativa de ${label}`}/> : <p className="permission-note">Assinatura não registrada nesta demonstração.</p>}</div>;
}

export default function TrainingAssessmentDemo({ participantLabel }: { participantLabel: string }) {
  const [mode, setMode] = useState<"app" | "presencial">("app");
  const [readModules, setReadModules] = useState<string[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [inPersonParticipant, setInPersonParticipant] = useState("Colaborador fictício 01");
  const [facilitator, setFacilitator] = useState("Instrutor fictício 01");
  const [contentDelivered, setContentDelivered] = useState(false);
  const [attendanceSignatures, setAttendanceSignatures] = useState<Signatures>({});
  const [digitalCertificateSignatures, setDigitalCertificateSignatures] = useState<Signatures>({});

  function begin(modality: Attempt["modality"]) {
    const participant = modality === "app" ? participantLabel : inPersonParticipant;
    const created = newAttempt(modality, participant, modality === "app" ? "Conta individual da demonstração" : facilitator);
    if (modality === "presencial") created.attendanceSignatures = { ...attendanceSignatures };
    else setDigitalCertificateSignatures({});
    setAttempt(created);
  }

  function choose(questionId: string, choice: string) {
    setAttempt(current => current && !current.submitted ? { ...current, answers: { ...current.answers, [questionId]: choice } } : current);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!attempt || attempt.questions.some(question => !attempt.answers[question.id])) return;
    setAttempt({ ...attempt, submitted: true, resultAt: new Date().toISOString() });
  }

  const score = attempt ? scoreAttempt(attempt) : 0;
  const satisfactory = Boolean(attempt?.submitted && score >= PASS_SCORE);
  const finalSignatures = attempt ? signaturesForTrainingDemoCertificate(attempt.modality, attempt.attendanceSignatures ?? {}, digitalCertificateSignatures) : {};
  const gateStatus = getTrainingDemoCertificateGate({ submitted: Boolean(attempt?.submitted), score, requiredScore: PASS_SCORE, signatures: finalSignatures });

  function finalizeCertificate() {
    if (!attempt) return;
    try {
      const preview = createTrainingDemoCertificatePreview({ submitted: attempt.submitted, score, requiredScore: PASS_SCORE, signatures: finalSignatures });
      setAttempt({ ...attempt, certificateSignatures: preview.signatures, certificateFinalized: true });
    } catch {
      return;
    }
  }

  return <div className="training-demo">
    <div className="document-warning" role="note"><strong>Simulação sem valor de capacitação.</strong> Curso, conteúdo, instrutor, participante, questões, critério, assinaturas e resultados são fictícios. Pode mostrar uma prévia, mas não emite certificado válido nem comprova treinamento de NR.</div>
    <section className="panel training-course-card"><div><p className="eyebrow">CURSO ORIGINAL DE DEMONSTRAÇÃO · VERSÃO 1</p><h2>Rotina da sala de demonstração</h2><p>Exercício de navegação e registro; não é conteúdo técnico de SST nem curso regulamentar.</p></div><dl><div><dt>Módulos</dt><dd>2 · leitura obrigatória neste protótipo</dd></div><div><dt>Avaliação</dt><dd>3 questões sorteadas de um banco fictício</dd></div><div><dt>Critério deste exemplo</dt><dd>{PASS_SCORE}/3 · parâmetro demonstrativo, sem valor normativo</dd></div></dl></section>

    <div className="passport-tabs" role="group" aria-label="Modalidade do ensaio"><button className={mode === "app" ? "primary-button" : "secondary-button"} type="button" onClick={() => { setMode("app"); setAttempt(null); setDigitalCertificateSignatures({}); setAttendanceSignatures({}); setContentDelivered(false); }}>Pelo app</button><button className={mode === "presencial" ? "primary-button" : "secondary-button"} type="button" onClick={() => { setMode("presencial"); setAttempt(null); setDigitalCertificateSignatures({}); setAttendanceSignatures({}); setContentDelivered(false); }}>Presencial</button></div>

    {mode === "app" && <section className="panel training-modules"><div><h2>Conteúdo didático fictício</h2><p>Leia e marque os módulos em sequência antes de iniciar a avaliação. O sistema não mede tempo de tela nem usa isso como prova de aprendizagem.</p></div>{modules.map((module,index) => <article className="training-module" key={module.id}><div><h3>{module.title}</h3><p>{module.body}</p></div><button type="button" className={readModules.includes(module.id) ? "secondary-button" : "primary-button"} disabled={index > 0 && !readModules.includes(modules[index-1].id)} onClick={() => setReadModules(current => current.includes(module.id) ? current : [...current, module.id])}>{readModules.includes(module.id) ? "Módulo percorrido" : "Marcar módulo percorrido"}</button></article>)}{!attempt && <button className="primary-button" type="button" disabled={readModules.length !== modules.length} onClick={() => begin("app")}>Iniciar avaliação pelo app</button>}</section>}

    {mode === "presencial" && <section className="panel training-modules"><div><h2>Lista de presença e aplicação presencial</h2><p>Turma demonstrativa com um participante. Colete as assinaturas simples antes da avaliação; elas serão vinculadas à prévia do certificado somente se a nota for satisfatória.</p></div><div className="training-presential-fields"><label className="form-field">Participante fictício<select disabled={Boolean(attempt)} value={inPersonParticipant} onChange={event => { setInPersonParticipant(event.target.value); setAttendanceSignatures({}); }}><option>Colaborador fictício 01</option><option>Colaboradora fictícia 02</option><option>Participante fictício 03</option></select></label><label className="form-field">Facilitador / instrutor fictício<select disabled={Boolean(attempt)} value={facilitator} onChange={event => { setFacilitator(event.target.value); setAttendanceSignatures({}); }}><option>Instrutor fictício 01</option><option>Instrutora fictícia 02</option></select></label></div><label className="training-delivery-confirm"><input type="checkbox" checked={contentDelivered} disabled={Boolean(attempt)} onChange={event => setContentDelivered(event.target.checked)}/><span>Confirmo que o conteúdo fictício foi ministrado nesta simulação presencial.</span></label>{!attempt && <div className="training-signature-grid"><SignatureCapture label={`Presença · ${inPersonParticipant}`} value={attendanceSignatures.participant} onSave={signature => setAttendanceSignatures(current => ({ ...current, participant: signature }))}/><SignatureCapture label={`Instrutor · ${facilitator}`} value={attendanceSignatures.instructor} onSave={signature => setAttendanceSignatures(current => ({ ...current, instructor: signature }))}/></div>}{attempt && <div className="training-signature-grid"><SignatureImage label={`Presença · ${attempt.participant}`} value={attempt.attendanceSignatures?.participant}/><SignatureImage label={`Instrutor · ${attempt.facilitator}`} value={attempt.attendanceSignatures?.instructor}/></div>}<div className="permission-note">Assinaturas desenhadas são simples e fictícias; não comprovam identidade nem qualificação. No fluxo real, a assinatura de presença do trabalhador e a do instrutor serão anexadas ao certificado individual.</div>{!attempt && <button type="button" className="primary-button" disabled={!contentDelivered || !attendanceSignatures.participant || !attendanceSignatures.instructor} onClick={() => begin("presencial")}>Iniciar avaliação presencial fictícia</button>}</section>}

    {attempt && <section className="panel training-attempt"><div className="training-attempt-heading"><div><p className="eyebrow">TENTATIVA FICTÍCIA · {attempt.modality === "app" ? "PELO APP" : "PRESENCIAL"}</p><h2>Avaliação do curso</h2><p>Participante: {attempt.participant} · Aplicador: {attempt.facilitator}</p></div><button type="button" className="secondary-button" onClick={() => begin(attempt.modality)}>Reiniciar avaliação</button></div>
      {!attempt.submitted && <div className="passport-status passport-status-unknown" role="status"><span aria-hidden="true"/><div><strong>Nota pendente</strong><small>O processo só poderá avançar após registrar e conferir o resultado.</small></div></div>}
      <form onSubmit={submit}><ol className="training-question-list">{attempt.questions.map((question, index) => <li key={question.id}><fieldset disabled={attempt.submitted}><legend>{index + 1}. {question.prompt}</legend>{question.choices.map(choice => <label className="training-choice" key={choice}><input type="radio" name={question.id} checked={attempt.answers[question.id] === choice} onChange={() => choose(question.id, choice)}/><span>{choice}</span></label>)}</fieldset></li>)}</ol>{!attempt.submitted ? <button className="primary-button" type="submit" disabled={attempt.questions.some(question => !attempt.answers[question.id])}>Registrar resultado desta simulação</button> : <div className={`passport-status ${satisfactory ? "passport-status-ok" : "passport-status-blocked"}`} role="status"><span aria-hidden="true"/><div><strong>Resultado demonstrativo: {satisfactory ? "Satisfatório" : "Insatisfatório"} · {score}/3</strong><small>{satisfactory ? "Nota registrada; o processo ainda aguarda as assinaturas necessárias para finalizar a prévia." : "Processo não finalizado. Nota abaixo do critério; certificado indisponível nesta tentativa."}</small></div></div>}</form>
      {attempt.submitted && satisfactory && !attempt.certificateFinalized && <section className="training-signoff"><h3>Assinaturas vinculadas ao certificado</h3>{attempt.modality === "presencial" ? <><p>As assinaturas já coletadas na lista de presença serão anexadas a esta prévia do certificado.</p><div className="training-signature-grid"><SignatureImage label={`Aluno · ${attempt.participant}`} value={attempt.attendanceSignatures?.participant}/><SignatureImage label={`Instrutor · ${attempt.facilitator}`} value={attempt.attendanceSignatures?.instructor}/></div></> : <><p>Registre as assinaturas simples demonstrativas do aluno e do instrutor para finalizar.</p><div className="training-signature-grid"><SignatureCapture label={`Aluno · ${attempt.participant}`} value={digitalCertificateSignatures.participant} onSave={signature => setDigitalCertificateSignatures(current => ({ ...current, participant: signature }))}/><SignatureCapture label={`Instrutor · ${attempt.facilitator}`} value={digitalCertificateSignatures.instructor} onSave={signature => setDigitalCertificateSignatures(current => ({ ...current, instructor: signature }))}/></div></>}<button type="button" className="primary-button" disabled={gateStatus !== "ready"} onClick={finalizeCertificate}>Finalizar prévia do certificado</button></section>}
      {attempt.submitted && !satisfactory && <div className="training-certificate-block" role="status"><strong>Conclusão pendente</strong><p>A nota insuficiente impede finalizar o processo e emitir a prévia do certificado. Refaça a avaliação demonstrativa.</p></div>}
      {attempt.certificateFinalized && <article className="training-certificate-preview"><p className="eyebrow">PRÉVIA FICTÍCIA · SEM VALIDADE</p><h3>Certificado demonstrativo de participação</h3><p>{attempt.participant} · Rotina da sala de demonstração · Versão 1</p><p>Resultado satisfatório: {score}/3 · Modalidade: {attempt.modality === "app" ? "App (simulada)" : "Presencial (simulada)"}</p><div className="training-signature-grid"><SignatureImage label={`Assinatura do aluno · ${attempt.participant}`} value={attempt.certificateSignatures?.participant}/><SignatureImage label={`Assinatura do instrutor · ${attempt.facilitator}`} value={attempt.certificateSignatures?.instructor}/></div><p className="permission-note">Esta prévia não é salva nem é certificado válido. Em produção, o documento manterá a assinatura do aluno e do instrutor vinculadas à turma e à avaliação aprovada. Se o responsável técnico for outra pessoa, sua assinatura também deverá ser registrada conforme o curso.</p></article>}
      {attempt.submitted && <details className="training-trace"><summary>Ver rastreabilidade desta tentativa</summary><dl><div><dt>Versão do curso</dt><dd>Rotina da sala de demonstração · v1</dd></div><div><dt>Modalidade</dt><dd>{attempt.modality === "app" ? "App (simulada)" : "Presencial (simulada)"}</dd></div><div><dt>Participante / aplicador</dt><dd>{attempt.participant} / {attempt.facilitator}</dd></div><div><dt>Data / local do ensaio</dt><dd>{new Date(attempt.startedAt).toLocaleString("pt-BR")} / {attempt.location}</dd></div><div><dt>Início / envio</dt><dd>{new Date(attempt.startedAt).toLocaleString("pt-BR")} / {new Date(attempt.resultAt ?? "").toLocaleString("pt-BR")}</dd></div><div><dt>Questões e respostas</dt><dd>{attempt.questions.map(question => `${question.id}: ${attempt.answers[question.id] === question.answer ? "correta" : "incorreta"}`).join(" · ")}</dd></div><div><dt>Assinaturas</dt><dd>{attempt.modality === "presencial" ? "Lista de presença capturada; reutilizada somente na prévia aprovada" : attempt.certificateFinalized ? "Aluno e instrutor capturados na prévia" : "Pendentes ou não aplicáveis"}</dd></div><div><dt>Armazenamento</dt><dd>Somente na memória desta tela; ao sair, o registro desaparece.</dd></div></dl></details>}
    </section>}
  </div>;
}
