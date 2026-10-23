import { chatApi } from "@/server/chat-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return chatApi(request, "workspace"); }
