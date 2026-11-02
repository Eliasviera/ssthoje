# M13 — EPI e confirmação fictícia do trabalhador

Avanço autorizado pelo usuário com “pode continuar” após o checkpoint M12, seguido de “sim” durante implementação. Entrega de demonstração concluída em 2026-10-10. Após entrega deste checkpoint, usuário respondeu “continua”, autorizando avanço ao M14. Aceite da demonstração, sem liberação profissional ou de produção.

## Implementação
- Administradora registra entrega de 1 a 20 itens fictícios, com trabalhador ativo da própria consultoria, unidade/empresa ativas, data, referência/CA informado, tamanho/modelo e quantidade. SST acompanha entregas e comprovantes. Perfis médicos, cliente, terceiro e SaaS Master não recebem acesso ao painel de EPI.
- Itens e vínculo são congelados como snapshot histórico. Não há validação automática de CA, adequação, treinamento, obrigação normativa ou prazo de troca.
- Link local aleatório de 256 bits em fragmento de URL, com duração técnica de 24h; somente hash persistido. Portal retorna dados mínimos da entrega, sem IDs internos, riscos ocupacionais ou observações internas.
- Código mock de seis dígitos, exibido no próprio simulador, com duração técnica de cinco minutos e cinco erros permitidos. Hash do código persistido; novos códigos não zeram os erros. Administradora pode gerar novo link pendente, invalidando link/código anteriores e liberando novas tentativas.
- Confirmação exige código correto e marcação explícita da declaração de simulação. Repetição não cria outro protocolo/evento. Comprovante identifica modo mock, declaração versionada e resumo SHA-256 do snapshot; não é assinatura digital.
- Cancelamento somente de entrega pendente, com motivo e histórico preservados. Entrega confirmada não pode ser alterada/cancelada por esse fluxo. Comprovante continua acessível à consultoria mesmo após arquivamento do cadastro, preservando nomes e itens originais.
- Comprovante HTML protegido por sessão/tenant, com botão de impressão e estilos próprios. Nenhum e-mail, SMS, integração ou assinatura jurídica foi usado.

## Verificações executadas
- `node --experimental-strip-types --test tests/*.test.ts`: 44 testes aprovados; nove novos de EPI cobrem autorização, vínculo, entradas, confirmação idempotente, bloqueio/renovação, expiração, cancelamento, snapshots, auditoria e limite de requisições.
- `node node_modules/typescript/bin/tsc --noEmit`: aprovado.
- `node node_modules/eslint/bin/eslint.js src/lib/epi-store.ts src/lib/epi-service.ts src/lib/epi-demo.ts src/lib/tenant-access.ts src/lib/audit-log.ts src/app/epi-actions.ts src/app/epi-section.tsx src/app/receber-epi src/app/epi src/app/page.tsx src/app/dashboard.tsx tests/epi.test.ts`: aprovado.
- Navegador: entrega com dois itens fictícios; portal exibiu somente informações públicas; código incorreto rejeitado; código correto e declaração registraram confirmação; painel e comprovante exibiram mesmo protocolo. Quatro eventos: criação, geração de código, erro de código e confirmação.
- Visualização móvel 390×844 e desktop 1280×900. Portal e painel móvel sem transbordamento horizontal do conteúdo, conferido no DOM. Tamanho temporário restaurado.
- Cache gerado de desenvolvimento `.next/dev` limpo e servidor reiniciado para recompilar CSS; cadastros/arquivos em `data` preservados. Estilos finais conferidos no navegador.
- Evidências: `assets/m13-confirmacao.png`, `m13-comprovante.png`, `m13-celular.png`, `m13-epi.png`. Não foram registrados códigos ou tokens nessas imagens.
- Bloqueio completo, renovação, cancelamento, expiração e isolamento foram verificados nos testes automatizados; não houve troca de perfis no navegador neste marco. Impressão física/PDF e build de produção não foram executados.

## Arquivos
- Novos: `examples/app/src/lib/epi-store.ts`, `epi-service.ts`, `epi-demo.ts`; `src/app/epi-actions.ts`, `epi-section.tsx`, `receber-epi/page.tsx`, `receber-epi/portal.tsx`, `epi/comprovante/[deliveryId]/page.tsx`, `print-button.tsx`; `tests/epi.test.ts`.
- Integração: `tenant-access.ts`, `audit-log.ts`, `page.tsx`, `dashboard.tsx`, `globals.css`.
- Registros: DECISION_LOG, M12_CHECKPOINT, CHANGELOG e este checkpoint.

## Limites e teste humano
Somente dados fictícios locais. O código exibido junto ao link permite testar o fluxo e não verifica identidade. Não há comprovante real de entrega, validade jurídica, assinatura, consentimento regulatório, CA validado ou conformidade atestada. Parâmetros de acesso são técnicos de demonstração. Perguntas 5 e 8 permanecem abertas para produção. JSON/arquivos locais sem criptografia, banco transacional ou garantias de operação em produção.

EPI está aberto no painel com o exemplo confirmado. Abra o comprovante ou histórico. Para testar outra entrega: Nova entrega fictícia → selecione trabalhador → preencha itens → registre → abra imediatamente o link → gere código fictício → confira itens → insira código e marque a declaração → confirme a simulação. Volte ao painel para ver protocolo/comprovante. Se sair antes de copiar/abrir o link, use Gerar novo link local na entrega pendente.

Próximo marco após aceite: M14 — painel operacional e notificações locais, com prazos configuráveis e sem envio externo.
