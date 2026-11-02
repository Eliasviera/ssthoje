import { access } from "node:fs/promises";
import { join } from "node:path";

export async function GET() {
  try {
    await access(join(process.cwd(), "data"));
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "degraded" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
