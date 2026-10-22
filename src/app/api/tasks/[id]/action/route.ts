import { api } from "@/server/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return api(request, "task", (await context.params).id); }
