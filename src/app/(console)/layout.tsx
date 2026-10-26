import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/shell/console-shell";

/** Console do RH: casca no cliente que exige sessão (token Bearer) e mostra a barra superior. */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
