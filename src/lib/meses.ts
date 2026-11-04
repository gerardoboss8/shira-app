import { hoyGT } from "@/lib/format";

/**
 * Meses en formato "YYYY-MM", siempre en hora de Guatemala (UTC-6, sin
 * horario de verano), para filtrar y comparar ventas mes a mes.
 */

const NOMBRES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** El primer mes con datos que se ofrece al elegir (arranque del sistema). */
export const PRIMER_MES = "2026-06";

export function esMes(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function mesActualGT(): string {
  return hoyGT().slice(0, 7);
}

/** Suma (o resta) meses: sumarMeses("2026-01", -1) -> "2025-12". */
export function sumarMeses(mes: string, n: number): string {
  const [y, m] = mes.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** "2026-10" -> "octubre 2026". */
export function nombreMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${NOMBRES[m - 1]} ${y}`;
}

/** "2026-10" -> "Oct 26" (para tablas angostas). */
export function nombreMesCorto(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const n = NOMBRES[m - 1];
  return `${n[0].toUpperCase()}${n.slice(1, 3)} ${String(y).slice(2)}`;
}

/** Rango [desde, hasta) del mes, como fecha y como timestamp de Guatemala. */
export function rangoMes(mes: string) {
  const desdeFecha = `${mes}-01`;
  const hastaFecha = `${sumarMeses(mes, 1)}-01`;
  return {
    desdeFecha,
    hastaFecha,
    desdeTs: `${desdeFecha}T00:00:00-06:00`,
    hastaTs: `${hastaFecha}T00:00:00-06:00`,
  };
}

/** Meses desde PRIMER_MES hasta el actual, del más reciente al más antiguo. */
export function mesesDisponibles(): string[] {
  const lista: string[] = [];
  for (let m = mesActualGT(); m >= PRIMER_MES; m = sumarMeses(m, -1)) lista.push(m);
  return lista;
}

/** Mes (YYYY-MM) en que cayó un timestamp, en hora de Guatemala. */
export function mesDeTs(ts: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date(ts))
    .slice(0, 7);
}

/** Variación porcentual contra el mes anterior (null si no hay base). */
export function variacion(actual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}
