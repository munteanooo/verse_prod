import { identityRequest } from "@/infrastructure/auth/http";

export const runtime = "nodejs";
export const GET = (request: Request) => identityRequest(request);
export const POST = GET;
