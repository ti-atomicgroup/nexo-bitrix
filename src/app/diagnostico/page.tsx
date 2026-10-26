import type { Metadata } from "next";
import { Diagnostics } from "@/features/diagnostics/diagnostics";

export const metadata: Metadata = { title: "Diagnóstico" };

export default function DiagnosticoPage() {
  return <Diagnostics variant="same-origin" />;
}
