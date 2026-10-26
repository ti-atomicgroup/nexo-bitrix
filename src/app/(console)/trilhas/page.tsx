import type { Metadata } from "next";
import { TemplatesScreen } from "@/features/templates/templates-screen";

export const metadata: Metadata = { title: "Trilhas" };

export default function TrilhasPage() {
  return <TemplatesScreen />;
}
