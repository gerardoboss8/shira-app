import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/database.types";

/**
 * Devuelve el perfil del usuario autenticado (o redirige a /login).
 * Uso en Server Components de rutas protegidas.
 */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  if (!profile.activo) redirect("/login?inactivo=1");

  return profile;
}

export function esAdmin(profile: Pick<Profile, "role">): boolean {
  return profile.role === "admin";
}

export function puedeVender(profile: Pick<Profile, "role">): boolean {
  return profile.role === "admin" || profile.role === "vendedor";
}
