import { publicImage } from "@/infrastructure/documents/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return publicImage(request, (await params).id);
}
