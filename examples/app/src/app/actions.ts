"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { clearSession, createSession, getSession } from "@/lib/session";
import { findDemoAccountByEmail } from "@/lib/demo-accounts";
import { appendAuditEvent } from "@/lib/audit-log";
import { isPlatformMaster } from "@/lib/platform-identity";
import { requireTenantAccess, resolveTenantMembership } from "@/lib/tenant-access";
import { findTrialAccountByEmail, isTrialActive } from "@/lib/trial-accounts";
import { verifyTrialPassword } from "@/lib/trial-password";

export type LoginState = { error: string };

const failures = new Map<string, { count: number; windowStartedAt: number; lockedUntil: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function passwordsMatch(submitted: string, expected: string) {
  const submittedHash = createHash("sha256").update(submitted).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(submittedHash, expectedHash);
}

export async function loginAction(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";

  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 256) {
    return { error: "Confira o e-mail e a senha e tente novamente." };
  }

  const now = Date.now();
  const previous = failures.get(email);
  if (previous?.lockedUntil && previous.lockedUntil > now) {
    return { error: "Muitas tentativas. Aguarde alguns minutos antes de tentar de novo." };
  }
  if (previous && now - previous.windowStartedAt > WINDOW_MS) failures.delete(email);

  const demo = findDemoAccountByEmail(email);
  const trial = demo ? null : findTrialAccountByEmail(email);
  const account = demo ?? trial;
  const validPassword = demo ? passwordsMatch(password, demo.password)
    : trial ? isTrialActive(trial) && verifyTrialPassword(password, trial.passwordHash)
    : passwordsMatch(password, "senha-ficticia-invalida") && false;
  const clientAccount = account && resolveTenantMembership(account.userId)?.membership.role === "cliente";
  const demoWorker = demo?.userId === "sst-demo-trabalhador";
  const loginPermission = demoWorker ? "deviation.report" : clientAccount ? "dds.read" : "tenant.dashboard.read";
  const tenantAccess = account ? requireTenantAccess(account.userId, loginPermission) : null;
  if (clientAccount && validPassword && !tenantAccess?.ok) return { error: "Sua conta precisa de um vínculo ativo com a empresa e as unidades autorizadas. Procure o responsável pelo seu acesso." };
  const master = Boolean(account && isPlatformMaster(account.userId));
  const valid = Boolean(account && validPassword && (master || tenantAccess?.ok));
  if (!valid) {
    const active = failures.get(email);
    const next = active && now - active.windowStartedAt <= WINDOW_MS
      ? { ...active, count: active.count + 1 }
      : { count: 1, windowStartedAt: now, lockedUntil: 0 };
    if (next.count >= MAX_ATTEMPTS) next.lockedUntil = now + LOCK_MS;
    failures.set(email, next);
    return { error: "E-mail ou senha não conferem. Confira os dados e tente novamente." };
  }

  failures.delete(email);
  if (!account || (!master && !tenantAccess?.ok)) return { error: "E-mail ou senha não conferem. Confira os dados e tente novamente." };
  appendAuditEvent({
    tenantId: master ? "platform" : tenantAccess!.ok ? tenantAccess!.context.tenant.id : "platform",
    actorUserId: account.userId,
    actorRole: master ? "saas_master" : tenantAccess!.ok ? tenantAccess!.context.membership.role : "saas_master",
    action: "auth.login_succeeded",
  });
  await createSession(account.userId, account.email);
  if (master) redirect("/master");
  redirect(demoWorker ? "/passaporte-demo" : "/");
}

export async function logoutAction() {
  const session = await getSession();
  if (session) {
    const access = requireTenantAccess(session.userId, resolveTenantMembership(session.userId)?.membership.role === "cliente" ? "dds.read" : "tenant.dashboard.read");
    if (isPlatformMaster(session.userId)) {
      appendAuditEvent({ tenantId: "platform", actorUserId: session.userId, actorRole: "saas_master", action: "auth.logout" });
    } else if (access.ok) {
      appendAuditEvent({
        tenantId: access.context.tenant.id,
        actorUserId: session.userId,
        actorRole: access.context.membership.role,
        action: "auth.logout",
      });
    }
  }
  await clearSession();
  redirect("/login");
}
