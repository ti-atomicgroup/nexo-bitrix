import "server-only";

/** Origem do portal (`https://empresa.bitrix24.com.br`), aceitando o domínio puro ou um endereço completo. Nunca devolve caminho. */
export function portalOrigin(portal: string | null | undefined): string | null {
  const value = portal?.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.origin;
  } catch {
    return null;
  }
}

/** Identidade do portal para comparar dois webhooks (só o host, sem caixa). */
export function portalHost(portal: string | null | undefined): string | null {
  const origin = portalOrigin(portal);
  return origin ? new URL(origin).host.toLowerCase() : null;
}

/** Link da tarefa dentro do projeto do Nexo no Bitrix24. */
export function bitrixTaskUrl(portal: string | null | undefined, projectId: string | null | undefined, taskId: string | null | undefined): string | null {
  const origin = portalOrigin(portal);
  if (!origin || !projectId || !taskId) return null;
  return `${origin}/workgroups/group/${encodeURIComponent(projectId)}/tasks/task/view/${encodeURIComponent(taskId)}/`;
}
