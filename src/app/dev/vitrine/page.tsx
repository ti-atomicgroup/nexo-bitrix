import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CollaboratorPage } from "@/features/collaborator/collaborator-page";
import { buildSamples } from "@/features/showcase/sample-data";
import { Showcase } from "@/features/showcase/showcase";
import { todayIn } from "@/lib/format";

export const metadata: Metadata = { title: "Vitrine", robots: { index: false, follow: false } };

/** Vitrine dos componentes com dados de exemplo. Não existe em produção. */
export default async function VitrinePage() {
  if (process.env.NODE_ENV === "production") notFound();
  // Datas relativas a hoje: renderiza a cada requisição.
  await connection();
  const samples = buildSamples(todayIn());
  return (
    <Showcase
      samples={samples}
      collaborator={{
        onboarding: <CollaboratorPage view={samples.collaboratorOnboarding} token="exemplo" preview />,
        offboarding: <CollaboratorPage view={samples.collaboratorOffboarding} token="exemplo" preview />,
        flash: <CollaboratorPage view={{ ...samples.collaboratorOnboarding, progress: { done: 3, total: 8, percent: 38 } }} token="exemplo" flash="done" preview />,
      }}
    />
  );
}
