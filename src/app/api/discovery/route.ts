import { api } from "@/server/http";
export const runtime = "nodejs";
export function GET(request: Request) { return api(request, "discovery"); }
