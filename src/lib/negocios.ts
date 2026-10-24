import type { NegocioId } from "@/lib/database.types";

/**
 * Marca de cada negocio que comparte la app. Los colores viven en
 * `globals.css` bajo `[data-negocio="…"]`; aquí van logos, nombres e íconos.
 */
export type Negocio = {
  id: NegocioId;
  nombre: string;
  nombreCorto: string;
  descripcion: string;
  /** Logo sobre fondo claro (login, reportes). */
  logo: { src: string; width: number; height: number };
  /** Logo de la barra superior (fondo `--header`). */
  logoHeader: { src: string; width: number; height: number };
  /** Logo de la tarjeta al elegir negocio. */
  logoTarjeta: { src: string; width: number; height: number };
  icono: string;
  appleIcon: string;
  manifest: string;
  themeColor: string;
  /** Subcategorías sugeridas al crear productos. */
  gruposSugeridos: string[];
};

export const NEGOCIOS: Record<NegocioId, Negocio> = {
  shira: {
    id: "shira",
    nombre: "Librería Shira",
    nombreCorto: "Shira",
    descripcion: "Biblias, libros litúrgicos y artículos religiosos",
    logo: { src: "/logo.png", width: 415, height: 180 },
    logoHeader: { src: "/logo.png", width: 415, height: 180 },
    logoTarjeta: { src: "/logo.png", width: 415, height: 180 },
    icono: "/negocios/shira/icon.png",
    appleIcon: "/apple-icon.png",
    manifest: "/manifest.json",
    themeColor: "#176BE0",
    gruposSugeridos: [],
  },
  artisan: {
    id: "artisan",
    nombre: "Artisan",
    nombreCorto: "Artisan",
    descripcion: "Manteles y accesorios de cocina",
    logo: { src: "/negocios/artisan/logo.png", width: 1090, height: 642 },
    logoHeader: { src: "/negocios/artisan/logo-blanco.png", width: 1090, height: 642 },
    logoTarjeta: { src: "/negocios/artisan/logo-color.png", width: 900, height: 570 },
    icono: "/negocios/artisan/icon.png",
    appleIcon: "/negocios/artisan/apple-icon.png",
    manifest: "/negocios/artisan/manifest.json",
    themeColor: "#2E1A5C",
    gruposSugeridos: [
      "Manteles",
      "Paneras",
      "Tortilleras",
      "Baguetera",
      "Gabachas",
      "Individuales",
      "Bolsas",
    ],
  },
};

export const LISTA_NEGOCIOS: Negocio[] = [NEGOCIOS.shira, NEGOCIOS.artisan];

/** Cookie que guarda el negocio activo (la recuerda entre sesiones). */
export const COOKIE_NEGOCIO = "negocio";

export function negocioDesdeId(id: string | undefined | null): Negocio | null {
  return id && id in NEGOCIOS ? NEGOCIOS[id as NegocioId] : null;
}
