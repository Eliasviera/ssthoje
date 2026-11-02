# Política de rigor do cliente para mobilização de terceiros

Critério operacional da consultoria. Não é regra normativa e deve ter responsável, versão e vigência definidos pelo cliente antes de uso operacional.

## Níveis por requisito

| Nível | Efeito no relatório |
| --- | --- |
| Informar | Mostra a pendência; não bloqueia a integração. |
| Exigir autorização | Mostra a pendência e requer decisão do gestor autorizado e justificativa antes de permitir a integração, desde que a política vigente permita essa opção. |
| Bloquear integração | Mantém o resultado como `Com pendências`; não permite liberação negociada até nova avaliação favorável. |

## Aplicação

A política pertence à empresa cliente e varia por unidade, escopo ou requisito documental. Cada versão publicada tem um início de vigência; ela se aplica até a versão seguinte daquela unidade. Uma decisão usa a versão mais recente cujo início não seja posterior ao instante da decisão, e guarda esse identificador/fingerprint. As referências normativas dentro da política mantêm seus próprios períodos de vigência; não confundir vigência de norma com início da versão operacional.

Exemplos de requisitos configuráveis: PGR assinado, aptidão administrativa do ASO, função coberta pelo PGR, treinamento previsto e O.S. solicitada.

## Registro da decisão

Uma decisão com pendências autorizadas precisa guardar: identificador da decisão, empresa, unidade, escopo, pendências consideradas, gestor responsável, justificativa, referência da análise SST, data e versão da política. Qualquer mudança nos documentos, avaliações, atribuições ou política exige nova compilação.

## Separação entre análise e aprovação

O analista de SST registra a avaliação documental e pode manter o resultado como `Com pendências`. O gestor de contrato decide somente entre as opções expressamente permitidas pela política vigente e por seu grant. Uma pendência atual com efeito `block` não pode ser aceita como exceção gerencial. Ela só deixa de bloquear após evidência nova e avaliação favorável de SST autorizado, registrada como nova revisão; uma nova liberação técnica pode então ser emitida sem apagar o bloqueio anterior. Uma pendência com efeito `conditional_allowed` pode resultar em ingresso condicionado por decisão do gestor autorizado, com justificativa/plano registrados e pendência ainda aberta. Sem autorização aplicável, o caso permanece bloqueado e deve retornar à SST ou à revisão responsável da política. Efeito da política e estado técnico atual são dimensões separadas; ver `docs/M22_ESTADOS_AVALIACAO_TECNICA.md`.

O sistema deve manter no histórico quem analisou, quem aprovou, as pendências aceitas, a justificativa, a data e a versão da política aplicada.

## Tela de configuração

A tela futura de política exige `thirdparty.policy.manage` para o tenant/empresa/unidade. Admin do tenant não recebe esse poder apenas por administrar usuários; gestor que decide mobilização também não o recebe automaticamente. Se o cliente não tiver SST, owner/gestor designa separadamente o responsável de política, sem fundir esse grant ao de decisão. Para cada empresa e unidade, a tela exibirá requisitos e permitirá configurar `informar`, `exigir autorização` ou `bloquear integração`, conforme opções do produto. Ao publicar, criará nova versão com início futuro ou corrente, preservará a anterior, registrará auditoria e exigirá nova compilação dos relatórios afetados. Não aceitar publicação retroativa nem duas versões com mesmo início. O papel de consultoria não concede autoridade sobre a política do cliente por si só.


## Vínculos confirmados em 2026-10-18
O gestor aprovador pertence à empresa cliente. A análise cabe ao TST do cliente, quando houver, ou à consultoria atribuída; não à terceira. A falta de TST próprio não impede a análise pela consultoria. Atribuições e escopos devem ser explícitos; não inferir exigência profissional pelo porte/grau de risco.
