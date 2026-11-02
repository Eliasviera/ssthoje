# M22 — Estados de avaliação técnica e efeito da política

2026-10-18. Contrato funcional candidato para impedir que política, evidência e decisão sejam confundidas. Não é interpretação jurídica nem implementação de runtime.

## Duas dimensões independentes

O **efeito configurado na política** é versionado: `recommendation`, `requirement`, `block` ou `conditional_allowed`. Ele diz qual consequência o cliente atribuiu ao requisito.

O **estado técnico atual** é registrado em avaliação humana baseada nas evidências e na versão de política aplicável:

| Estado | Significado operacional |
|---|---|
| `not_assessed` | Ainda não há avaliação válida para o requisito/escopo atual. |
| `insufficient_evidence` | Evidência ausente, ilegível, vencida ou insuficiente para concluir. |
| `nonconforming` | Profissional autorizado concluiu que o critério não foi atendido e registrou fundamento. |
| `conforming` | Profissional autorizado concluiu, com evidência e fundamento, que o critério foi atendido. |
| `not_applicable` | Profissional autorizado justificou por que o requisito não se aplica; política/fonte precisa permitir essa classificação. |

Ausência de dado não equivale a conformidade. O sistema não converte estado nem interpreta documento automaticamente.

## Compatibilidade com o gate legado

O runtime ainda usa `RigorLevel = inform | authorization | block`, enquanto este contrato candidato usa efeitos `recommendation | requirement | block | conditional_allowed` e estados técnicos separados. Os nomes parecidos não definem equivalência. No fluxo legado, `evaluateIntegrationGate` deixa `ready=false` com qualquer blocker e a função de aprovação recusa enquanto isso ocorrer; a classificação de rigor é exibida e produz `hardBlockers`, mas não abre uma decisão condicionada. Portanto nem `inform` autoriza ingresso com pendência, nem `authorization` significa `conditional_allowed`.

Há também uma limitação de leitura: blockers de critério têm formato `documentKind · título: motivo`, mas a consulta atual ao nível de rigor usa todo o texto antes de `:` como chave; isso não equivale ao `documentKind` isolado e pode cair no nível padrão. Bloqueios globais também não possuem código de requisito. Não usar a saída/label atual para preencher efeito ou estado candidato; corrigir o contrato estruturado e validar a política atual em etapa própria antes de alterar a decisão ativa.

## Resultados de avaliação legados

O formulário profissional atual registra `atende`, `pendente`, `inconclusivo` ou `nao_aplicavel`; para `pendente` e `inconclusivo` exige responsável e próximo passo. Ausência de avaliação é observável separadamente quando não há revisão atual para o recibo/regra.

| Resultado legado | Relação aproximada | O que falta para conversão segura |
|---|---|---|
| `atende` | candidato `conforming` | A semântica é próxima, mas exige preservar evidência e fundamento do registro original e confirmar que a avaliação continua atual para o caso/política. |
| `pendente` | nenhum estado único | Pode representar não conformidade ou trabalho de correção ainda não concluído; não converter automaticamente em `nonconforming`. |
| `inconclusivo` | candidato `insufficient_evidence` | A intenção é próxima, mas conservar o motivo e verificar se a insuficiência decorre de evidência ou de revisão inconclusiva. |
| `nao_aplicavel` | candidato `not_applicable` | O fluxo atual aceita o resultado profissional; o candidato exige que a política permita a classificação e justificativa explícita. Essa autorização não pode ser presumida. |
| sem avaliação atual | candidato `not_assessed` | Só pode ser produzido após a extração autoritativa confirmar ausência de avaliação vigente para o requisito e escopo. |

O campo legado `result` e sua revisão devem permanecer intactos na origem. A conversão, se necessária após criar a associação requisito→`requirement_code`, requer revisão humana que escolha o estado candidato, preservando referência e digest da avaliação original; não é operação de importação automática.

## Consequência por efeito e estado

