import type { TipoVenta } from "@/lib/database.types";

/** Tipos de venta en el orden en que se muestran. "normal" es la venta del mes. */
export const TIPOS_VENTA: { value: TipoVenta; label: string; corto: string }[] = [
  { value: "normal", label: "Venta normal", corto: "Normal" },
  { value: "bonos", label: "Venta de bonos", corto: "Bonos" },
  { value: "extra", label: "Ingreso extra", corto: "Extra" },
];

export const tipoVentaLabel: Record<TipoVenta, string> = Object.fromEntries(
  TIPOS_VENTA.map((t) => [t.value, t.label]),
) as Record<TipoVenta, string>;

/** Colores de la etiqueta para ventas que no son normales. */
export const tipoVentaClase: Record<TipoVenta, string> = {
  normal: "",
  bonos: "border-violet-300 bg-violet-100 text-violet-800",
  extra: "border-amber-300 bg-amber-100 text-amber-800",
};

export function esTipoVenta(v: unknown): v is TipoVenta {
  return v === "normal" || v === "bonos" || v === "extra";
}
