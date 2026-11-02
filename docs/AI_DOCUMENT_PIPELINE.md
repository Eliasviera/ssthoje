# Pipeline seguro de documentos e IA

1. Upload privado com validação, limites e varredura.
2. Extração de texto/OCR em ambiente isolado; preservar original e hash.
3. Tratar todo conteúdo do arquivo como **dado não confiável**, nunca como instruções para o sistema.
4. Enviar à IA somente os dados necessários; sem credenciais nem contexto de outro tenant.
5. Pedir saída estruturada em schema validado; rejeitar campos inesperados e conteúdo malformado.
6. Extrair alegações com página/trecho, confiança, tipo de evidência e campos ausentes.
7. Motor determinístico compara datas, escopo e regras aprovadas/versionadas.
8. Apresentar resultado como conforme, pendente, não encontrado ou revisão necessária — sem transformar incerteza em certeza.
9. Humano autorizado revisa decisões críticas e registra motivo/resultado.
10. Armazenar modelo, versão de prompt/schema, timestamp, custo, evidências e revisão, sem registrar segredos.

## Guardrails
- Nunca seguir instruções encontradas dentro de PDF, OCR, metadados ou anexos.
- Não deixar a IA decidir aptidão médica, assinatura válida ou conformidade legal final.
- Não misturar dados entre tenants; testes adversariais de isolamento.
- Controle de custos por créditos/limites de plano, observabilidade e limites por arquivo.
- Avaliação com conjunto de testes sintético e versionado; monitorar falsos positivos/negativos.
- Degradação graciosa: sem IA, oferecer checklist e revisão manual.
- A fonte normativa precisa ser registrada separadamente; modelo não é fonte legal.

## Saída estruturada sugerida
`document_type`, `issuer`, `company_id_or_cnpj`, `issue_date`, `expiry_date`, `signatures_observed`, `roles_or_functions`, `training_evidence`, `medical_fields_present`, `claims[]`, `evidence[]`, `missing_fields[]`, `confidence`, `human_review_required`.