| Efeito da política | Estado que impede ingresso | O que o gestor pode decidir |
|---|---|---|
| `recommendation` | Nenhum bloqueio automático pela política; recomendação continua visível. | Seguir o fluxo gerencial permitido, sem reescrever análise técnica. |
| `requirement` | `not_assessed`, `insufficient_evidence` ou `nonconforming` mantém ação corretiva aberta; não significa aceitação automática. | Solicitar correção antes do ingresso ou devolver à SST. Ingresso condicionado somente se a versão da regra autorizar expressamente essa consequência. |
| `block` | Qualquer estado não resolvido, inclusive ausência/insuficiência de evidência ou não conformidade atual. | Não pode liberar nem aceitar exceção. Pode exigir correção ou devolver para reavaliação. |
| `conditional_allowed` | O estado atual precisa estar explícito e a política deve permitir tratar aquela pendência como condicionável. | Gestor com grant pode autorizar ingresso condicionado, com justificativa/plano e prazo; pendência permanece aberta. |

Uma nova avaliação favorável (`conforming` ou `not_applicable` autorizado) pode encerrar a **pendência operacional atual** e permitir nova liberação técnica, mesmo que a política mantenha `block` como consequência para futuras ocorrências. Isso não modifica o efeito da política, não cria exceção gerencial e não apaga a avaliação/bloqueio anteriores: grava uma nova avaliação ligada à evidência e às versões usadas.

Se houver vários requisitos, a liberação considera todos os itens vigentes no escopo. Um requisito obrigatório ainda não resolvido mantém o caso bloqueado. Decisão condicionada não converte pendência bloqueante em condicional.

## Ciclo de reavaliação

1. A análise registra por requisito o estado, evidências/revisões, fundamento, profissional autenticado, atribuição válida e política utilizada.
2. Quando entra evidência nova, a avaliação anterior deixa de ser atual para a nova compilação, mas continua no histórico.
3. SST autorizado revisa a evidência e emite nova avaliação, sem editar a anterior.
4. O sistema agrega estados registrados conforme efeitos/configuração da política versionada; não conclui conformidade a partir do texto ou do upload.
5. A autoridade técnica decide se emite nova liberação técnica, conforme sua concessão e escopo. A decisão gerencial permanece separada.
6. Uma nova versão de política exige nova avaliação para decisões futuras; não reescreve histórico nem altera mobilização sozinha.

## Limites por ator

- Terceiro pode enviar evidências próprias; envio não muda o estado técnico.
- SST da consultoria pode recomendar e reavaliar apenas após atribuição ativa; não concede a si autoridade do cliente nem decide mobilização.
- SST do cliente pode emitir requisito, bloqueio e nova avaliação/liberação técnica somente com grant e escopo próprios.
- Gestor/dono pode escolher entre opções gerenciais permitidas e registrar plano/justificativa; não altera estado técnico, efeito da política ou parecer SST.
- Admin e SaaS Master não alteram avaliações para resolver fluxo; APIs não emitem avaliações ou decisões humanas.

## Registro mínimo candidato

Cada avaliação preserva: requisito e escopo; estado; efeito e versão da política consultada; referências/fingerprints das evidências; profissional e atribuição; justificativa/fundamento; timestamps do servidor; avaliação anterior substituída como atual; resultado agregado e pendências. Uma liberação aponta para a avaliação atual e o conjunto de requisitos verificados. Conteúdo médico não deve ser copiado à trilha administrativa.

## Casos de aceite

1. `block` + evidência ausente/insuficiente: não libera ingresso nem permite exceção gerencial.
2. `block` + não conformidade atual: gestor não autoriza ingresso condicionado.
3. `block` + evidência nova + avaliação favorável por SST autorizado: pode haver nova liberação técnica; o bloqueio anterior permanece histórico.
4. `conditional_allowed` + pendência não conforme: gestor autorizado pode decidir ingresso condicionado com plano; a pendência permanece aberta e rastreável.
5. Atualizar política ou anexar arquivo sem reavaliação não libera mobilização.
6. Reavaliação por consultoria sem atribuição ou grant vigentes é negada.
7. API, admin, gestor e SaaS Master não podem fabricar estado/parecer técnico.

## Pendências de implementação

O schema candidato ganhou tabelas de avaliação por requisito, mas ainda não há fonte de evidência/fluxo autoritativa ligada a elas nem função de autorização/escrita. Não aplicar essa semântica por heurística no runtime: primeiro reconciliar IDs/versões de avaliação/evidência, implementar função transacional com auditoria e provar em PostgreSQL descartável.
