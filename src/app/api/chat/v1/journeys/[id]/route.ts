import { chatApi } from "@/server/chat-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return chatApi(request, "journey", (await context.params).id); }
