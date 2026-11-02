# M04 — Cadastro de empresas e CNPJs

- **Estado:** aceito pelo usuário ao solicitar continuação; conferência manual continua recomendada.
- **URL:** http://127.0.0.1:3000/
- **Atalho direto para a lista:** `/empresas` no mesmo endereço e porta do app (por exemplo, `http://127.0.0.1:3107/empresas`). Requer sessão de uma conta da consultoria com permissão para consultar empresas; a conta SaaS Master não acessa os cadastros do tenant.
- **Perfil de cadastro:** administradora da consultoria.
- **Perfil de consulta:** profissional SST da própria consultoria.
- **Persistência:** `examples/app/data/clients.json`, arquivo local excluído do Git.
- **Demonstração:** use somente dados fictícios; o arquivo local ainda não é criptografado.

## O que está disponível

- Razão social, nome fantasia, contato por nome/e-mail/telefone.
- Uma ou mais unidades com CNPJ e cidade/UF.
- Validação estrutural de CNPJ (14 dígitos), campos obrigatórios e duplicidade dentro da consultoria.
- Situação ativa/arquivada; arquivar preserva o cadastro e permite reativação.
- Isolamento por consultoria aplicado no servidor em leitura e alteração.
- Eventos de criação e mudança de situação acrescentados à auditoria local.

## Conferência manual

1. Entre como administradora Horizonte: `demo@ssthoje.local` / `SSTHojeDemo2026!`.
2. Abra **Empresas**, cadastre uma empresa fictícia com dois CNPJs e salve.
3. Confirme que os dados aparecem na lista; feche e reabra o servidor e confirme que continuam lá.
4. Arquive e reative a empresa; confira a situação exibida.
5. Saia e entre como `sst@ssthoje.local` / `SSTProfissional2026!`; confirme que consegue consultar a empresa, sem botões de cadastro/arquivamento.
6. Entre como `outra.consultoria@ssthoje.local` / `OutraSST2026!`; confirme que a lista da Aurora não mostra o cadastro da Horizonte.

## Limitações

- O armazenamento é um arquivo JSON local, sem criptografia, backups automáticos, controle de concorrência entre vários processos ou recuperação transacional.
- O CNPJ é validado apenas pelo formato de 14 dígitos; não há consulta oficial nem validação de dígitos verificadores.
- Dados de empresas continuam separados por fixtures de tenant em memória. Use somente informações fictícias nesta versão.
- Cadastro de trabalhadores, documentos e edição dos demais dados da empresa não fazem parte da M04 atual.

## QA

- `pnpm lint`: passou.
- `pnpm typecheck`: passou após corrigir o tipo das unidades.
- `pnpm build`: passou; a primeira compilação apontou avisos de caminho dinâmico, que foram removidos fixando os arquivos em `data/`.
- Testes automatizados e revisão visual pelo navegador: não executados nesta alteração.

**Decisão necessária:** confira cadastro, persistência após reiniciar, arquivamento e isolamento dos três perfis. Aprove M04 ou indique ajustes antes de avançar.
