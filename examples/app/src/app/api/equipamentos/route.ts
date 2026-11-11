import { NextResponse } from "next/server";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { createEquipment } from "@/lib/equipment-inventory-store";

export async function POST(request: Request) {
  const access = await getCurrentTenantAccess("operations.manage");
  if (!access.authenticated || !access.context) return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  const { tenant, membership } = access.context;
  if (!hasTenantPermission(membership.role, "operations.manage")) return NextResponse.json({ error: "Seu perfil não pode cadastrar equipamentos." }, { status: 403 });
  const formData = await request.formData();
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  try {
    const equipment = createEquipment({
      tenantId: tenant.id,
      companyId: tenant.id === "tenant-horizonte" ? "9ce34336-c3c5-4598-a315-8ec457ca27ae" : "",
      unitId: tenant.id === "tenant-horizonte" ? "37616fc1-9a46-4e0a-b872-51eefe695253" : "",
      code: text("code"), name: text("name"), brandModel: text("brandModel") || undefined,
      sector: text("sector") || undefined, location: text("location") || undefined,
      checklistTemplateId: text("templateId") || undefined,
      requiredFrequency: (text("frequency") || undefined) as "antes_uso" | "diario" | "semanal" | "mensal" | undefined,
      actorUserId: access.session.userId,
    });
    return NextResponse.json({ ok: true, equipment: { id: equipment.id, code: equipment.code, name: equipment.name } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível cadastrar." }, { status: 400 });
  }
}
