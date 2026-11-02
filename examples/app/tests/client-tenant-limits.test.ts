import assert from "node:assert/strict";
import test from "node:test";
import {
  assertClientLimitsWithinPlatformCeilings,
  assertTenantUsageWithinLimits,
  type TenantLimitValues,
} from "../src/lib/client-tenant-limits.ts";

const values = (users: number, companies: number, workers: number, storageBytes: number): TenantLimitValues => ({
  users,
  companies,
  workers,
  storageBytes,
});

test("cliente pode definir limites iguais ou menores que os tetos sem ficar abaixo do uso", () => {
  assert.doesNotThrow(() => assertClientLimitsWithinPlatformCeilings(
    values(5, 10, 100, 1_000_000),
    values(10, 20, 200, 2_000_000),
    values(2, 4, 50, 500_000),
  ));
  assert.doesNotThrow(() => assertClientLimitsWithinPlatformCeilings(
    values(2, 4, 50, 500_000),
    values(2, 4, 50, 500_000),
    values(2, 4, 50, 500_000),
  ));
});

test("cliente não pode elevar qualquer limite acima do teto da plataforma", () => {
  assert.throws(() => assertClientLimitsWithinPlatformCeilings(
    values(11, 10, 100, 1_000_000),
    values(10, 20, 200, 2_000_000),
    values(2, 4, 50, 500_000),
  ), /usuários ativos.*teto definido pela plataforma/);
  assert.throws(() => assertClientLimitsWithinPlatformCeilings(
    values(5, 10, 100, 2_000_001),
    values(10, 20, 200, 2_000_000),
    values(2, 4, 50, 500_000),
  ), /armazenamento.*teto definido pela plataforma/);
});

test("limite não pode ficar abaixo do uso existente e dados não são apagados", () => {
  assert.throws(() => assertClientLimitsWithinPlatformCeilings(
    values(1, 10, 100, 1_000_000),
    values(10, 20, 200, 2_000_000),
    values(2, 4, 50, 500_000),
  ), /usuários ativos.*uso atual.*Nenhum dado foi removido/);
});

test("valores negativos, fracionários ou fora do intervalo seguro são recusados", () => {
  for (const invalid of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
    assert.throws(() => assertClientLimitsWithinPlatformCeilings(
      values(invalid, 10, 100, 1_000_000),
      values(10, 20, 200, 2_000_000),
      values(2, 4, 50, 500_000),
    ), /inteiro não negativo/);
  }
});

test("verificação pré-operação bloqueia nova gravação ao atingir a cota", () => {
  assert.doesNotThrow(() => assertTenantUsageWithinLimits(values(4, 9, 99, 999), values(5, 10, 100, 1000), "users"));
  assert.throws(() => assertTenantUsageWithinLimits(values(5, 9, 99, 999), values(5, 10, 100, 1000), "users"), /Limite de usuários ativos atingido/);
});
