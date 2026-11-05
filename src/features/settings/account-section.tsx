"use client";

import { ChangePasswordForm } from "@/components/shell/change-password-form";
import { Panel } from "@/components/ui/panel";
import type { MeDTO } from "@/shared/contracts";

/** Sua conta: quem está conectado e troca de senha. Com senha temporária, a casca do console nem abre Ajustes: pede a troca antes. */
export function AccountSection({ me }: { me: MeDTO }) {
  return (
    <Panel id="conta" title="Sua conta" description={`${me.user.name} · ${me.user.email}`}>
      <ChangePasswordForm />
    </Panel>
  );
}
