import { readFileSync } from "node:fs";
import { join } from "node:path";

export type LocalDataFile = "aso.json" | "clients.json" | "workers.json" | "operations.json" | "third-party.json" | "epi.json" | "documents.json" | "compliance.json";

// Caminhos explícitos evitam que o compilador rastreie todo o diretório data.
// Resolvidos por chamada para preservar o diretório de fixtures dos testes.
export function readLocalDataText(file: LocalDataFile): string {
  switch (file) {
    case "aso.json": return readFileSync(join(process.cwd(), "data/aso.json"), "utf8");
    case "clients.json": return readFileSync(join(process.cwd(), "data/clients.json"), "utf8");
    case "workers.json": return readFileSync(join(process.cwd(), "data/workers.json"), "utf8");
    case "operations.json": return readFileSync(join(process.cwd(), "data/operations.json"), "utf8");
    case "third-party.json": return readFileSync(join(process.cwd(), "data/third-party.json"), "utf8");
    case "epi.json": return readFileSync(join(process.cwd(), "data/epi.json"), "utf8");
    case "documents.json": return readFileSync(join(process.cwd(), "data/documents.json"), "utf8");
    case "compliance.json": return readFileSync(join(process.cwd(), "data/compliance.json"), "utf8");
    default: throw new Error("Arquivo local não permitido.");
  }
}
