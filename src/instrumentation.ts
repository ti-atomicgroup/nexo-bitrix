export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { recordBoot } = await import("./server/runtime/boot");
    recordBoot();
  } catch (error) {
    // Nada aqui pode impedir o servidor de subir.
    console.error(JSON.stringify({ level: "error", event: "instrumentation", error: error instanceof Error ? error.message : String(error) }));
  }
}
