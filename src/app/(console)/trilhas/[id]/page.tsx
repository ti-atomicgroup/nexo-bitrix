import type { Metadata } from "next";
import { TemplateEditorScreen } from "@/features/templates/template-editor";

export const metadata: Metadata = { title: "Trilha" };

export default async function TrilhaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TemplateEditorScreen templateId={id} />;
}
