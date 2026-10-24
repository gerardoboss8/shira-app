import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NEGOCIO, negocioDesdeId, type Negocio } from "@/lib/negocios";

/** Negocio elegido en esta sesión del navegador, o null si aún no eligió. */
export async function getNegocio(): Promise<Negocio | null> {
  const cookieStore = await cookies();
  return negocioDesdeId(cookieStore.get(COOKIE_NEGOCIO)?.value);
}

/** Negocio activo o, si no hay, manda a elegirlo. Uso en rutas protegidas. */
export async function requireNegocio(): Promise<Negocio> {
  const negocio = await getNegocio();
  if (!negocio) redirect("/negocio");
  return negocio;
}
