import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { requireNegocio } from "@/lib/negocio";
import { formatQ, fechaHoraGT, folioVenta, hoyGT } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TipoVenta } from "@/lib/database.types";
import { TIPOS_VENTA, esTipoVenta, tipoVentaLabel } from "@/lib/tipos-venta";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TipoVentaBadge } from "@/components/ventas/tipo-venta-badge";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

type Periodo = "hoy" | "semana" | "mes" | "todo";
type FiltroTipo = TipoVenta | "todas";

/** Tope de filas para "todo" (el historial completo puede crecer mucho). */
const LIMITE_TODO = 500;

const metodoLabel: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
};

const periodoLabel: Record<Periodo, string> = {
  hoy: "Hoy",
  semana: "Semana",
  mes: "Mes",
  todo: "Todo",
};

function desdeDe(periodo: Exclude<Periodo, "todo">): string {
  const hoy = hoyGT(); // YYYY-MM-DD
  if (periodo === "hoy") return `${hoy}T00:00:00-06:00`;
  const [y, m, d] = hoy.split("-").map(Number);
  if (periodo === "mes") {
    return `${y}-${String(m).padStart(2, "0")}-01T00:00:00-06:00`;
  }
  // semana: últimos 7 días
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() - 6);
  return `${base.toISOString().slice(0, 10)}T00:00:00-06:00`;
}

function hrefVentas(periodo: Periodo, tipo: FiltroTipo): string {
  const qs = new URLSearchParams({ periodo });
  if (tipo !== "todas") qs.set("tipo", tipo);
  return `/ventas?${qs.toString()}`;
}

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; tipo?: string }>;
}) {
  const [, negocio] = await Promise.all([requireProfile(), requireNegocio()]);
  const { periodo: p, tipo: t } = await searchParams;
  const periodo: Periodo =
    p === "semana" || p === "mes" || p === "todo" ? (p as Periodo) : "hoy";
  const filtroTipo: FiltroTipo = esTipoVenta(t) ? t : "todas";

  const supabase = await createClient();
  let query = supabase
    .from("ventas")
    .select(
      "id, folio, fecha, cliente_nombre, metodo_pago, total, estado, tipo, vendedor:profiles(nombre)",
    )
    .eq("negocio_id", negocio.id)
    .order("fecha", { ascending: false });
  if (periodo !== "todo") query = query.gte("fecha", desdeDe(periodo));
  else query = query.limit(LIMITE_TODO);
  if (filtroTipo !== "todas") query = query.eq("tipo", filtroTipo);
  const { data } = await query;

  const ventas = (data ?? []) as unknown as {
    id: string;
    folio: number;
    fecha: string;
    cliente_nombre: string | null;
    metodo_pago: string;
    total: number;
    estado: string;
    tipo: TipoVenta;
    vendedor: { nombre: string } | null;
  }[];

  const completadas = ventas.filter((v) => v.estado === "completada");
  const totalDe = (tipo: TipoVenta) =>
    completadas.filter((v) => v.tipo === tipo).reduce((s, v) => s + Number(v.total), 0);
  const cuantasDe = (tipo: TipoVenta) => completadas.filter((v) => v.tipo === tipo).length;

  // Con "todas", el total grande son las ventas normales; bonos y extra van aparte.
  const tipoPrincipal: TipoVenta = filtroTipo === "todas" ? "normal" : filtroTipo;
  const separados =
    filtroTipo === "todas"
      ? TIPOS_VENTA.filter((x) => x.value !== "normal" && cuantasDe(x.value) > 0)
      : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ventas</h1>
      </div>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {(["hoy", "semana", "mes", "todo"] as Periodo[]).map((per) => (
            <Chip key={per} href={hrefVentas(per, filtroTipo)} activo={periodo === per}>
              {periodoLabel[per]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip href={hrefVentas(periodo, "todas")} activo={filtroTipo === "todas"} suave>
            Todos los tipos
          </Chip>
          {TIPOS_VENTA.map((x) => (
            <Chip
              key={x.value}
              href={hrefVentas(periodo, x.value)}
              activo={filtroTipo === x.value}
              suave
            >
              {x.corto}
            </Chip>
          ))}
        </div>
      </div>

      {/* Total del período */}
      <Card className="bg-accent/40">
        <CardContent className="space-y-1 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {tipoPrincipal === "normal" ? "Ventas normales" : tipoVentaLabel[tipoPrincipal]}{" "}
              · {periodoLabel[periodo].toLowerCase()} · {cuantasDe(tipoPrincipal)}
            </span>
            <span className="text-xl font-bold text-primary">
              {formatQ(totalDe(tipoPrincipal))}
            </span>
          </div>
          {separados.map((x) => (
            <div key={x.value} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                + {x.label} (aparte) · {cuantasDe(x.value)}
              </span>
              <span className="font-semibold">{formatQ(totalDe(x.value))}</span>
            </div>
          ))}
          {periodo === "todo" && ventas.length >= LIMITE_TODO && (
            <p className="text-xs text-muted-foreground">
              Mostrando las {LIMITE_TODO} ventas más recientes.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Lista */}
      {ventas.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No hay ventas con estos filtros.
        </p>
      ) : (
        <div className="space-y-2">
          {ventas.map((v) => (
            <Link key={v.id} href={`/ventas/${v.id}`}>
              <Card className="transition-colors hover:border-primary">
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{folioVenta(v.folio)}</span>
                      {v.estado === "anulada" && (
                        <Badge variant="destructive" className="text-[10px]">
                          Anulada
                        </Badge>
                      )}
                      <TipoVentaBadge tipo={v.tipo ?? "normal"} className="text-[10px]" />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {fechaHoraGT(v.fecha)} · {metodoLabel[v.metodo_pago]}
                      {v.vendedor?.nombre ? ` · ${v.vendedor.nombre}` : ""}
                      {v.cliente_nombre ? ` · ${v.cliente_nombre}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "font-semibold",
                      v.estado === "anulada"
                        ? "text-muted-foreground line-through"
                        : "text-primary",
                    )}
                  >
                    {formatQ(v.total)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  href,
  activo,
  suave,
  children,
}: {
  href: string;
  activo: boolean;
  suave?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-4 py-1.5 text-sm transition-colors",
        activo
          ? suave
            ? "border-primary bg-primary/10 font-medium text-primary"
            : "border-primary bg-primary text-primary-foreground"
          : "bg-card hover:bg-accent",
      )}
    >
      {children}
    </Link>
  );
}
