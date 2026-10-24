"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NEGOCIO, negocioDesdeId } from "@/lib/negocios";

/** Guarda el negocio elegido y entra a la app. */
export async function elegirNegocio(formData: FormData) {
  const negocio = negocioDesdeId(String(formData.get("negocio") ?? ""));
  if (!negocio) redirect("/negocio");

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NEGOCIO, negocio.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/");
}
