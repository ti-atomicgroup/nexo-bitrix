import type { LookupAddress } from "node:dns";

type Env = Record<string, string | undefined>;
type Resolver = (hostname: string, options: unknown, done: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void;

export function isAllowedPortalHost(host: string, env?: Env): boolean;
export function allowedTarget(raw: string, env?: Env): URL | null;
export function isBlockedAddress(address: string): boolean;
export function guardedLookup(hostname: string, options: { all?: boolean } | object, callback: (...args: never[]) => void, resolver?: Resolver): void;
export function safeFetch(input: string, init?: RequestInit & { port?: number; resolver?: Resolver }): Promise<Response>;
