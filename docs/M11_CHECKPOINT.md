# M11 — Portal de terceiros

Implementação local de demonstração autorizada pelo usuário com “pode continuar”. Usuário respondeu “continua” ao checkpoint entregue, autorizando avanço ao M12. Aceite da demonstração, sem validação profissional ou liberação para produção.

## Entrega
- Administradora cria e revoga convite para contratada fictícia vinculado a cliente/unidade ativos da própria consultoria.
- Solicitação de PGR, LTCAT e Treinamento existentes, sem conteúdo médico. Duração técnica de acesso de 1 hora, 24 horas ou 7 dias; não representa prazo normativo.
- Portal por link permite envio de um PDF por categoria solicitada, até 7 MB, com protocolo e preservação do original. Recebimento não equivale a aprovação.
- Administradora e SST acompanham e baixam recebimentos no próprio tenant; portal não permite download nem acesso ao painel.
- Token aleatório de 256 bits em fragmento de URL; somente hash persistido. Revogação, expiração, validação de unidade ativa, limitação de requisições e auditoria sem token/conteúdo.

## Verificações executadas
- `node --experimental-strip-types --test tests/*.test.ts`: 28 testes aprovados, incluindo oito de terceiros (autorização, isolamento, entradas, recebimentos, download, revogação, expiração, auditoria e limitação).
- `node node_modules/typescript/bin/tsc --noEmit`: aprovado.
- ESLint dos arquivos novos e compartilhados alterados: aprovado após ajuste de navegação com Link; nova execução nos dois componentes ajustados.
- Navegador: criação de convite fictício, abertura do portal, envio de `assets/teste.pdf` como PGR e protocolo visível no painel administrativo. Treinamento permanece aguardando envio. Ajustado fechamento automático do formulário após criar convite para preservar visibilidade do link.
- Evidências: `assets/m11-portal.png` e `assets/m11-terceiros.png`. Revogação e isolamento entre consultorias foram verificados por testes automatizados, não por troca de perfis no navegador neste marco.

## Arquivos
- Novos: `examples/app/src/lib/third-party-store.ts`, `third-party-service.ts`; `src/app/third-party-actions.ts`, `third-party-section.tsx`, `envio/page.tsx`, `envio/portal.tsx`, `api/third-party-files/[receiptId]/route.ts`; `tests/third-party.test.ts`.
- Integração: `tenant-access.ts`, `audit-log.ts`, `page.tsx`, `dashboard.tsx`, `globals.css`.
- Registros: este checkpoint, CHANGELOG, DECISION_LOG e continuidade do M10.

## Limitações e teste humano
Ambiente fictício local. Link concede capacidade de envio a quem o possui, sem comprovar identidade. CNPJ validado apenas pelo formato. PDFs têm limite, extensão e assinatura inicial conferidos; não há antivírus ou validação completa do PDF. JSON/arquivos locais não substituem banco, armazenamento protegido ou controles de produção. Nenhum link foi enviado externamente. Correção/substituição documental e avaliação pertencem à etapa seguinte.

Para testar: abra Terceiros → Novo convite, escolha cliente/unidade, informe contratada fictícia e categorias. Crie o link e abra o portal imediatamente; o segredo não é recuperável após sair da seção. Envie somente PDF fictício. Retorne a Terceiros para conferir protocolo e download. O convite de teste existente já contém um PGR recebido.
