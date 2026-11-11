import type { ChecklistInspection } from "./checklist-store";

// Fila offline de checklists (e depois DDS/APR): quando não há internet,
// a inspeção é guardada localmente no navegador (IndexedDB) e sincronizada
// assim que a rede voltar. Mesmo padrão do epi-offline-queue.

export type PendingInspection = {
  id: string;
  tenantId: string;
  templateId: string;
  companyId: string;
  unitId: string;
  subject: string;
  performedOn: string;
  inspector: string;
  answers: Record<string, { answer: string; note: string }>;
  freeNotes: { label: string; text: string }[];
  image: string;
  capturedAt: string;
};

const databaseName = "sst-checklist-offline";
const storeName = "pending";

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Armazenamento offline não disponível neste navegador."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento offline."));
    request.onblocked = () => reject(new Error("Atualize as outras abas do SST Hoje para preparar o armazenamento offline."));
  });
}

export async function queueInspection(pending: PendingInspection): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(pending);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Não foi possível enfileirar a inspeção."));
  });
}

export async function listPendingInspections(tenantId: string): Promise<PendingInspection[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve((request.result as PendingInspection[]).filter((entry) => entry.tenantId === tenantId));
    request.onerror = () => reject(request.error ?? new Error("Não foi possível ler a fila offline."));
  });
}

export async function removePendingInspection(id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Não foi possível remover a inspeção da fila."));
  });
}
