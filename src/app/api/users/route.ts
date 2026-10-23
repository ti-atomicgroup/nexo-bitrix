import { api } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => api(request, "users");
export const POST = (request: Request) => api(request, "users");
