/** Helpers de formato para Guatemala (Quetzal, zona horaria America/Guatemala). */

export const TZ = process.env.NEXT_PUBLIC_TZ ?? "America/Guatemala";

const quetzal = new Intl.NumberFormat("es-GT", {
  style: "currency",
  currency: "GTQ",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formatea un número como `Q 1,234.00`. */
export function formatQ(valor: number | string | null | undefined): string {
  const n = typeof valor === "string" ? Number(valor) : (valor ?? 0);
  if (!Number.isFinite(n)) return "Q 0.00";
  // Intl produce "GTQ 1,234.00" o "Q1,234.00" según entorno; normalizamos a "Q 1,234.00".
  const soloNumero = quetzal.format(n).replace(/[^\d.,-]/g, "");
  return `Q ${soloNumero}`;
}

const fechaLarga = new Intl.DateTimeFormat("es-GT", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const fechaCorta = new Intl.DateTimeFormat("es-GT", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const horaMin = new Intl.DateTimeFormat("es-GT", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
});

export function fechaLargaGT(d: Date | string = new Date()): string {
  return fechaLarga.format(typeof d === "string" ? new Date(d) : d);
}

export function fechaCortaGT(d: Date | string): string {
  // Fechas "solo día" (YYYY-MM-DD) se muestran tal cual, sin desfase de zona.
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, dd] = d.split("-");
    return `${dd}/${m}/${y}`;
  }
  return fechaCorta.format(typeof d === "string" ? new Date(d) : d);
}

export function fechaHoraGT(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${fechaCorta.format(date)} ${horaMin.format(date)}`;
}

/** Folio visible de venta: 1 -> "V-0001". */
export function folioVenta(folio: number): string {
  return `V-${String(folio).padStart(4, "0")}`;
}

/** "Hoy" en Guatemala como YYYY-MM-DD (para filtros de fecha). */
export function hoyGT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
