-- NR-5 (CIPA) — Fase 1: categorias documentais da CIPA.
-- Mesmo padrão da 0010 (O.S.) e da 0014 (PAE/Brigada). Histórico e RLS permanecem inalterados.
-- Base normativa: NR-05 atualizada 2022 (Portaria MTP nº 4.219/2022).
ALTER TABLE sst.third_party_requirement_items DROP CONSTRAINT IF EXISTS third_party_requirement_items_document_kind_check;
ALTER TABLE sst.third_party_compliance_rules DROP CONSTRAINT IF EXISTS third_party_compliance_rules_document_kind_check;
ALTER TABLE sst.third_party_document_evaluations DROP CONSTRAINT IF EXISTS third_party_document_evaluations_document_kind_check;

ALTER TABLE sst.third_party_requirement_items ADD CONSTRAINT third_party_requirement_items_document_kind_check CHECK (document_kind IN ('PGR', 'PCMSO', 'LTCAT', 'Ficha de EPI', 'Treinamento', 'O.S.', 'PAE', 'Brigada de Incêndio', 'Ata de CIPA', 'Quadro de CIPA', 'Edital de Eleição da CIPA', 'Calendário de Reuniões da CIPA', 'Outro', 'ASO'));
ALTER TABLE sst.third_party_compliance_rules ADD CONSTRAINT third_party_compliance_rules_document_kind_check CHECK (document_kind IN ('PGR', 'PCMSO', 'LTCAT', 'Ficha de EPI', 'Treinamento', 'O.S.', 'PAE', 'Brigada de Incêndio', 'Ata de CIPA', 'Quadro de CIPA', 'Edital de Eleição da CIPA', 'Calendário de Reuniões da CIPA', 'Outro'));
ALTER TABLE sst.third_party_document_evaluations ADD CONSTRAINT third_party_document_evaluations_document_kind_check CHECK (document_kind IN ('PGR', 'PCMSO', 'LTCAT', 'Ficha de EPI', 'Treinamento', 'O.S.', 'PAE', 'Brigada de Incêndio', 'Ata de CIPA', 'Quadro de CIPA', 'Edital de Eleição da CIPA', 'Calendário de Reuniões da CIPA', 'Outro'));
