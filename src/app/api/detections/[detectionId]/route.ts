import { route } from "@/server/http/handler";
import { getDetectionDTO } from "@/server/services/read/detections";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "user", params: ["detectionId"] }, ({ params }) => getDetectionDTO(params.detectionId));
