import type { Metadata } from "next";
import ThirdPartyPortal from "./portal";
export const metadata: Metadata = { title: "Envio documental fictício — SST Hoje", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Page() { return <ThirdPartyPortal/>; }
