# M19 — Escopo fictício e teste de código de confirmação

2026-10-11. Usuário determinou “PODE SER TUDO FICITCIOS” e confirmou “SIM, CONTINUA”. Essa decisão substitui a necessidade de configurar contas externas para a demonstração atual. Após esta entrega, solicitou “CONTINUA”, registrando aceite para avançar ao M20 demonstrativo. Nenhuma credencial de provedor é necessária. Integração real não concluída.

## Entrega
Na área Master `/master/integracoes`, novo teste de código de confirmação local, com seleção de consultoria fictícia, geração de seis dígitos, conferência e histórico. Validade técnica de cinco minutos e limite de cinco tentativas; confirmação encerra o código e impede reutilização. Gerar outro código encerra o anterior pendente da mesma consultoria/ator. Códigos de consultorias diferentes permanecem independentes.

Master e consultoria ativa validados no servidor em geração e conferência; identificador deve pertencer à consultoria e ao ator. Limite administrativo compartilhado aplicado. Código aleatório gerado com randomInt, digest scrypt com salt individual, comparação de tempo constante. Código aparece apenas na resposta de geração e não é salvo no arquivo ou na auditoria. Histórico exibido não inclui salt/digest. Validade consultada no servidor, sem confiar em relógio ou estado enviado pelo navegador.

Este teste NÃO autentica sessão, confirma entrega de EPI, assina documento ou envia e-mail/SMS. Não deve ser reutilizado como serviço de autenticação real. A exibição do código ao próprio operador é exclusiva da demonstração fictícia.

As simulações anteriores de cobrança e resposta fixa de IA foram preservadas. Receptor Asaas externo permanece desativado/sem configuração; não criado túnel ou conta. Nenhuma chamada a OpenAI ou SMTP. Continuação do projeto pode usar apenas demonstração local conforme decisão do usuário.

## Verificação
- `node node_modules/typescript/bin/tsc --noEmit`: aprovado.
- ESLint dos arquivos novos e página alterada: aprovado.
- `node node_modules/next/dist/bin/next build`: aprovado.
- Suite completa, pasta temporária fora da restrição Windows: `node --experimental-strip-types --test --test-concurrency=1 <app>/tests/*.test.ts <app>/tests/*.test.mjs`: 90 testes aprovados, zero falhas. Log `examples/app/data/m19-otp-tests.txt`.
- Três testes novos: autorização/isolamento e uso único; cinco tentativas incorretas e bloqueio inclusive do código correto; expiração, substituição e preservação do histórico. Conferem projeção sem hash e arquivo sem campo de código.
- Navegador: gerar código, digitá-lo e confirmar; formulário de conferência removido após sucesso, histórico Confirmado · encerrado, uma tentativa. Estado final: um teste Horizonte confirmado, anteriores preservados.
- Visual desktop 1280 × 900 e celular 390 × 844 na seção de código, sem transbordamento visível. Dimensões restauradas. Evidências `assets/m19-otp-desktop.jpg`, `assets/m19-otp-celular.jpg`, sem código ativo exposto.

## Arquivos
Novos: `src/lib/otp-sandbox.ts`, `src/app/master/integracoes/otp-actions.ts`, `otp-panel.tsx`, `tests/otp-sandbox.test.ts`.
Alterado: `src/app/master/integracoes/page.tsx`. Persistência fictícia `data/otp-sandbox.json`, ignorada pelo Git. Documentação: este checkpoint, CHANGELOG.md, DECISION_LOG.md e referência no M19_CHECKPOINT.md.

## Roteiro humano
1. Como Master, abrir `/master/integracoes` e ir à seção Código de confirmação · teste fictício.
2. Gerar código e digitar os seis números exibidos; conferir sucesso e histórico encerrado.
3. Gerar outro, testar número diferente e conferir tentativas restantes. Após cinco erros, gerar novo teste.
4. Gerar outro código da mesma consultoria e conferir o anterior substituído; para expiração, aguardar cinco minutos e tentar confirmar.

## Riscos e próximo passo
JSON local síncrono, sem transação/coordenador de múltiplos processos ou criptografia do arquivo completo. Digest de código curto não torna esta bancada adequada à autenticação de produção. Após um erro, a resposta de geração não é reexibida; código pode ser redigitado se anotado ou pode ser gerado novo teste. Histórico mantém registros antigos, com projeção dos últimos 20; expiração aparece ao consultar e é persistida ao conferir código vencido ou gerar substituto. Limite de tentativas não pode ser contornado para o mesmo desafio, mas gerar novo desafio é permitido ao Master para testes.

O erro EPERM do ambiente restrito segue relevante; testes foram executados fora dessa restrição, sem mascarar falhas com retry. Próximo passo: aceite do M19 demonstrativo e preparação do M20 com dados fictícios. Provedores reais ficam como integração futura, sem impedir avanço do escopo explicitamente fictício.
