# M06 — Documentos SST e versionamento local

- **Estado:** aceito pelo usuário ao solicitar continuação; conferência manual continua recomendada.
- **URL:** http://127.0.0.1:3000/
- **Permissões:** administradora envia/substitui/arquiva; pessoas com `documents.read` no próprio tenant podem consultar e baixar.
- **Persistência:** metadados em `examples/app/data/documents.json`; PDFs privados em `examples/app/data/document-files/`.
- **Privacidade:** armazenamento sem criptografia. Use somente PDFs e dados fictícios. Não envie ASO, exames, PCMSO, prontuários, CPF ou documentos reais.

## Escopo disponível

- Metadados: título, categoria de demonstração, empresa, unidade, validade e nome original.
- Categorias nesta etapa: PGR, LTCAT, Treinamento e Outro. Não inclui prontuário ou documento médico.
- Upload restrito a PDF de até 7 MB; valida extensão, tipo informado e assinatura `%PDF-` no início do conteúdo.
- PDF armazenado fora de `public`, sem pré-visualização ou extração de texto.
- Download como anexo exige sessão e permissão de leitura; IDs de outra consultoria retornam não encontrado.
- Nova versão preserva o arquivo e metadados anteriores; arquivar preserva todos os arquivos e eventos.
- Eventos de envio, substituição e arquivamento são acrescentados à auditoria do tenant.

## Conferência manual

1. Entre como administradora Horizonte: `demo@ssthoje.local` / `SSTHojeDemo2026!`.
2. Em **Documentos**, envie um PDF fictício de até 7 MB associado a empresa/unidade fictícia.
3. Baixe o anexo e confira título, categoria, validade e histórico.
4. Substitua o arquivo por outra versão fictícia; confirme que a versão anterior continua baixável.
5. Arquive o grupo e confira que os metadados e versões continuam disponíveis.
6. Entre como profissional SST e confirme leitura/download sem opções de alteração.
7. Entre como administradora Aurora e confirme que não lista nem baixa documentos da Horizonte.

## Limitações

- Não há antivírus/varredura de malware, criptografia em repouso, backup automático, retenção ou recuperação transacional.
- Os PDFs não são verificados além de uma validação superficial de cabeçalho e nunca são analisados pelo sistema.
- Todo o armazenamento local fica em texto/arquivo legível no PC; faça backup manual da pasta `data` e use somente conteúdo fictício.
- Validade é metadado informado pelo usuário, não decisão normativa nem parecer de conformidade.

## QA

- `pnpm lint`: passou, sem avisos.
- `pnpm typecheck`: passou, incluindo `src/lib/session.ts`.
- `pnpm build`: passou; rota de download criada como dinâmica.
- Testes automatizados e revisão visual pelo navegador: não executados nesta alteração.

**Decisão necessária:** confira upload, download, substituição, arquivamento e isolamento; aprove M06 ou indique ajustes antes de avançar.
