import { checkPostgresConnection } from "@/lib/postgres";

export async function GET() {
  const healthy = await checkPostgresConnection();
  return Response.json(
    { status: healthy ? "ok" : "unavailable" },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
