import type { Server } from "node:http";

export function errorCode(error: unknown): string;
export { allowedTarget } from "./lib/bitrix-policy.mjs";
export function createWorker(options: { token: string; appPort: number; fetchImpl?: typeof fetch }): { server: Server; tick: () => Promise<void> };
