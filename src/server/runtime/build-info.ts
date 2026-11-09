export interface BuildInfo {
  version: string;
  commit: string;
  buildTime: string;
}

export function buildInfo(): BuildInfo {
  return {
    version: "3.0.1",
    commit: process.env.NEXO_COMMIT ?? "desconhecido",
    buildTime: process.env.NEXO_BUILD_TIME ?? "desconhecido",
  };
}
