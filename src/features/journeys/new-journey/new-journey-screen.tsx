"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Notice } from "@/components/ui/notice";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { JourneyWizard } from "./journey-wizard";
import { initialState } from "./wizard-state";

/**
 * `/pessoas/nova`: carrega os padrões (Ajustes), as trilhas e, com `?deteccao=<id>`, a detecção do CRM
 * que pré-preenche o assistente.
 */
export function NewJourneyScreen({ detectionId }: { detectionId?: string }) {
  const settings = useApi((signal) => api.settings({ signal }), [], { revalidateOnFocus: false });
  const templates = useApi((signal) => api.templates({ signal }), [], { revalidateOnFocus: false });
  const detection = useApi((signal) => api.detection(detectionId ?? "", { signal }), [detectionId], {
    enabled: Boolean(detectionId),
    revalidateOnFocus: false,
  });

  const ready = (settings.data || settings.error) && (!detectionId || detection.data || detection.error);

  return (
    <>
      <PageHeader
        title="Nova jornada"
        description="Em três passos: quem, qual trilha e quem participa. Cada atividade liberada vira uma tarefa no Bitrix24."
        back={{ href: "/pessoas", label: "Pessoas" }}
      />
      {detectionId && detection.error ? (
        <Notice tone="warning" title="Não foi possível carregar a detecção do CRM">
          {detection.error.message} Preencha os dados abaixo à mão.
        </Notice>
      ) : null}
      {ready ? (
        <JourneyWizard
          key={detection.data?.id ?? "nova"}
          initial={initialState(settings.data ?? null, detection.data ?? null)}
          templates={templates}
          detection={detection.data ?? null}
          companyName={settings.data?.company.name ?? null}
          invitesEnabled={Boolean(settings.data?.invitesEnabled)}
        />
      ) : (
        <LoadingArea label="Preparando o assistente…">
          <Skeleton height={48} />
          <Skeleton height={320} radius={6} />
        </LoadingArea>
      )}
    </>
  );
}
