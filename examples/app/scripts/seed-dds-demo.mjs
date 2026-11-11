import { createDds, attachDdsPhoto, setDdsTheme } from "../src/lib/dds-store.ts";
import { readFileSync } from "node:fs";

const TENANT = "tenant-horizonte";
const EMA = "9ce34336-c3c5-4598-a315-8ec457ca27ae";
const UNIT = "37616fc1-9a46-4e0a-b872-51eefe695253";

const workers = JSON.parse(readFileSync(new URL("../data/workers.json", import.meta.url), "utf8"));
const participantes = workers.slice(0, 5).map((x) => ({ workerId: x.id, workerName: x.displayName }));

const dds = createDds({
  tenantId: TENANT, companyId: EMA, unitId: UNIT,
  heldOn: "2026-11-05", location: "Galpão de fabricação — início do turno",
  responsible: "João Pedro Cardoso — ENCARREGADO", conductorRole: "lideranca",
  notes: "DDS de demonstração — tema do acervo: proteção das mãos.",
  attendees: participantes, actorUserId: "sst-demo-user",
});
console.log("DDS criado:", dds.id, "| conductor:", dds.conductorRole);

// JPEG sintético com magic ffd8ff e >= 1000 bytes, barrando o limite do store.
const base = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";
const b64 = Array.from({ length: 7 }, () => base.replace(/==/g, "")).join("") + "==";
const image = "data:image/jpeg;base64," + b64;

const comFoto = attachDdsPhoto({ tenantId: TENANT, id: dds.id, revision: dds.revision, image, actorUserId: "sst-demo-user" });
const comTema = setDdsTheme({ tenantId: TENANT, id: dds.id, revision: comFoto.revision, theme: "Proteção das mãos", actorUserId: "sst-demo-user" });
console.log("foto + tema:", comTema.theme, "| status:", comTema.status, "| revision:", comTema.revision);
