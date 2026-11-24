import "server-only";
import * as store from "./aso-store";
import { listMedicalUnitScopes } from "./pcmso-service";
export const listAsoWorkers = (userId: string) => store.listAsoWorkers(userId, listMedicalUnitScopes);
export const listMedicalAsos = (userId: string) => store.listMedicalAsos(userId, listMedicalUnitScopes);
export { listAsoAuditSignals, listAsoSummaries } from "./aso-store";
export const saveAso = (userId: string, workerId: string, expectedVersion: number, input: store.AsoContent, id?: string) => store.saveAso(userId, workerId, expectedVersion, input, id, listMedicalUnitScopes);
export const transitionAso = (userId: string, id: string, expectedVersion: number, operation: "submit" | "review") => store.transitionAso(userId, id, expectedVersion, operation, listMedicalUnitScopes);
