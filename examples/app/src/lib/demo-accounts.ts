import "server-only";

export type DemoAccount = { userId: string; email: string; password: string };

const demoAccounts: DemoAccount[] = [
  { userId: "sst-demo-master", email: process.env.SST_DEMO_MASTER_EMAIL ?? "", password: process.env.SST_DEMO_MASTER_PASSWORD ?? "" },
  { userId: "sst-demo-medico", email: process.env.SST_DEMO_MEDICO_EMAIL ?? "", password: process.env.SST_DEMO_MEDICO_PASSWORD ?? "" },
  { userId: "sst-demo-client-authority", email: process.env.SST_DEMO_CLIENT_EMAIL ?? "", password: process.env.SST_DEMO_CLIENT_PASSWORD ?? "" },
  { userId: "sst-demo-user", email: process.env.SST_DEMO_EMAIL ?? "", password: process.env.SST_DEMO_PASSWORD ?? "" },
  { userId: "sst-demo-sst", email: process.env.SST_DEMO_SST_EMAIL ?? "", password: process.env.SST_DEMO_SST_PASSWORD ?? "" },
  { userId: "sst-demo-campo", email: process.env.SST_DEMO_CAMPO_EMAIL ?? "", password: process.env.SST_DEMO_CAMPO_PASSWORD ?? "" },
  { userId: "sst-demo-user-b", email: process.env.SST_DEMO_TENANT_B_EMAIL ?? "", password: process.env.SST_DEMO_TENANT_B_PASSWORD ?? "" },
].filter((account) => account.email.length > 0 && account.password.length > 0)
  .map((account) => ({ ...account, email: account.email.trim().toLowerCase() }));

export function findDemoAccountByEmail(email: string) {
  return demoAccounts.find((account) => account.email === email.trim().toLowerCase()) ?? null;
}

export function findDemoAccountById(userId: string) {
  return demoAccounts.find((account) => account.userId === userId) ?? null;
}
