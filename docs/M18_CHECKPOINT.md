# M18 — Página pública e edição pelo Master

Entrega local em 2026-10-11. Usuário autorizou continuidade com “Continua” após M17. Após disponibilização do M18, solicitou “continua”, registrando aceite para avanço da demonstração e autorizando preparação local do M19. Não equivale a liberação para produção.

## Entrega e arquivos
- Página `/site`: apresentação, fluxo ilustrativo, dois planos, três perguntas frequentes e acesso à demonstração. A rota inicial do aplicativo foi preservada.
- Editor `/master/conteudo` e prévia `/master/conteudo/preview`, exclusivos do Master no servidor. Salvar rascunho não publica. Publicação exige revisão declarada e justificativa; formulários antigos são rejeitados.
- Textos simples com limites e reconstrução dos campos permitidos; React escapa o conteúdo. Imagem selecionável entre fluxo interno e logo existente, sem upload ou URL livre. Preços e capacidades permanecem no catálogo demonstrativo; o editor altera somente nomes e descrições dos planos.
- Histórico preserva conteúdo anterior/posterior, autor, revisão, data e motivo. Interface consulta últimos 30 eventos; armazenamento mantém todos. Auditoria registra leitura, salvamento e publicação sem copiar justificativas.
- Novos: `src/lib/site-content.ts`, `site-store.ts`, `site-service.ts`; `src/app/site/page.tsx`, `landing.tsx`, `site.css`; `src/app/master/conteudo/page.tsx`, `actions.ts`, `editor.tsx`, `preview/page.tsx`; `tests/site.test.ts`.
- Alterados: `src/lib/audit-log.ts`, `src/app/master/master-dashboard.tsx`. Dados demonstrativos em `data/site-content.json`, ignorados pelo Git; não são dados de consultorias.

## Verificações
- Suite completa: 78 testes aprovados, zero falhas. Executada com Node, `--experimental-strip-types --test --test-concurrency=1`, em pasta temporária fora da restrição local. Log: `examples/app/data/m18-tests.txt`.
- Quatro testes novos cobrem autorização, isolamento público/rascunho, snapshots e cópias, revisão antiga e duplicação, entradas inválidas e projeção de campos permitidos.
- TypeScript `node node_modules/typescript/bin/tsc --noEmit`: aprovado. ESLint dos arquivos novos/alterados: aprovado.
- Build `node node_modules/next/dist/bin/next build`: aprovado, incluindo as três novas rotas. Comando inicial com `npm` indisponível no PATH; executado diretamente com Node.
- Navegador: salvar revisão 1, confirmar público anterior e prévia nova, publicar revisão 1 e confirmar texto público; restaurar texto original via revisão 2, conferir prévia e publicar. Quatro eventos preservados, revisão 2 publicada e rascunho 2. Pergunta frequente expande corretamente.
- Revisão visual em 1280 × 900 e 390 × 844, sem transbordamento visível nas áreas observadas. Dimensões restauradas. Evidências: `assets/m18-desktop.jpg`, `m18-celular.jpg`, `m18-editor.jpg`.

## Roteiro de aceite
1. Abrir `http://127.0.0.1:3000/site` e conferir apresentação, planos, perguntas e botão de acesso.
2. Como Master, abrir `/master/conteudo`, alterar um texto fictício e salvar com justificativa.
3. Conferir a prévia restrita e confirmar que `/site` mantém o conteúdo publicado anterior.
4. Marcar revisão, justificar e publicar localmente. Conferir novo texto público e histórico; publicação repetida fica desabilitada.
5. Testar em janela estreita e confirmar que o editor não altera preços, assinaturas ou cobranças.

## Limites e próximo passo
Publicação somente no aplicativo local, sem hospedagem externa, contratação, coleta de contatos ou pagamento. JSON local sem banco transacional ou coordenação entre processos; não é arquitetura de produção. Erros EPERM observados anteriormente no ambiente restrito seguem relevantes e não foram ocultados por repetição automática. Conteúdo inicial é exibido quando ainda não há publicação. Seleção de imagens e quantidades de planos/perguntas são fixas nesta fatia. Próximo passo: teste e aceite humano do M18 antes do M19.
