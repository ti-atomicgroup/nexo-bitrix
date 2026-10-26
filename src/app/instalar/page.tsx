import type { Metadata } from "next";
import { InstallWizard } from "@/features/install/install-wizard";

export const metadata: Metadata = { title: "Instalar" };

export default function InstalarPage() {
  return <InstallWizard />;
}
