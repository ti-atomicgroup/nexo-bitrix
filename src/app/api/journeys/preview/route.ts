import { route } from "@/server/http/handler";
import { journeyPreview } from "@/server/services/journeys";
import { journeyPreviewInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "user", input: journeyPreviewInput }, ({ input }) => journeyPreview(input));
