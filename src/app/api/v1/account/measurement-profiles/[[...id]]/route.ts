import { profilesRequest } from "@/infrastructure/customer/http";
type Context = { params: Promise<{ id?: string[] }> };
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  if (id && id.length !== 1)
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  return profilesRequest(request, id?.[0]);
}
export const POST = GET;
export const PATCH = GET;
export const DELETE = GET;
