import { route } from "@/server/http/handler";
import { dismissDetection } from "@/server/services/read/detections";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "session", operation: "detection.act", params: ["detectionId"] }, ({ params, actor }) => dismissDetection(params.detectionId, actor));
