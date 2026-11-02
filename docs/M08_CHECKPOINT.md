# M08 — Rascunho assistido de PGR

- **Estado:** aprovada pelo usuário em 2026-10-08 após conferência da demonstração. A pendência de conferência manual do M07 permanece registrada separadamente.
- **Escopo desta etapa:** rascunho local ligado a empresa/unidade, descrição das atividades, riscos informados pela equipe, plano de ação, revisão humana e exportação para conferência.
- **Acesso:** administradora e perfil SST podem elaborar rascunhos; perfis com permissão de revisão podem registrar a revisão interna. A autorização do sistema não comprova habilitação profissional.
- **Salvaguardas:** nenhuma regra ou conclusão normativa pré-preenchida; o sistema não declara conformidade, não assina e não substitui responsáveis habilitados. Aprovação registrada é uma etapa interna de revisão, sem alegação de validade legal.
- **Persistência:** arquivo local no computador; usar somente dados fictícios até existir armazenamento protegido.

## Critério de aceite

1. Criar rascunho de PGR vinculado a empresa e unidade ativas da própria consultoria.
2. Registrar atividade, riscos descritos pela equipe e ações com responsáveis definidos por humanos.
3. Atualizar o rascunho e confirmar snapshot numerado da versão anterior; submeter à revisão e registrar o perfil que revisou.
4. Exportar uma cópia legível para revisão, claramente identificada como rascunho/demonstração.
5. Impedir acesso entre consultorias e respeitar permissões no servidor.
6. Executar lint, typecheck, build e revisão manual antes de declarar M08 concluída.

## Limites

- Não gerar avaliação automática de risco, recomendações legais ou prazos padrão.
- Sem assinatura eletrônica, integração externa ou uso de dados reais.
- M07 ainda aguarda conferência manual; essa pendência permanece registrada.

## QA e conferência manual

- `pnpm lint`: passou.
- `pnpm typecheck`: passou.
- `pnpm build`: passou em diretório temporário isolado; o servidor local permaneceu em execução.
- Testes automatizados e inspeção visual no navegador: não executados.

1. Abra **Documentos** e crie um rascunho fictício ligado a uma unidade ativa.
2. Preencha atividades, riscos observados e plano de ação; salve, atualize o rascunho e abra **Revisões anteriores** para conferir a versão preservada.
3. Envie para revisão; entre com o perfil SST configurado localmente e registre a revisão interna.
4. Use **Imprimir / salvar cópia** e confira se a identificação de demonstração aparece na cópia.
5. Entre na segunda consultoria fictícia; os rascunhos da primeira não devem aparecer.

As contas estão configuradas por variáveis `SST_DEMO_*` no `.env.local`; use somente credenciais fictícias. A aprovação interna do sistema não valida habilitação profissional nem substitui assinatura ou revisão técnica.

**Decisão necessária:** confira a criação, edição, revisão, cópia para impressão e isolamento entre consultorias. Aprove M08 ou indique ajustes.

## Retomada e verificação — 2026-10-08

- Corrigido teste de navegação: o perfil SST pode consultar Empresas, conforme M04, mas continua sem permissão para gerenciar cadastros.
- Testes de auditoria agora usam uma pasta temporária própria, sem acrescentar eventos ao arquivo da aplicação. As execuções iniciais desta retomada, antes da correção, acrescentaram eventos fictícios de teste à auditoria local; o histórico foi preservado.
- Revisões anteriores do PGR agora permitem expandir atividades, riscos e plano de ação completos.
- `pnpm test`: 9 testes passaram; cobrem permissões e isolamento da auditoria, não o ciclo completo do PGR.
- `pnpm lint`, `pnpm typecheck` e `pnpm build`: passaram.
- Conferência no navegador: sessão da administradora e navegação até Documentos/PGR funcionaram. A consultoria estava sem empresas e sem rascunhos; criação, edição, revisão, impressão e conteúdo de versões anteriores ainda precisam ser conferidos com dados fictícios.
- Aplicação disponível em http://127.0.0.1:3000. Para iniciar quando necessário: `pnpm dev --hostname 127.0.0.1` em `examples/app`.
- M08 permanece em conferência. Não houve avanço para M09.

## Conferência adicional no navegador — 2026-10-08

- Criada Empresa Fictícia Teste M08 com unidade fictícia, pela interface.
- Criado PGR fictício; edição produziu revisão 2 e preservou o plano de ação original na revisão 1, conferido na interface.
- Envio para revisão e registro de revisão interna pela administradora funcionaram; status final Revisado internamente e histórico com 4 eventos.
- Dados fictícios preservados para conferência do usuário. Evidência: assets/m08-teste.png.
- Impressão, revisão usando o perfil SST e isolamento do PGR entre consultorias ainda não conferidos nesta rodada. Não houve avanço para M09.


## Perfil SST, segunda consultoria e impressão — 2026-10-08
- Perfil SST criou, enviou e registrou revisão interna de um segundo PGR fictício, conferido na interface.
- Conta Aurora entrou em Documentos e não exibiu os PGRs da Horizonte; esta verificação visual não substitui testes de ataques ao servidor.
- Restaurada sessão da administradora Horizonte.
- Corrigida impressão para preparar cópia exclusiva do cartão escolhido, removendo espaço dos demais formulários e usando fonte maior. Tipos e ESLint do componente passaram.
- Acionar impressão preparou a cópia do PGR escolhido, mas a janela de impressão bloqueou a inspeção automatizada. PDF final e paginação ainda precisam de conferência manual. M08 permanece em validação.


## Aceite humano — 2026-10-08
- Usuário respondeu explicitamente: aprovado.
- Aceite da demonstração M08 registrado. O PDF final e sua paginação não foram inspecionados pelo agente; a aprovação não é apresentada como teste automatizado nem como validação profissional.

