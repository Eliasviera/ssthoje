"use client";

import { useState } from "react";

type Tab = "visao-geral" | "nr-01";

export default function TrainingTabs({ planName, status, included, additionalEnabled }: { planName: string; status: string; included: boolean; additionalEnabled: boolean }) {
  const [tab, setTab] = useState<Tab>("visao-geral");

  return <>
    <nav className="training-tabs" role="tablist" aria-label="Seções de treinamentos">
      <button type="button" role="tab" id="training-tab-overview" aria-selected={tab === "visao-geral"} aria-controls="training-panel-overview" onClick={() => setTab("visao-geral")}>Visão geral</button>
      <button type="button" role="tab" id="training-tab-nr01" aria-selected={tab === "nr-01"} aria-controls="training-panel-nr01" onClick={() => setTab("nr-01")}>NR-01</button>
    </nav>

    {tab === "visao-geral" ? <section className="panel pgr-section training-tab-panel" role="tabpanel" id="training-panel-overview" aria-labelledby="training-tab-overview">
      <div className="panel-heading"><div><h2>Status da sua conta</h2><p>{planName} · {status}</p></div><span className="period-label">{status}</span></div>
      <p>O módulo de treinamentos tem contratação adicional, com valor diferenciado conforme o escopo. O preço ainda não foi configurado nesta demonstração e não há cobrança automática.</p>
      <div className="document-warning">O LMS está em preparação. Esta tela não libera cursos, avaliações reais, certificados ou assinaturas válidas. Habilitar o status comercial não libera o uso operacional.</div>
      <h3>O que o módulo está sendo preparado para oferecer</h3>
      <ul><li>Catálogo de cursos e conteúdo didático.</li><li>Turmas presenciais e avaliações pelo aplicativo.</li><li>Assinaturas de presença e do instrutor ligadas ao resultado.</li><li>Certificado somente após aprovação na avaliação e validações exigidas.</li></ul>
      <section className="training-cloud-card" aria-labelledby="training-governance-title"><h3 id="training-governance-title">Responsabilidade e revisão dos cursos</h3><p>O responsável geral da plataforma coordena o catálogo, os critérios de publicação e o histórico das versões. Cada curso pode ter especialistas externos e profissionais da própria empresa cliente designados para elaborar ou revisar o conteúdo e, quando aplicável, assumir e assinar a responsabilidade técnica específica daquele curso.</p><dl><div><dt>Responsável geral</dt><dd>Você · governança e aprovação de publicação</dd></div><div><dt>Especialistas parceiros</dt><dd>Por curso e área: SST, saúde, engenharia elétrica, máquinas e equipamentos, bombeiros civis e outras especialidades</dd></div><div><dt>Profissional da empresa cliente</dt><dd>Campo próprio para identificar, registrar a revisão e coletar a assinatura do responsável indicado pela empresa</dd></div><div><dt>Publicação</dt><dd>Após revisão registrada, aprovação do responsável geral e assinaturas exigidas para aquele conteúdo</dd></div></dl><p className="permission-note">Cada assinatura fica vinculada à pessoa, empresa, papel, escopo e versão revisada. A assinatura do profissional da empresa registra sua participação/validação interna e não substitui responsabilidade técnica legal que caiba a outro profissional. Habilitação, registro profissional e documento técnico aplicável devem ser conferidos antes da publicação.</p></section>
      <section className="training-cloud-card" aria-labelledby="training-delivery-title"><h3 id="training-delivery-title">Realização do treinamento</h3><p>Na criação de cada turma, a plataforma oferecerá a escolha da modalidade e de quem conduzirá a realização. Esse registro é separado da autoria, revisão do conteúdo e responsabilidade técnica do curso.</p><dl><div><dt>Modalidade</dt><dd>Presencial · Semipresencial · EaD</dd></div><div><dt>Responsável pela realização</dt><dd>Instrutor/parceiro da plataforma · Profissional ou instrutor local da empresa</dd></div><div><dt>Registro da turma</dt><dd>Identificação do instrutor, empresa/unidade, datas, carga horária, participantes, presenças, avaliações e assinaturas aplicáveis</dd></div></dl><p className="permission-note">Na modalidade EaD ou semipresencial, o curso deve cumprir os requisitos normativos aplicáveis à capacitação. A opção selecionada não substitui a verificação de habilitações nem dos requisitos específicos de cada treinamento.</p></section>
      {!included && !additionalEnabled && <details className="aso-new"><summary>Solicitar contratação</summary><p>Converse com a administradora da sua conta para solicitar uma proposta. O canal comercial ainda não está integrado nesta demonstração; abrir esta opção não envia um pedido nem altera o plano.</p></details>}
      {additionalEnabled && !included && <p className="permission-note">O adicional está marcado como contratado no painel da plataforma. A operação do LMS segue bloqueada até a implantação do módulo.</p>}
    </section> : <section className="panel pgr-section training-tab-panel" role="tabpanel" id="training-panel-nr01" aria-labelledby="training-tab-nr01">
      <div className="panel-heading"><div><p className="eyebrow">CURSO EM PREPARAÇÃO</p><h2>NR-01 · Disposições Gerais e GRO</h2><p>Área preparada para o material didático hospedado na Magalu Cloud.</p></div><span className="period-label">Não publicado</span></div>
      <div className="document-warning">Este roteiro é apenas a estrutura do curso. Não é treinamento concluído, não registra presença ou nota e não emite certificado. A versão final deverá ser revisada pelo especialista designado para NR-01 e aprovada pelo responsável geral, com os registros de responsabilidade aplicáveis.</div>
      <h3>Estrutura curricular inicial</h3>
      <ol className="training-nr-outline">
        <li><strong>Objetivo, aplicação e termos da NR-01</strong><span>Capítulos 1.1, 1.2 e Anexo I.</span></li>
        <li><strong>Direitos e deveres</strong><span>Responsabilidades da organização e dos trabalhadores, incluindo comunicação e direito de recusa diante de risco grave e iminente.</span></li>
        <li><strong>Gerenciamento de Riscos Ocupacionais</strong><span>GRO, identificação de perigos, avaliação e controle dos riscos, PGR, participação dos trabalhadores e comunicação das medidas.</span></li>
        <li><strong>Registros e capacitação em SST</strong><span>Documentação digital, requisitos de treinamentos e critérios para registros e certificados.</span></li>
        <li><strong>Modalidade EaD ou semipresencial</strong><span>Requisitos pedagógicos, operacionais, tecnológicos e administrativos do Anexo II, quando a modalidade for aplicável.</span></li>
      </ol>
      <section className="training-cloud-card" aria-labelledby="training-cloud-title"><h3 id="training-cloud-title">Acervo em PDF na nuvem</h3><p>Para reduzir custo e tempo de carregamento, mantenha PDFs otimizados para tela, comprima imagens e publique somente versões aprovadas. O app deve carregar cada arquivo quando o aluno abrir o módulo, sem baixar o curso inteiro de uma vez.</p><dl><div><dt>Armazenamento</dt><dd>Magalu Cloud Object Storage · aguardando configuração</dd></div><div><dt>Materiais esperados</dt><dd>Apresentação, apostila leve, materiais de apoio e avaliações</dd></div><div><dt>Acesso</dt><dd>Bucket privado e leitura pelo servidor; chaves nunca ficam no navegador</dd></div></dl><p className="permission-note">Estrutura sugerida para os objetos: <code>nr-01/manifest.json</code>, <code>nr-01/modulos/</code> e <code>nr-01/apoio/</code>. Mantenha o acervo didático sem dados pessoais de trabalhadores.</p></section>
      <p className="permission-note">Referência normativa: consulte sempre a versão vigente da NR-1 publicada pelo MTE; o capítulo 1.5 atualizado passou a vigorar em 26/05/2026.</p>
      <a className="download-link" href="https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-paritaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-1" target="_blank" rel="noreferrer">Consultar texto vigente e materiais oficiais da NR-1 no MTE</a>
    </section>}
  </>;
}
