import type { Server } from "node:http";

export function errorCode(error: unknown): string;
export function allowedTarget(raw: string): URL | null;
export function createWorker(options: { token: string; appPort: number; fetchImpl?: typeof fetch }): { server: Server; tick: () => Promise<void> };
