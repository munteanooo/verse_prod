import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { project } from "./config/project";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const { admin, api } = project.routes;
  const adminApi = api + admin;
  if (
    (path === adminApi ||
      path.startsWith(adminApi + "/") ||
      path === admin ||
      path.startsWith(admin + "/")) &&
    !process.env.DATABASE_URL
  ) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const nonce = randomBytes(16).toString("base64");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/v1/admin/:path*",
    "/account/:path*",
    "/patterns/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ],
};
