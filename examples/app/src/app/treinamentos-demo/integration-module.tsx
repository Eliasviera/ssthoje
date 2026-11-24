"use client";

import { useState } from "react";

const questions = [
  {
    prompt: "Você chegou ao almoxarifado e recebeu uma tarefa em uma área que ainda não conhece. O que fazer primeiro?",
    choices: ["Pedir orientação à liderança da área", "Começar seguindo o que os colegas fazem", "Entrar e procurar instruções durante a tarefa"],
    correct: 0,
    feedback: "Antes de começar, confirme com a liderança as orientações e os limites de acesso da área.",
  },
  {
    prompt: "Você viu água no piso de um corredor. Qual é a conduta esperada?",
    choices: ["Aguardar até o fim do turno", "Avisar a liderança pelo canal indicado para que a situação seja tratada", "Passar pelo local e comentar depois com um colega"],
    correct: 1,
    feedback: "Avise a liderança pelo canal indicado, informe o local e evite a passagem pela área afetada.",
  },
  {
    prompt: "Antes de iniciar o turno, quais referências você precisa conhecer?",
    choices: ["Somente o horário do intervalo", "Somente o caminho até o vestiário", "A liderança de referência, as áreas autorizadas e o canal para dúvidas e ocorrências"],
    correct: 2,
    feedback: "Saber onde você pode circular e a quem recorrer ajuda a agir com segurança desde o primeiro dia.",
  },
];

export default function IntegrationModule() {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [score, setScore] = useState<number | null>(null);
  const [nextModule, setNextModule] = useState(false);
  const passed = score !== null && score >= 2;

  return <section className="panel training-modules" aria-labelledby="integration-module-title">
    <div>
      <h2 id="integration-module-title">Módulo 1 · Estrutura e Vivência</h2>
      <p>Piloto de integração na unidade fictícia Horizonte. O resultado fica nesta tela durante a visita.</p>
    </div>
    <video className="w-full max-w-3xl rounded-xl bg-[#122f28]" controls playsInline preload="metadata" aria-label="Vídeo da aula Estrutura e Vivência">
      <source src="/treinamentos-demo/estrutura-e-vivencia.mp4" type="video/mp4" />
      <track kind="captions" src="/treinamentos-demo/estrutura-e-vivencia.pt-BR.vtt" srcLang="pt-BR" label="Português (Brasil)" default />
    </video>
    <details className="max-w-3xl text-sm leading-relaxed">
      <summary className="cursor-pointer font-semibold">Ler transcrição da aula</summary>
      <p><strong>Chegada.</strong> Bem-vindo à unidade fictícia Horizonte. No primeiro dia, apresente-se na recepção e confirme quem é sua liderança de referência. Antes de seguir para o posto, peça a orientação inicial e confirme onde você pode circular.</p>
      <p><strong>Rotina.</strong> Conheça os locais de apoio, como vestiário, refeitório e área de descanso. Se receber uma tarefa em outro setor, confirme as orientações daquele local e pergunte quem acompanha o trabalho. Em caso de dúvida, converse com sua liderança antes de começar.</p>
      <p><strong>Comunicação.</strong> Imagine que você viu água no piso do corredor. Evite passar pelo trecho e avise sua liderança pelo canal indicado. Descreva o local e o que observou. Para encerrar, confirme a quem recorrer para tirar dúvidas e comunicar ocorrências. Agora responda às três perguntas do módulo.</p>
    </details>
    <form onSubmit={event => {
      event.preventDefault();
      if (score !== null || Object.keys(answers).length !== questions.length) return;
      setScore(questions.filter((question, index) => answers[index] === question.correct).length);
    }}>
      <ol className="training-question-list">
        {questions.map((question, index) => <li key={question.prompt}>
          <fieldset disabled={score !== null}>
            <legend>{index + 1}. {question.prompt}</legend>
            {question.choices.map((choice, option) => <label className="training-choice" key={choice}>
              <input type="radio" name={`integration-question-${index}`} checked={answers[index] === option}
                onChange={() => setAnswers(current => ({ ...current, [index]: option }))} />
              <span>{choice}</span>
            </label>)}
          </fieldset>
          {score !== null && <p>{answers[index] === question.correct ? "Correta." : "Incorreta."} {question.feedback}</p>}
        </li>)}
      </ol>
      {score === null && <button className="primary-button" type="submit" disabled={Object.keys(answers).length !== questions.length}>Conferir respostas</button>}
    </form>
    {score !== null && <p role="status"><strong>{score} de {questions.length} acertos.</strong> {passed ? "Módulo 2 liberado." : "Revise a aula e tente novamente. São necessários 2 acertos."}</p>}
    {score !== null && !passed && <button className="secondary-button" type="button" onClick={() => { setAnswers({}); setScore(null); }}>Tentar novamente</button>}
    <div>
      <button className="primary-button" type="button" disabled={!passed} aria-expanded={nextModule} aria-controls="integration-next-module" onClick={() => setNextModule(current => !current)}>{nextModule ? "Recolher Módulo 2" : "Abrir Módulo 2"}</button>
      <div id="integration-next-module" hidden={!nextModule}><h3>Módulo 2 · Circulação e Sinalização</h3><p>Conteúdo em preparação.</p></div>
    </div>
  </section>;
}
