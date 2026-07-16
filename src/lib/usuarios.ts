/**
 * Acceso con usuario simple (sin correo).
 *
 * Supabase Auth siempre necesita un correo por detrás, pero los vendedores no
 * tienen por qué escribirlo: si alguien escribe "juan", lo convertimos a
 * "juan@usuarios.libreriashira.com" antes de autenticar.
 *
 * El dominio es interno: no recibe correo real ni necesita existir. Los socios
 * pueden seguir entrando con su correo de verdad (si lleva "@", se usa tal cual).
 */
export const DOMINIO_INTERNO = "usuarios.libreriashira.com";

/** "juan" -> "juan@usuarios.libreriashira.com" · "ana@gmail.com" -> igual. */
export function aCorreoDeAcceso(identificador: string): string {
  const id = identificador.trim().toLowerCase();
  return id.includes("@") ? id : `${id}@${DOMINIO_INTERNO}`;
}

/** Correo interno -> usuario visible. "juan@usuarios.libreriashira.com" -> "juan". */
export function aUsuarioVisible(correo: string): string {
  return correo.toLowerCase().endsWith(`@${DOMINIO_INTERNO}`)
    ? correo.split("@")[0]
    : correo;
}
