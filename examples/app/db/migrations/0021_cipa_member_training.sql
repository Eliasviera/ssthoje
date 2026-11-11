-- NR-5 (CIPA) — treinamento por membro da CIPA.
-- O item 5.7.1 exige treinamento antes da posse para titulares e suplentes, com validade e
-- reaproveitamento de 2 anos (5.7.3). A Fase 3 guardou estabilidade e mandato, mas não o
-- treinamento individual — esta migration acrescenta isso sem tocar no histórico.
--
-- A referência de carga horária e prazo por grau de risco continua no catálogo
-- nr5_training_requirements (0016), não em constante de código.

ALTER TABLE sst.cipa_members
  ADD COLUMN training_completed_on date,
  ADD COLUMN training_valid_until date,
  ADD COLUMN training_hours numeric(4,1) CHECK (training_hours IS NULL OR training_hours > 0),
  ADD COLUMN training_certificate_document_id text
    CHECK (training_certificate_document_id IS NULL OR length(training_certificate_document_id) <= 200);

-- A validade só faz sentido quando existe data de conclusão e vice-versa.
ALTER TABLE sst.cipa_members
  ADD CONSTRAINT cipa_members_training_pair_check
  CHECK ((training_valid_until IS NULL) = (training_completed_on IS NULL));

-- Apoio ao painel: treinamentos vencendo.
CREATE INDEX cipa_members_training_idx
  ON sst.cipa_members (tenant_id, training_valid_until)
  WHERE status = 'active' AND training_valid_until IS NOT NULL;
