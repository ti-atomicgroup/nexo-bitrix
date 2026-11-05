import { Notice } from "@/components/ui/notice";
import type { WebhookPrivilegeDTO } from "@/shared/contracts";

/**
 * Deixa à vista o privilégio da conta técnica: tudo o que o Nexo faz no Bitrix24 sai com as permissões dela.
 * O ideal é uma conta dedicada, sem administração do portal e só com os escopos usados.
 */
export function PrivilegeNotice({ ownerName, privilege, extraScopes }: { ownerName: string; privilege: WebhookPrivilegeDTO; extraScopes: string[] }) {
  const items = [
    privilege.ownerIsPortalAdmin ? `${ownerName} é administrador do portal. Esse nível só é necessário para convidar pessoas pelo Nexo.` : null,
    extraScopes.length ? `O webhook tem permissões que o Nexo não usa: ${extraScopes.join(", ")}. Desmarque no Bitrix24.` : null,
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <Notice tone="warning" title="A conta técnica pode mais do que o necessário">
      {items.join(" ")} Tudo o que o Nexo faz no Bitrix24 sai com as permissões dela; uma conta dedicada, com o mínimo, reduz o risco.
    </Notice>
  );
}
