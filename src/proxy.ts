import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/session";

// Semua halaman dan API wajib login, kecuali /login.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const user = await verifyToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    return user ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
