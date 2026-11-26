import { publicCatalogRequest } from "@/infrastructure/customer/http";
type Context = { params: Promise<{ slug?: string[] }> };
export async function GET(request: Request, context: Context) {
  return publicCatalogRequest(
    request,
    "categories",
    (await context.params).slug,
  );
}
