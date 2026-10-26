import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollaboratorPage } from "@/features/collaborator/collaborator-page";
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
  const flash = query.feito === "1" ? "done" : query.erro === "1" ? "error" : null;
  return <CollaboratorPage view={view} token={token} flash={flash} />;
}
