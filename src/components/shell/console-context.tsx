"use client";

import { createContext, useContext } from "react";
import type { MeDTO, SyncStatusDTO } from "@/shared/contracts";

export interface ConsoleContextValue {
  me: MeDTO;
  /** Último estado de sincronização conhecido (barra superior). */
  sync: SyncStatusDTO | null;
  syncing: boolean;
  /** Páginas que já leram `TodayDTO.sync` repassam o estado e evitam uma leitura extra. */
  reportSync: (sync: SyncStatusDTO) => void;
  syncNow: () => Promise<void>;
}

export const ConsoleContext = createContext<ConsoleContextValue | null>(null);

export function useConsole(): ConsoleContextValue {
  const context = useContext(ConsoleContext);
  if (!context) throw new Error("useConsole precisa estar dentro de <ConsoleShell>.");
  return context;
}

export function useMe(): MeDTO {
  return useConsole().me;
}
