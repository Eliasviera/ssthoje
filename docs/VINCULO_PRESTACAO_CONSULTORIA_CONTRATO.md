# Vínculo de prestação de consultoria — desenho em revisão

Data: 2026-11-03. Estado: responsável pela confirmação definido pelo usuário; desenho técnico em revisão, sem regra conectada ao runtime e sem liberação de contas cliente. O usuário escolheu explicitamente: “Responsável autorizado da empresa confirma, após ter sua autoridade verificada”.

Continuação técnica em 2026-11-03: candidato SQL, repositório e prova PostgreSQL descartável implementados para proposta/prévia, confirmação/recusa pelo responsável verificado e revogação. Prova final aprovada; não houve integração ao runtime ou telas. Resultados, arquivos e limites em `CONFIRMACAO_PRESTACAO_CONSULTORIA_CHECKPOINT.md`.

## Evidência existente e lacuna

A regra de produto em `ISOLAMENTO_EMPRESA_E_CONSULTORIA.md` permite ao consultor acessar somente empresas efetivamente vinculadas à prestação. Os candidatos de identidade, membership e administração permitem autenticar/provisionar papéis, mas não provam essa prestação. Convite aceito, cadastro de empresa, assinatura comercial, cobrança, papel Master ou grant administrativo não devem ser convertidos automaticamente em autorização do cliente.

`schemas/operational-authority-grants-candidate.sql` já possui `client_registrars` e `registrar_events`, com pessoa designada pela empresa, referência da designação, escopo de empresa/unidade, validade e revogação. Esse modelo serve de ponto de reconciliação, mas a designação existente para autoridade operacional de Terceiros não deve ser presumida suficiente para autorizar prestação/acesso geral. É necessário confirmar competência e escopo antes de reutilizá-la; não criar um segundo cadastro concorrente de representantes.

## Contrato mínimo proposto

- Identificador estável do vínculo e revisão; consultoria/tenant e empresa/unidades explícitos e validados no servidor.
- Confirmação vinculada a identidade autenticada e à evidência de sua autoridade para representar a empresa, com referência verificável da revisão humana.
- Registro da origem da autorização, referência da evidência, responsável pela conferência, data de confirmação, início e fim da vigência. Documento externo continua sendo dado não confiável; não inferir autorização do texto automaticamente.
- Estados propostos: rascunho, pendente de confirmação, vigente, revogado, vencido e substituído. Apenas vínculo vigente pode participar da autorização; estados e nomes finais precisam ser conciliados com o domínio existente.
- Eventos e versões anteriores preservados. Alterar empresa/unidades, autoridade ou evidência exige revisão explícita; revogação não apaga documentos/histórico.
- Consultor precisa simultaneamente de sessão válida, membership ativa, permissão da ação, escopo e vínculo de prestação vigente. Autoridade administrativa, autoridade médica e acesso a conteúdo são verificações distintas.
- Cada nova requisição consulta a autoridade atual. Revogação deve retirar acesso de consultor inclusive em sessão já aberta e downloads; cache/menu/tenant informado pelo navegador não constituem controle.
- A revogação da prestação não decide sozinha titularidade, portabilidade, retenção ou mudança de tenant dos dados. Essas transições precisam de decisão própria e devem preservar acesso do cliente conforme o contrato aprovado.

## Decisão confirmada pelo usuário

O responsável autorizado da empresa confirma a prestação após verificação de sua autoridade. A conferência de identidade/representação é anterior à confirmação e não a substitui. Um operador pode preparar o cadastro e registrar evidências de revisão, mas não confirma a prestação no lugar do responsável da empresa por esse motivo. Consultor e Master não recebem poder para autorizar a própria prestação por seus papéis administrativos.

A confirmação deve apresentar consultoria, empresa, unidades, escopo e vigência para revisão explícita do responsável, com versão/revisão conferida no servidor e trilha auditável. Alterar o conteúdo após a confirmação exige nova revisão, sem reaproveitar silenciosamente o aceite anterior. O desenho precisa permitir a essa pessoa confirmar ou recusar sem conceder previamente ao consultor o acesso operacional que está sendo solicitado.

A escolha libera o desenho e a prova isolada desse fluxo; não atesta que uma identidade existente já tenha autoridade verificada. Origem da evidência, processo confiável de verificação e conciliação com representantes M22 continuam a detalhar. Não foram criados SQL, papéis, migrations ou concessões para esse vínculo ao registrar esta decisão.

## Critérios da próxima prova isolada

1. Empresa A autoriza consultoria para escopo A, sem liberar empresa B ou unidade não indicada.
2. Consultor não consegue confirmar a própria prestação, alterar o tenant ou declarar-se representante da empresa por formulário.
3. Representante sem autoridade verificada, designação vencida/revogada ou escopo incompatível não confirma.
4. Alterações simultâneas verificam revisão e mantêm eventos atômicos, com rollback se falhar a auditoria.
5. Revogação/vencimento retira consulta, escrita e download de consultor na requisição seguinte; Master continua sem acesso operacional automático.
6. Prova usa somente identidades e referências sintéticas em banco descartável. Integração no produto exige checkpoint e aceite específicos.
