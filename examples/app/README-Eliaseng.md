# SST Hoje — versão inicial

Aplicação web reconstruída a partir do blueprint preservado do SST Hoje. O código fica nesta pasta no seu computador.

## Como abrir no seu computador

1. Abra o PowerShell nesta pasta (`examples/app`).
2. Execute `pnpm dev --hostname 127.0.0.1` para manter o acesso apenas neste computador.
3. No navegador, abra `http://localhost:3000`.
4. Para encerrar, volte ao PowerShell e pressione `Ctrl+C`.

Pré-requisitos: Node.js e pnpm. A primeira instalação das dependências já foi feita neste ambiente; se precisar instalá-las de novo, execute `pnpm install` nesta pasta.

## Conta fictícia de demonstração

- E-mail: `demo@ssthoje.local`
- Senha: `SSTHojeDemo2026!`
- Perfil: administradora da consultoria **Horizonte SST**.

Para conferir os limites de acesso, há mais duas contas de teste fictícias:

- `sst@ssthoje.local` / `SSTProfissional2026!` — perfil profissional SST, sem acesso à auditoria.
- `outra.consultoria@ssthoje.local` / `OutraSST2026!` — administradora da consultoria **Aurora Segurança do Trabalho**.

Essa conta serve somente para testar localmente. Não use dados reais nem publique esta aplicação.

## Nesta versão

- Painel inicial com marca SST Hoje.
- Navegação entre Início, Empresas, Documentos, Pendências e Trabalhadores.
- Layout adaptado para desktop e celular.
- Estados vazios que explicam o que ainda será implementado.
- Entrada e saída com cookie de sessão assinado e protegido.
- Escopo de tenant e permissões vinculados no servidor ao membro autenticado.
- Aba de auditoria disponível apenas para a administradora de cada consultoria.
- Cadastro local de empresas com vários CNPJs/unidades, contato e situação ativa/arquivada.
- Cadastro de vínculos fictícios de trabalhadores com função, unidade, categorias ilustrativas para revisão e histórico de situação.
- Envio local de PDFs fictícios com metadados, validade, versões e arquivamento; acesso ao arquivo exige sessão e permissão na consultoria.
- Checklist configurável sem regras normativas pré-carregadas; avaliações humanas preservam fonte, versão, evidência e próximo passo.

O cadastro de empresas, CNPJs e unidades fica em `data/clients.json`, dentro desta pasta. Esse arquivo local sobrevive ao encerramento do servidor e é ignorado pelo Git. Faça uma cópia de segurança da pasta `data` se quiser preservar os cadastros.

As contas e senhas são fictícias; não há cadastro de usuários, recuperação de senha ou banco de dados. Os arquivos locais ainda não são criptografados nem substituem um banco com cópias de segurança. Use somente dados fictícios, inclusive nos campos de contato, trabalhador e arquivos; não registre dados médicos ou documentos pessoais. PDFs não são analisados, escaneados contra malware ou pré-visualizados. O checklist não é um parecer de conformidade; responsáveis humanos devem confirmar as fontes, vigências e conclusões.

Os eventos de entrada e saída são salvos localmente em `data/audit-log.jsonl` dentro desta pasta e permanecem depois que o servidor é encerrado. O arquivo é criado no primeiro evento e é ignorado pelo Git. Faça cópia de segurança dessa pasta se quiser preservar esses registros. Não use informações reais de trabalhadores; o armazenamento local ainda não é banco de dados nem está pronto para uso operacional.

## Backup local experimental (M21)

Com o servidor parado, crie uma cópia completa da pasta `data` em um destino novo fora desta pasta do aplicativo:

```powershell
pnpm backup:data backup "$env:TEMP\sst-hoje-backup-AAAA-MM-DD" --confirm-app-stopped
pnpm backup:data verify "$env:TEMP\sst-hoje-backup-AAAA-MM-DD"
pnpm backup:data restore "$env:TEMP\sst-hoje-backup-AAAA-MM-DD"
```

A restauração sempre cria outra pasta isolada dentro do diretório temporário do sistema e nunca substitui os dados do aplicativo. Proteja o backup como os dados originais; ele não é criptografado. O procedimento ainda é experimental e não oferece snapshot transacional enquanto houver gravações.
