# M02 — Identidade, autenticação e sessão

- **Estado:** aceita pelo usuário ao solicitar continuidade com o painel aberto em `/` após receber as credenciais fictícias.
- **URL local:** http://127.0.0.1:3000/login
- **Como iniciar:** em `examples/app`, execute `pnpm dev --hostname 127.0.0.1`.
- **Conta fictícia original (histórica):** `demo@ssthoje.local`
- **Senha fictícia original (histórica):** `SSTHojeDemo2026!`
- **Perfil:** administradora de consultoria de demonstração.
- **Dados:** nenhum usuário real, cadastro, banco ou dado de cliente. A conta é somente para demonstração local.

> **Acesso atual:** as credenciais acima pertencem à primeira versão do M02 e não são mais usadas pela aplicação atual. As contas de demonstração atuais são configuradas localmente em `examples/app/.env.local`; veja os nomes das variáveis em `examples/app/.env.example`.

## Teste passo a passo

1. Abra `http://127.0.0.1:3000/` sem estar autenticado.
   - Esperado: o app redireciona para a tela de acesso.
2. Digite um e-mail ou senha incorretos e selecione **Entrar**.
   - Esperado: aparece uma mensagem clara de erro sem revelar qual campo está correto.
3. Use a conta fictícia deste checkpoint e selecione **Entrar**.
   - Esperado: o painel inicial abre e a conta é mostrada como demonstração.
4. Atualize a página.
   - Esperado: a sessão continua ativa.
5. Selecione **Sair**.
   - Esperado: volta para a tela de acesso.
6. Tente abrir `http://127.0.0.1:3000/` novamente.
   - Esperado: volta para a tela de acesso.

## O que funciona de verdade

- Login no servidor contra uma única conta fictícia local.
- Sessão assinada com segredo local de 32 bytes, cookie `HttpOnly`, `SameSite=Lax`, caminho `/` e validade de oito horas. `Secure` é aplicado em produção HTTPS.
- Saída que apaga o cookie e bloqueio da página inicial sem sessão válida.
- Limite local de cinco tentativas por e-mail antes de uma pausa de cinco minutos.

## Ainda não implementado

- Recuperação de senha, cadastro de usuários, banco de dados, MFA, RBAC e isolamento de tenant; ficam para etapas posteriores.
- O controle de tentativas usa memória de um único processo e serve somente ao ambiente de demonstração; não substitui um limitador compartilhado em produção.
- A senha fictícia fica no `.env.local` ignorado pelo Git. Não publique esta configuração nem use credenciais reais. Para usuários reais será necessário armazenamento seguro de hashes de senha ou um provedor de identidade revisado.
- O código não está pronto para produção.

## QA

- `pnpm build` — passou; `/` e `/login` geradas com trechos dinâmicos para leitura de sessão.
- `pnpm lint` — passou.
- `pnpm typecheck` — passou.
- **Verificação visual e funcional pelo agente:** não executada. O navegador do ambiente bloqueou a atualização de `127.0.0.1`; o usuário chegou ao painel e pediu para continuar.

**Aceite registrado:** continuidade solicitada pelo usuário com o painel autenticado aberto.
