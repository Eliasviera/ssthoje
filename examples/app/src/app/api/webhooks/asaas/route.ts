import { handleAsaasWebhook } from "@/lib/asaas-handler";
export async function POST(request: Request) { return handleAsaasWebhook(request); }
