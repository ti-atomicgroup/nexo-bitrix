import type { Metadata } from "next";
import { Suspense } from "react";
import { JourneyScreen, JourneySkeleton } from "@/features/journeys/journey/journey-screen";

export const metadata: Metadata = { title: "Jornada" };

/** A gaveta da atividade lê `?atividade=<id>` no cliente (useSearchParams), por isso o Suspense. */
export default async function JornadaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<JourneySkeleton />}>
      <JourneyScreen journeyId={id} />
    </Suspense>
  );
}
