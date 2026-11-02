# M03 — Multi-tenant, papéis e auditoria

- **Estado:** aceita para avançar por solicitação do usuário (“continue” após pedir persistência local); testes manuais dos três perfis continuam recomendados.
- **URL:** http://127.0.0.1:3000/
- **Como iniciar:** em `examples/app`, execute `pnpm dev --hostname 127.0.0.1`.
- **Tenants fictícios:** Horizonte SST e Aurora Segurança do Trabalho.
- **Dados:** somente contas e vínculos de demonstração; sem clientes, trabalhadores ou documentos reais.
- **Auditoria local:** eventos de entrada e saída são acrescentados em `examples/app/data/audit-log.jsonl`; não são apagados quando o servidor reinicia. O arquivo fica no seu PC e está excluído do Git.

## Contas de demonstração

| E-mail | Senha | Tenant / perfil |
|---|---|---|
| `demo@ssthoje.local` | `SSTHojeDemo2026!` | Horizonte SST — administradora |
| `sst@ssthoje.local` | `SSTProfissional2026!` | Horizonte SST — profissional SST |
| `outra.consultoria@ssthoje.local` | `OutraSST2026!` | Aurora Segurança do Trabalho — administradora |

As senhas são fictícias e locais. O `.env.local` com esses valores não deve ser publicado.

## Teste passo a passo

1. Entre com a conta administradora da Horizonte SST.
   - Esperado: o nome do tenant aparece no painel e a navegação inclui **Auditoria**.
2. Abra **Auditoria**.
   - Esperado: aparece o registro da entrada de conta, ligado à Horizonte SST.
3. Selecione **Sair**, depois entre com a conta `sst@ssthoje.local`.
   - Esperado: o painel mostra o perfil profissional SST; **Auditoria** e **Empresas** não aparecem.
4. Saia e entre com a administradora da Aurora.
   - Esperado: aparece Aurora Segurança do Trabalho; a auditoria mostra apenas os eventos desse tenant, sem eventos da Horizonte.
5. Rode `pnpm test` na pasta `examples/app`.
   - Esperado: os nove testes de escopo, permissões, separação de auditoria e imutabilidade passam.

## Implementado

- Tenant e vínculo de membro são resolvidos no servidor a partir do identificador do usuário da sessão assinada.
- Seções da interface são filtradas por papel. O servidor aplica a permissão antes de compor o painel e antes de disponibilizar eventos de auditoria.
- Consultar um tenant diferente do vínculo do usuário retorna negação. O identificador de tenant fornecido pelo navegador não é usado como autoridade.
- Auditoria registra entrada e saída sem senha ou token. A API da trilha permite adicionar e consultar eventos, mas não editar/remover os eventos armazenados.
- Testes automatizados cobrem o vínculo, troca de tenant, acesso negado, papel desconhecido, papéis administrativos, visibilidade de seções e filtro/imutabilidade da auditoria.

## Limitações e riscos

- Tenants e membros ainda são fixtures em memória. A auditoria usa arquivo JSON Lines local; isso não substitui PostgreSQL, backup automatizado, controle multiusuário ou armazenamento operacional.
- O limitador de tentativas continua em memória de processo, como registrado em M02.
- A matriz inclui papéis previstos para etapas futuras; os logins disponíveis são somente os três listados acima.
- Não é produto pronto para produção. M02/M03 usam uma conta e credenciais fictícias locais.
- A inspeção visual automatizada não foi possível no navegador deste ambiente. Teste desktop e celular manualmente junto com os perfis acima.

## QA

- `pnpm test` — passou; 9 testes.
- `pnpm lint` — passou.
- `pnpm typecheck` — passou.
- `pnpm build` — passou; `/`, `/login` e `/sem-acesso` compiladas.
- **Verificação de interface pelo agente:** não executada neste checkpoint.

## Persistência local

- O arquivo de auditoria é criado automaticamente em `examples/app/data/audit-log.jsonl` após uma entrada ou saída válida.
- Para levar os registros junto ao projeto, copie esse arquivo junto com a pasta. A pasta `data` está ignorada pelo Git para não publicar registros locais.
- Não apague o arquivo se quiser manter o histórico. A trilha não inclui senhas nem tokens.

**Decisão necessária:** confira os três perfis e confirme se cada um vê somente o tenant e as opções esperadas. Aprove M03 ou indique ajustes antes de avançar.
