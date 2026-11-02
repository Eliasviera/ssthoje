import test from 'node:test';
import assert from 'node:assert/strict';
import { digestLegacySnapshot, prepareLegacyRigorImportCandidate } from '../src/lib/third-party-rigor-import-candidate.mjs';

const policy = {
  tenantId: 'consultoria-demo', companyId: 'cliente-demo', unitId: 'unidade-demo', version: 1,
  validFrom: '2026-10-17', createdAt: '2026-10-17T12:00:00-03:00', createdBy: 'autor-legado-demo',
  reviewer: 'revisor-legado-demo', defaultLevel: 'authorization', levels: { PGR: 'block' },
};
const clients = [{ tenantId: 'consultoria-demo', id: 'cliente-demo', status: 'active', units: [{ id: 'unidade-demo' }] }];

test('prepara snapshot legado v1 sem converter alegações em autoria verificada', () => {
  const candidate = prepareLegacyRigorImportCandidate({ policies: [policy] }, clients);
  assert.equal(candidate.expectedVersion, 0);
  assert.equal(candidate.nextVersion, 1);
  assert.equal(candidate.reviewerClaim, 'revisor-legado-demo');
  assert.deepEqual(candidate.legacySnapshot, policy);
  assert.equal(candidate.sourceDigest, digestLegacySnapshot(policy));
  assert.equal(candidate.scope.companyActive, true);
});

test('digest é estável diante da ordem das propriedades e muda quando o snapshot muda', () => {
  const reordered = Object.fromEntries(Object.entries(policy).reverse());
  assert.equal(digestLegacySnapshot(policy), digestLegacySnapshot(reordered));
  assert.notEqual(digestLegacySnapshot(policy), digestLegacySnapshot({ ...policy, defaultLevel: 'block' }));
});

test('recusa histórico incompleto, empresa/unidade inativa ou referências ambíguas', () => {
  assert.throws(() => prepareLegacyRigorImportCandidate({ policies: [{ ...policy, version: 2 }] }, clients), /LEGACY_VERSION_HISTORY_INCOMPLETE/);
  assert.throws(() => prepareLegacyRigorImportCandidate({ policies: [policy] }, [{ ...clients[0], status: 'archived' }]), /COMPANY_SCOPE_INACTIVE/);
  assert.throws(() => prepareLegacyRigorImportCandidate({ policies: [policy] }, [{ ...clients[0], units: [] }]), /UNIT_REFERENCE_AMBIGUOUS/);
  assert.throws(() => prepareLegacyRigorImportCandidate({ policies: [policy] }, [clients[0], clients[0]]), /COMPANY_REFERENCE_AMBIGUOUS/);
});

test('não prepara mais de uma política nem fontes malformadas', () => {
  assert.throws(() => prepareLegacyRigorImportCandidate({ policies: [policy, { ...policy, companyId: 'outro' }] }, clients), /SOURCE_CARDINALITY_INVALID/);
  assert.throws(() => prepareLegacyRigorImportCandidate({ policies: [policy] }, null), /SOURCE_CARDINALITY_INVALID/);
});
