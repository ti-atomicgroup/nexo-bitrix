import type { Metadata } from "next";
import { NewJourneyScreen } from "@/features/journeys/new-journey/new-journey-screen";

export const metadata: Metadata = { title: "Nova jornada" };

/** `?deteccao=<id>` vem do painel de hoje ("Detectado no Bitrix24 → Iniciar jornada"). */
export default async function NovaJornadaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const detectionId = typeof params.deteccao === "string" && params.deteccao.length <= 64 ? params.deteccao : undefined;
  return <NewJourneyScreen detectionId={detectionId} />;
}
