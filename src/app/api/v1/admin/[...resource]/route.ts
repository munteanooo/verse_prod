import { catalogRequest } from "@/infrastructure/catalog/http";

type Context = { params: Promise<{ resource: string[] }> };
export const runtime = "nodejs";

async function handler(request: Request, context: Context) {
  return catalogRequest(request, (await context.params).resource);
}

export { handler as GET, handler as POST, handler as PUT };
