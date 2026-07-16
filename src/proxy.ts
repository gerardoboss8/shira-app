import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";

// En Next.js 16 el antiguo `middleware` se llama `proxy` (runtime nodejs).
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todas las rutas excepto:
     * - _next/static, _next/image
     * - favicon, manifest, íconos e imágenes
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
