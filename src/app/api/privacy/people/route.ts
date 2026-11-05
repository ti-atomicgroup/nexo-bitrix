import { route } from "@/server/http/handler";
import { searchSubjects } from "@/server/services/privacy";
import { privacyQueryInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "session", operation: "privacy.manage", input: privacyQueryInput }, ({ input }) => searchSubjects(input.query));
