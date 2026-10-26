function report(event: string, message: string, error: unknown): void {
  // Sem dependências: se até o módulo de log falhar, a linha JSON ainda sai e o servidor sobe.
  const detail = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      at: new Date().toISOString(),
      level: "error",
      event,
      message,
      error: detail.replace(/\/rest\/(\d+)\/[^/\s"'?#<>]+/g, "/rest/$1/[redacted]"),
    }),
  );
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { recordBoot } = await import("./server/runtime/boot");
    recordBoot();
  } catch (error) {
    // Nada aqui pode impedir o servidor de subir.
    report("instrumentation", "Falha ao registrar a inicialização; o servidor segue no ar.", error);
  }
  try {
    // O agendador só agenda o laço (setTimeout com unref): não chama o Bitrix durante a inicialização.
    const { startScheduler } = await import("./server/engine");
    startScheduler();
  } catch (error) {
    report("scheduler_start", "Falha ao iniciar o agendador; o servidor segue no ar.", error);
  }
}
