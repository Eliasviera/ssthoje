# M16 — Módulos e armazenamento de PDFs

2026-10-11. Usuário autorizou a continuidade com “continua” após a primeira fatia M16. Isso registra aceite para avanço da primeira entrega, sem declarar o M16 integralmente aprovado. Este complemento aguarda teste/aceite humano antes do M17.

## Resultado
- Master configura por consultoria novas operações de EPI, terceiros e prazos/preferências operacionais. Padrão compatível com dados anteriores: todos habilitados. Desativar não altera papéis, não concede permissões e não apaga registros.
- Verificação no servidor bloqueia ações administrativas dos módulos desativados. Em terceiros, inclui revisão de pendências e envio/reenvio por links existentes. Em EPI, inclui emissão de código e confirmação pendente por link existente. Confirmação já concluída continua idempotente.
- Consulta de históricos, PDFs e comprovantes permanece disponível aos perfis previamente autorizados. Painel operacional e avisos locais seguem consultáveis; atualização do painel pode continuar gerando avisos. Leitura de aviso é permitida. O controle operacional desta fatia bloqueia edição de prazo e de preferências, não todo o painel.
- Contagem física em bytes por consultoria das pastas document-files e third-party-files, incluindo versões substituídas, arquivadas e arquivos órfãos. 1 MB nesta demonstração = 1.048.576 bytes. JSON, logs e PDFs gerados em memória não fazem parte desta cota.
- Cota compartilhada entre os dois tipos de PDF e a reserva de armazenamento simulada da primeira fatia. Antes de criar/substituir/reenviar, a aplicação confere bytes reais + reserva simulada + novo arquivo. Excesso retorna erro; não apaga versões nem registra recebimento parcial por falta de cota.
- Reduzir plano abaixo do uso combinado é recusado. Master vê somente contagem física, sem conteúdo nem nomes de documentos.
- Configurações e histórico anterior/novo permanecem no JSON da plataforma e auditoria administrativa. Rejeita revisão antiga e módulos inválidos.

## Como testar
1. Abra http://127.0.0.1:3000/master. Perfil fictício Master: master@ssthoje.local / MasterFicticio2026!.
2. Para iniciar o servidor na pasta examples/app: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1`.
3. Em Horizonte, expanda “Planos e créditos · simulação”. Confira os PDFs armazenados, a reserva simulada e o limite total.
4. Desmarque “Novas operações de EPI”, justifique com dados fictícios, confirme e aplique. A opção deve continuar desmarcada após atualizar a página e o histórico deve registrar a configuração anterior/nova.
5. Usando a conta administradora de demonstração documentada nos checkpoints anteriores, confira que os registros EPI continuam consultáveis, mas não há formulário de nova entrega. Uma aba antiga ou link pendente não deve contornar o bloqueio do servidor.
6. Volte ao Master e reative EPI. Confirme que a opção fica marcada e o histórico anterior permanece.
7. Para testar armazenamento pelo painel, registre uma reserva simulada de 98 MB. Somada à reserva atual de 1 MB e aproximadamente 0,482 MB de PDFs, sobrará cerca de 0,518 MB. Um novo PDF fictício válido de 1 MB deve ser recusado no cadastro e no portal de terceiros sem criar versão/recebimento. Este teste altera a reserva acumulada; se realizado, aumente armazenamento adicional para acomodar novos testes. Não há botão de apagar consumo ou histórico.

## Verificações reais
- Suite TypeScript: 67 testes aprovados.
- Integração de documentos: 1 teste aprovado, cobrindo quota em criação/substituição, preservação do JSON e permanência do espaço após arquivamento. O marcador server-only é resolvido para módulo vazio somente no processo isolado de teste; aplicação não foi alterada para isso.
- Execução conjunta final: `node --experimental-strip-types --test --test-concurrency=1 tests/*.test.ts tests/*.test.mjs`: 68 aprovados, zero falhas. Resultado em examples/app/data/m16-test-result.txt.
- Uma execução conjunta anterior falhou em testes de terceiros, com falhas subsequentes de tamanho/auditoria. A causa inicial não foi confirmada; não considerar esta repetição prova de ausência de instabilidade local. Os grupos separados e a repetição final passaram. Persistência local no OneDrive continua risco conhecido.
- TypeScript `--noEmit`: aprovado. Build Next: aprovado, incluindo compilação, tipos e geração das páginas.
- ESLint dos arquivos alterados e testes: aprovado após corrigir nome de variável vedado pela regra do Next. Correção de nome não alterou o comportamento; suite completa repetida após ela.
- Navegador: contagem real de 505.086 bytes, desativação EPI, confirmação da configuração/histórico e reativação. Conferência visual desktop 1280 × 900 e celular 390 × 844, sem transbordamento visível nas áreas observadas. Tamanho padrão restaurado ao final.
- Evidências: assets/m16-modulos-desktop.jpg e assets/m16-modulos-celular.jpg.

## Estado final
Horizonte Essencial/Mensal; limites 100 empresas/1.000 trabalhadores; três módulos habilitados; reserva simulada 1 MB e crédito simulado consumido 1. Cinco eventos M16 preservados, incluindo desativação e reativação EPI. Aurora sem mudanças. Nenhum PDF adicional foi enviado aos dados da aplicação durante esta conferência.

## Arquivos e limites
Novo: src/lib/storage-quota.ts; tests/entitlements.test.ts; tests/document-storage.test.mjs. Alterados: plan-catalog.ts, tenant-state.ts, tenant-access.ts, document-store.ts, platform-store.ts, third-party-store.ts, epi-store.ts, operations-store.ts, app/document-actions.ts, app/page.tsx e componentes/actions Master. package.json inclui ambos os formatos de testes e execução sequencial pelo risco local já observado. Documentação e evidências atualizadas.

Não há cobrança ou chamadas de IA. Catálogo/preços e créditos continuam demonstrativos; sem renovação automática ou relação com tokens reais. Cota por varredura síncrona e gravação JSON adequada apenas a esta demonstração: sem garantia transacional entre processos, sem object storage, coordenação distribuída ou medição de todos os arquivos do sistema. Não declara prontidão de produção. Próximo passo: teste humano deste complemento; M17 ainda não iniciado.

## Aceite — 2026-10-11
Usuário aprovou explicitamente com “aprovado, pode continuar”. M16 aceito para continuidade da demonstração; M17 autorizado, sem cobrança real. Não constitui liberação de produção.
