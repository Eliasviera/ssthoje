import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCompanyPgrDigitalization } from "../src/lib/pgr-digitalization-store.ts";

test("digitalização só aparece após aplicação e não atravessa tenant ou empresa", () => {
  const before=process.cwd();
  process.chdir(mkdtempSync(join(tmpdir(),"pgr-digitalization-")));
  try {
    const directory=join("data","pgr-digitalization","tenant-a","company-a");
    mkdirSync(directory,{recursive:true});
    const source={tenantId:"tenant-a",companyId:"company-a",sha256:"a".repeat(64),documentId:"document-a",inventoryId:"inventory-a"};
    writeFileSync(join(directory,"imported-v1.json"),JSON.stringify(source));
    assert.equal(readCompanyPgrDigitalization("tenant-a","company-a"),null);
    writeFileSync(join(directory,"applied-v1.json"),JSON.stringify({...source,profileFile:"imported-v1.json"}));
    assert.equal(readCompanyPgrDigitalization("tenant-a","company-a")?.documentId,"document-a");
    assert.equal(readCompanyPgrDigitalization("tenant-b","company-a"),null);
    assert.equal(readCompanyPgrDigitalization("tenant-a","company-b"),null);
    assert.equal(readCompanyPgrDigitalization("../tenant-a","company-a"),null);
    writeFileSync(join(directory,"imported-v2.json"),JSON.stringify({...source,tenantId:"tenant-b"}));
    writeFileSync(join(directory,"applied-v2.json"),JSON.stringify({...source,profileFile:"imported-v2.json"}));
    assert.throws(()=>readCompanyPgrDigitalization("tenant-a","company-a"),/incompatível/);
  } finally {process.chdir(before);}
});
