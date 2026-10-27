import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollaboratorPage, type CollaboratorFlash } from "@/features/collaborator/collaborator-page";
import { loadCollaboratorView } from "@/server/services/collaborator";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sua jornada", robots: { index: false, follow: false } };

/** Página pessoal do colaborador: renderizada no servidor, sem JavaScript; token inválido, revogado ou expirado → 404. */
export default async function CollaboratorRoute({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const view = loadCollaboratorView(token);
  if (!view) notFound();
  const query = await searchParams;
  return <CollaboratorPage view={view} token={token} flash={flashFrom(query)} />;
}

/** Resultado do último formulário (vem na query depois do redirecionamento 303). */
function flashFrom(query: Record<string, string | string[] | undefined>): CollaboratorFlash | null {
  if (query.feito === "1") return "done";
  if (query.enviado === "1") return "doc_received";
  if (query.enviado === "completo") return "doc_completed";
  if (query.erro === "grande") return "doc_too_big";
  if (query.erro === "tipo") return "doc_bad_type";
  if (query.erro === "documento") return "doc_error";
  if (query.erro === "1") return "error";
  return null;
}
