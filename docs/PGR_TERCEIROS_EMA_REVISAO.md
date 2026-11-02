# Revisão focada — PGR e Terceiros da EMA MAXIBUS

Data: 2026-10-31  
Escopo: conferência da extração do PGR e definição geral do fluxo de anexo de atividades contratadas. Este roteiro não altera o PGR, o inventário, a empresa ou os requisitos cadastrados.

## PGR da EMA — apontamentos identificados

O PGR cadastrado tem 240 páginas. A digitalização preservou a origem e as versões anteriores. O inventário estruturado está em rascunho e os 153 riscos permanecem como `reported` (relatados), sem revisão técnica concluída.

| Páginas | Conferência visual do PDF original | Encaminhamento |
|---|---|---|
| 36 | Data 01/08/2026; Intensidade vazia; Nível de Ação “390 ppm”; Limite e Técnica vazios. | Extração confere com a página. Manter os campos vazios como “não informado”; não mover “390 ppm” para Intensidade. |
| 67 | Data 01/08/2026; Intensidade vazia; Nível de Ação “39” (sem unidade impressa); Limite e Técnica vazios. | Extração confere com a página. Preservar “39” literalmente, sem completar unidade nem interpretar o valor; responsável técnico deve esclarecer se necessário. |
| 114 | Data 01/08/2026; Intensidade vazia; Nível de Ação “390 ppm”; Limite e Técnica vazios. | Extração confere com a página. Manter os campos vazios como “não informado”; não mover “390 ppm” para Intensidade. |
| 30 quadros | 27 têm Intensidade preenchida e 3 não; a fonte usa as colunas Intensidade, Nível de Ação, Limite e Técnica | A extração estava rotulando Intensidade como “Resultado”. O mapeamento e os rótulos do PGR foram alinhados à fonte; Nível de Ação permanece separado. |
| 153 riscos | Todos permanecem relatados, pendentes de validação | Responsável técnico deve avaliar perigo, danos, grupos expostos, exposição e controles com base na fonte e no local. A extração não equivale a aprovação. |
| 96 ações | Campos editáveis no PGR de trabalho, com revisão/histórico | Conferir escopo, prioridade, objetivo, responsável e datas com o documento; datas são declarações, não prova de execução. |

### Como registrar cada observação

Conferência concluída por renderização visual das páginas 36, 67 e 114 e comparação com as tabelas/texto extraídos de `source-v1.json`. Não foi encontrada divergência de extração nesses quadros. Os campos incompletos são incompletos na fonte. As páginas não informam qual unidade se aplica ao “39” da página 67, então a unidade não deve ser inferida. Preservar o valor extraído e não alterar o rascunho sem fonte nova ou orientação explícita do responsável. O PDF original permanece intacto.

## Terceiros — regra geral definida para o produto

- O fluxo de contratação de terceiros deve servir a todas as empresas clientes, não somente à EMA nem somente a empresas que já tenham convites cadastrados.
- Para atividade contratada fora do processo operacional habitual da contratante, o fluxo deve permitir avaliar os riscos específicos da atividade e registrar um anexo no PGR da contratante. O anexo acompanha o período real da atividade: entra após revisão explícita e é encerrado quando o serviço cessa, preservando conteúdo e histórico.
- A análise considera local, tarefa, perigos, possíveis danos, interferências com a operação, controles, responsabilidades, plano de ação e evidências. Se os riscos já estiverem cobertos no PGR, registrar a referência e as medidas aplicáveis; se não estiverem ou ainda não foram avaliados, identificar o que precisa ser integrado. Não presumir risco, controle, conformidade ou liberação pelo tipo MEI/ME.
- A classificação MEI/ME e quem executa (titular, sócios ou empregados) permanecem dados distintos. Para MEI, a dispensa de elaborar o próprio PGR não dispensa a contratante de incluí-lo nas ações de prevenção e no seu PGR quando atuar em dependências da contratante ou local previamente convencionado. Quando o serviço é prestado somente pelo titular ou sócios, aplicar também a regra de extensão das medidas de prevenção do item 1.5.8.1.2. Fichas MEI podem apoiar a triagem, mas não substituem a avaliação da atividade concreta.
- Ser ME não gera dispensa automática do PGR. A NR-1 prevê tratamento específico para ME/EPP de graus de risco 1 e 2 somente sob condições próprias; a equipe deve confirmar a aplicabilidade. Tarefa crítica e riscos do serviço não recebem dispensa automática por porte ou enquadramento.
- Para serviços no estabelecimento da contratante em que os riscos resultem da interação entre atividades, o fluxo deve registrar a definição conjunta das medidas de prevenção sob coordenação da contratante, conforme NR-1 1.5.8.4.
- Na EMA, o cadastro atual não tem requisitos ou terceiros configurados. A EMA é o exemplo da empresa cliente, enquanto o critério acima é geral para os clientes do produto; não há caso concreto de contratada a cadastrar agora.

### Limite de implementação atual

O anexo existente oferece rascunho, inclusão explícita no PGR de trabalho e encerramento com histórico. Ainda é fluxo local ligado ao hash do PGR; não é alimentado automaticamente pela análise/convites de Terceiros nem pelo inventário PostgreSQL. A integração autoritativa com caso, contratada e escopo continua pendente em M22. Nenhum serviço, perigo ou requisito específico foi criado para a EMA.

## Limites desta revisão

Nenhum formulário foi enviado; nenhum cadastro, requisito, avaliação, anexo ou decisão foi criado ou alterado. A conferência resolveu a dúvida de extração, mas não a ausência de dados técnicos na fonte nem a necessidade de revisão profissional. Próxima ação: registrar eventual esclarecimento formal do responsável sobre o quadro da página 67 e implementar a regra geral de anexo para atividade contratada fora do processo operacional habitual, com encerramento e histórico. O roteiro técnico/estrutural existente continua em `PGR_TERCEIROS_ANEXOS_CHECKPOINT.md` e `M22_PLANO_FECHAMENTO.md`.
