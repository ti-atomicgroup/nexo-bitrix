import { api } from "@/server/http";
export const runtime = "nodejs";
export function POST(request: Request) { return api(request, "ai-trail"); }
