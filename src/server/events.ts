import { createHash } from "node:crypto";
import { z } from "zod";
import { Auth } from "./auth";
import { AppError } from "./errors";
import { integer, record } from "./models";
import { decrypt, portalFromDomain, safeEqual } from "./security";
import { Store } from "./store";
export const eventJobSchema = z.object({ event: z.string(), entityTypeId: z.number().int().nonnegative().optional(), itemId: z.number().int().positive().optional() });
export type EventJob = z.infer<typeof eventJobSchema>;
export class Events {
  constructor(readonly store: Store, readonly auth: Auth) {}
  receive(input: unknown) {
    const body = record(input), install = this.auth.installation();
    if (!install) throw new AppError("NOT_INSTALLED", "Aplicativo não instalado.", 403);
    const authentication = body.auth === undefined ? { application_token: body["auth[application_token]"], member_id: body["auth[member_id]"], domain: body["auth[domain]"] } : record(body.auth);
    const token = z.string().max(2000).parse(authentication.application_token), memberId = z.string().max(200).parse(authentication.member_id);
    if (!safeEqual(token, decrypt(install.applicationToken, this.auth.env.encryptionKey)) || memberId !== install.memberId) throw new AppError("EVENT_AUTH", "Evento não autorizado.", 403);
    if (authentication.domain !== undefined) portalFromDomain(z.string().parse(authentication.domain), this.auth.env);
    const event = z.enum(["ONTASKADD", "ONTASKUPDATE", "ONTASKDELETE", "ONCRMDYNAMICITEMADD", "ONCRMDYNAMICITEMUPDATE"]).parse(String(body.event).toUpperCase());
    let job: EventJob = { event };
    if (event.startsWith("ONCRMDYNAMIC")) {
      const fields = body.data === undefined ? { ID: body["data[FIELDS][ID]"], ENTITY_TYPE_ID: body["data[FIELDS][ENTITY_TYPE_ID]"] } : record(record(body.data).FIELDS);
      job = { event, itemId: integer(fields.ID), entityTypeId: integer(fields.ENTITY_TYPE_ID) };
    }
    const ts = z.union([z.string(), z.number()]).optional().parse(body.ts);
    const key = createHash("sha256").update(JSON.stringify({ memberId, ...job, ts: ts ?? null })).digest("hex");
    this.store.enqueue(`event:${key}`, "event", job);
    return { queued: true };
  }
}
