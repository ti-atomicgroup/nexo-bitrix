import { api } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const DELETE = (request: Request, context: { params: Promise<{ id: string }> }) => context.params.then(({ id }) => api(request, "users", id));
