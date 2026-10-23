import { createHash } from "node:crypto";
import { z } from "zod";
import { Auth } from "./auth";
import { AppError } from "./errors";
import { integer, record, outgoingWebhookSchema } from "./models";
import { decrypt, encrypt, portalFromDomain, safeEqual } from "./security";
import { Store } from "./store";
export const eventJobSchema = z.object({ event: z.string(), entityTypeId: z.number().int().nonnegative().optional(), itemId: z.number().int().positive().optional() });
export type EventJob = z.infer<typeof eventJobSchema>;
export class Events {
  constructor(readonly store: Store, readonly auth: Auth) {}
  configureOutgoingToken(token: string) {
    if (token.length < 8 || token.length > 2000 || /\s/.test(token)) throw new AppError("OUTGOING_TOKEN_INVALID", "O token do webhook de saída é inválido.", 400);
    this.store.put("webhook", "outgoing", { tokenEncrypted: encrypt(token, this.auth.env.encryptionKey), handlerUrl: `${this.auth.env.appUrl}/api/bitrix/events`, verifiedAt: new Date().toISOString() });
  }
  receive(input: unknown) {
    const body = record(input), config = this.store.get("webhook", "outgoing", outgoingWebhookSchema);
    if (!config) throw new AppError("EVENT_NOT_CONFIGURED", "Configure o webhook de saída no Nexo.", 503);
    const authentication = body.auth === undefined ? { application_token: body["auth[application_token]"], domain: body["auth[domain]"] } : record(body.auth);
    const token = z.string().max(2000).parse(authentication.application_token), domain = z.string().max(200).parse(authentication.domain);
    if (!safeEqual(token, decrypt(config.tokenEncrypted, this.auth.env.encryptionKey))) throw new AppError("EVENT_AUTH", "Evento não autorizado.", 403);
    portalFromDomain(domain, this.auth.env);
    const event = z.enum(["ONTASKADD", "ONTASKUPDATE", "ONTASKDELETE", "ONCRMDYNAMICITEMADD", "ONCRMDYNAMICITEMUPDATE"]).parse(String(body.event).toUpperCase());
    let job: EventJob = { event };
    if (event.startsWith("ONCRMDYNAMIC")) {
      const fields = body.data === undefined ? { ID: body["data[FIELDS][ID]"], ENTITY_TYPE_ID: body["data[FIELDS][ENTITY_TYPE_ID]"] } : record(record(body.data).FIELDS);
      job = { event, itemId: integer(fields.ID), entityTypeId: integer(fields.ENTITY_TYPE_ID) };
    }
    const ts = z.union([z.string(), z.number()]).optional().parse(body.ts);
    const handlerId = body.event_handler_id === undefined ? null : String(body.event_handler_id);
    const key = createHash("sha256").update(JSON.stringify({ domain, handlerId, ...job, ts: ts ?? null })).digest("hex");
    this.store.enqueue(`event:${key}`, "event", job);
    return { queued: true };
  }
}
