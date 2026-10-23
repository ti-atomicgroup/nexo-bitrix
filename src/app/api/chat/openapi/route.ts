import { openApiDocument } from "@/server/chat-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() { return openApiDocument(); }
