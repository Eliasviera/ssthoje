-- Inclui PAE e Brigada de Incêndio como documentos configuráveis do gate de Terceiros.
-- Mesmo padrão da 0010 (O.S.). Histórico e RLS permanecem inalterados.
ALTER TABLE sst.third_party_requirement_items DROP CONSTRAINT IF EXISTS third_party_requirement_items_document_kind_check;
ALTER TABLE sst.third_party_compliance_rules DROP CONSTRAINT IF EXISTS third_party_compliance_rules_document_kind_check;
ALTER TABLE sst.third_party_document_evaluations DROP CONSTRAINT IF EXISTS third_party_document_evaluations_document_kind_check;

ALTER TABLE sst.third_party_requirement_items ADD CONSTRAINT third_party_requirement_items_document_kind_check CHECK (document_kind IN ('PGR', 'PCMSO', 'LTCAT', 'Ficha de EPI', 'Treinamento', 'O.S.', 'PAE', 'Brigada de Incêndio', 'Outro', 'ASO'));
ALTER TABLE sst.third_party_compliance_rules ADD CONSTRAINT third_party_compliance_rules_document_kind_check CHECK (document_kind IN ('PGR', 'PCMSO', 'LTCAT', 'Ficha de EPI', 'Treinamento', 'O.S.', 'PAE', 'Brigada de Incêndio', 'Outro'));
ALTER TABLE sst.third_party_document_evaluations ADD CONSTRAINT third_party_document_evaluations_document_kind_check CHECK (document_kind IN ('PGR', 'PCMSO', 'LTCAT', 'Ficha de EPI', 'Treinamento', 'O.S.', 'PAE', 'Brigada de Incêndio', 'Outro'));
