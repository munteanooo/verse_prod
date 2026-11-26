import { NextResponse, type NextRequest } from "next/server";
import { project } from "./config/project";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const { admin, api } = project.routes;
  const protectedPrefixes = [admin, `${api}${admin}`];

  if (
    protectedPrefixes.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  ) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.next();
}

export const config = {
  // Next.js statically analyzes matchers. Keep these in sync with project.routes.
  matcher: ["/admin/:path*", "/api/v1/admin/:path*"],
};
