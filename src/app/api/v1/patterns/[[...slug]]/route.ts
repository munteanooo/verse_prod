import { publicCatalogRequest } from "@/infrastructure/customer/http";
type Context = { params: Promise<{ slug?: string[] }> };
export async function GET(request: Request, context: Context) {
  return publicCatalogRequest(request, "patterns", (await context.params).slug);
}
export const POST = GET;
