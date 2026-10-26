import type { Metadata } from "next";
import { TemplateEditorScreen } from "@/features/templates/template-editor";

export const metadata: Metadata = { title: "Nova trilha" };

export default function NovaTrilhaPage() {
  return <TemplateEditorScreen />;
}
