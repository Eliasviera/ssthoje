import assert from "node:assert/strict";
import test from "node:test";
import {
  createInvitationToken,
  hashAccountPassword,
  hashInvitationToken,
  validateAccountPassword,
  verifyAccountPassword,
} from "../src/lib/account-credentials.ts";

test("senhas são armazenadas com scrypt e sal aleatório", async () => {
  const first = await hashAccountPassword("Senha fictícia segura 01!");
  const second = await hashAccountPassword("Senha fictícia segura 01!");
  assert.notEqual(first, second);
  assert.equal(await verifyAccountPassword("Senha fictícia segura 01!", first), true);
  assert.equal(await verifyAccountPassword("Outra senha fictícia 02!", first), false);
});

test("formato de hash malformado ou com parâmetros diferentes falha fechado", async () => {
  assert.equal(await verifyAccountPassword("Senha fictícia segura 01!", "scrypt$1$1$1$bad$bad"), false);
  assert.equal(await verifyAccountPassword("Senha fictícia segura 01!", "invalid"), false);
  assert.equal(await verifyAccountPassword("Senha fictícia segura 01!", "scrypt$32768$8$1$!!!!$!!!!"), false);
});

test("senha de ativação respeita limites de comprimento", () => {
  assert.throws(() => validateAccountPassword("curta"), /entre 12 e 256 caracteres/);
  assert.throws(() => validateAccountPassword("x".repeat(257)), /entre 12 e 256 caracteres/);
  assert.doesNotThrow(() => validateAccountPassword("Senha fictícia segura 01!"));
});

test("convite usa token aleatório e só expõe digest ao armazenamento", () => {
  const token = createInvitationToken();
  assert.equal(token.length, 43);
  assert.notEqual(hashInvitationToken(token), token);
  assert.equal(hashInvitationToken(token), hashInvitationToken(token));
  assert.notEqual(hashInvitationToken(token), hashInvitationToken(createInvitationToken()));
  assert.throws(() => hashInvitationToken("token-curto"), /Convite inválido/);
  assert.throws(() => hashInvitationToken(`${token.slice(0, -1)}.`), /Convite inválido/);
});
