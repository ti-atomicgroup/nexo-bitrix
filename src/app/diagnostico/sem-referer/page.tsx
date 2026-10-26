import type { Metadata } from "next";
import { Diagnostics } from "@/features/diagnostics/diagnostics";

export const metadata: Metadata = { title: "Diagnóstico sem Referer" };

export default function DiagnosticoSemRefererPage() {
  return <Diagnostics variant="no-referrer" />;
}
