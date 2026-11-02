# Acesso local pelo atalho SST Hoje

Atalho criado na Área de Trabalho: SST Hoje.lnk. Dê dois cliques para abrir o projeto no navegador padrão. O iniciador assets/abrir-sst-hoje.mjs reutiliza o servidor existente; se não responder, inicia scripts/dev-with-postgres.mjs em localhost:3107, carregando a configuração PostgreSQL local e aguarda até 60 tentativas de resposta. Novas instâncias iniciadas por scripts/dev-with-postgres.mjs usam `localhost` como hostname. Se já houver um processo de servidor anterior à configuração local, reinicie-o antes de considerar o acesso restrito a este computador, pois o iniciador reutiliza servidores existentes. Use `localhost` no navegador: o servidor de desenvolvimento do Next.js bloqueia recursos de desenvolvimento quando acessado por `127.0.0.1`. Não depende de manter a conversa aberta e não inicia automaticamente com Windows.

As contas de demonstração e o segredo da sessão são carregados de `examples/app/.env.local`, junto ao app Next.js. Ao restaurar a configuração, use esse caminho; o `.env.example` da mesma pasta mostra os nomes das variáveis sem conter credenciais.

Manter a pasta SST HOJE e a instalação atual do runtime Node do Codex. Mover o projeto ou remover esse runtime exige atualizar o atalho. Acesso disponível neste PC enquanto ligado; não é hospedagem pública. O servidor é o ambiente de demonstração/desenvolvimento. A pasta pode conter registros preexistentes; não presuma que todos sejam fictícios. Use apenas dados sintéticos nos testes e não compartilhe capturas ou exportações sem confirmar que não contêm dados reais.

Erros de início são mostrados no Bloco de Notas; log em assets/sst-hoje-inicializacao.log. Nenhuma credencial é gravada no atalho. Não fechar processos manualmente sem conferir qual serviço está usando a porta 3107.

Verificação: node --check do iniciador aprovado; atalho criado e destino conferido. Teste com servidor já ativo; partida após reinicialização do Windows não foi executada.
