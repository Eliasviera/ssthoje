import type { EpiItem } from "./epi-store";

export type EpiOfflineDraft = {
  id: string;
  scopeKey: string;
  workerId: string;
  deliveredOn: string;
  items: EpiItem[];
  capturedAt: string;
};

const databaseName = "sst-epi-offline";
const storeName = "drafts";

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Armazenamento offline não disponível neste navegador."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        const store = database.createObjectStore(storeName, { keyPath: "id" });
        store.createIndex("scopeKey", "scopeKey", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento offline."));
    request.onblocked = () => reject(new Error("Atualize as outras abas do SST Hoje para preparar o armazenamento offline."));
  });
}

export async function listEpiOfflineDrafts(scopeKey: string): Promise<EpiOfflineDraft[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).index("scopeKey").getAll(scopeKey);
      request.onsuccess = () => resolve(request.result as EpiOfflineDraft[]);
      request.onerror = () => reject(request.error ?? new Error("Não foi possível ler os registros offline."));
      transaction.onabort = () => reject(transaction.error ?? new Error("A leitura dos registros offline foi interrompida."));
    });
  } finally { database.close(); }
}

export async function saveEpiOfflineDraft(draft: EpiOfflineDraft): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).add(draft);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Não foi possível salvar neste dispositivo."));
      transaction.onabort = () => reject(transaction.error ?? new Error("O salvamento offline foi interrompido."));
    });
  } finally { database.close(); }
}

export async function deleteEpiOfflineDraft(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Não foi possível remover o rascunho."));
      transaction.onabort = () => reject(transaction.error ?? new Error("A remoção do rascunho foi interrompida."));
    });
  } finally { database.close(); }
}
