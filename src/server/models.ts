import { z } from "zod";
export const userSchema = z.object({ id: z.string(), name: z.string(), position: z.string(), department: z.string(), avatar: z.string().optional(), active: z.boolean() });
export const credentialSchema = z.object({ userId: z.string(), memberId: z.string(), access: z.string(), refresh: z.string(), expiresAt: z.number(), invalid: z.boolean().default(false) });
export type Credential = z.infer<typeof credentialSchema>;
export const installationSchema = z.object({ memberId: z.string(), appId: z.string(), clientId: z.string(), clientSecret: z.string(), applicationToken: z.string(), installedAt: z.string() });
export const contextSchema = z.object({ user: userSchema, admin: z.boolean(), memberId: z.string(), appId: z.string(), appCode: z.string(), applicationToken: z.string(), credential: credentialSchema, expiresAt: z.number() });
export const storedSessionSchema = z.object({ user: userSchema, admin: z.boolean(), memberId: z.string(), expiresAt: z.number() });
export const auditSchema = z.object({ id: z.string(), action: z.string(), message: z.string(), actorName: z.string(), createdAt: z.string(), journeyId: z.string().optional() });
export const issueSchema = z.object({ id: z.string(), title: z.string(), message: z.string(), createdAt: z.string(), sourceItemId: z.number().optional(), retryable: z.boolean() });
export const metadataSchema = z.object({ lastSyncAt: z.string().nullable(), syncRunning: z.boolean(), syncStartedAt: z.number().optional() });
export const operationSchema = z.object({ state: z.enum(["sending", "confirmed", "uncertain"]), remoteId: z.string().optional() });
export const journeyOwnerSchema = z.object({ userId: z.string(), managerId: z.string().nullable(), source: z.string() });
export const object = z.record(z.string(), z.unknown());
export function record(value: unknown): Record<string, unknown> { return object.parse(value); }
export function text(value: unknown): string { return z.union([z.string(), z.number()]).transform(String).parse(value); }
export function integer(value: unknown): number { return z.coerce.number().int().nonnegative().parse(value); }
