import { api } from "@/server/http";
export const runtime = "nodejs";
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) { return api(request, "templates", (await context.params).id); }
