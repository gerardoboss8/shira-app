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
import { SelectorMes } from "@/components/selector-mes";
import { traerTodo } from "@/lib/supabase/paginar";
import {
  esMes,
  mesActualGT,
  mesesDisponibles,
  nombreMes,
  rangoMes,
  sumarMeses,
  variacion,
} from "@/lib/meses";
import { BarChart3, ChevronRight, Download } from "lucide-react";

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

function desdeDe(periodo: Exclude<Periodo, "todo" | "mes">): string {
  const hoy = hoyGT(); // YYYY-MM-DD
  if (periodo === "hoy") return `${hoy}T00:00:00-06:00`;
  const [y, m, d] = hoy.split("-").map(Number);
  // semana: últimos 7 días
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() - 6);
  return `${base.toISOString().slice(0, 10)}T00:00:00-06:00`;
}

function filtrosVentas(periodo: Periodo, tipo: FiltroTipo, mes?: string): Record<string, string> {
  const qs: Record<string, string> = { periodo };
  if (periodo === "mes" && mes) qs.mes = mes;
  if (tipo !== "todas") qs.tipo = tipo;
  return qs;
}

function hrefVentas(periodo: Periodo, tipo: FiltroTipo, mes?: string): string {
  const qs = new URLSearchParams(filtrosVentas(periodo, tipo, mes));
  return `/ventas?${qs.toString()}`;
}

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; tipo?: string; mes?: string }>;
}) {
  const [profile, negocio] = await Promise.all([requireProfile(), requireNegocio()]);
  const { periodo: p, tipo: t, mes: mesParam } = await searchParams;
  const periodo: Periodo =
    p === "semana" || p === "mes" || p === "todo" ? (p as Periodo) : "hoy";
  const filtroTipo: FiltroTipo = esTipoVenta(t) ? t : "todas";
  const meses = mesesDisponibles();
  const mes = esMes(mesParam) && meses.includes(mesParam) ? mesParam : mesActualGT();
  const mesPrevio = sumarMeses(mes, -1);
  const puedeReportes = profile.role === "admin" || profile.role === "contador";

  const supabase = await createClient();
  const consulta = () => {
    let q = supabase
      .from("ventas")
      .select(
        "id, folio, fecha, cliente_nombre, metodo_pago, total, estado, tipo, vendedor:profiles(nombre)",
      )
      .eq("negocio_id", negocio.id)
      .order("fecha", { ascending: false })
      .order("id");
    if (periodo === "mes") {
      const { desdeTs, hastaTs } = rangoMes(mes);
      q = q.gte("fecha", desdeTs).lt("fecha", hastaTs);
    } else if (periodo !== "todo") {
      q = q.gte("fecha", desdeDe(periodo));
    }
    if (filtroTipo !== "todas") q = q.eq("tipo", filtroTipo);
    return q;
  };

  // Para comparar: ventas completadas del mes anterior (solo montos).
  const consultaPrevia = () => {
    const { desdeTs, hastaTs } = rangoMes(mesPrevio);
    return supabase
      .from("ventas")
      .select("id, total, tipo")
      .eq("negocio_id", negocio.id)
      .eq("estado", "completada")
      .gte("fecha", desdeTs)
      .lt("fecha", hastaTs)
      .order("id");
  };

  const [data, previas] = await Promise.all([
    periodo === "todo"
      ? consulta()
          .limit(LIMITE_TODO)
          .then((res) => res.data ?? [])
      : traerTodo((d, h) => consulta().range(d, h)),
    periodo === "mes"
      ? traerTodo<{ total: number; tipo: TipoVenta }>((d, h) => consultaPrevia().range(d, h))
      : Promise.resolve([]),
  ]);

  const ventas = data as unknown as {
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
  // Comparación contra el mes anterior (mismo tipo principal)
  const previasTipo = previas.filter((v) => (v.tipo ?? "normal") === tipoPrincipal);
  const totalPrevio = previasTipo.reduce((s, v) => s + Number(v.total), 0);
  const cambio = variacion(totalDe(tipoPrincipal), totalPrevio);

  const separados =
    filtroTipo === "todas"
      ? TIPOS_VENTA.filter((x) => x.value !== "normal" && cuantasDe(x.value) > 0)
      : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Ventas</h1>
        {puedeReportes && periodo === "mes" && (
          <a
            href={`/ventas/exportar?${new URLSearchParams(filtrosVentas(periodo, filtroTipo, mes)).toString()}`}
            className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <Download className="h-4 w-4" /> Descargar mes
          </a>
        )}
      </div>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {(["hoy", "semana", "mes", "todo"] as Periodo[]).map((per) => (
            <Chip key={per} href={hrefVentas(per, filtroTipo, mes)} activo={periodo === per}>
              {periodoLabel[per]}
            </Chip>
          ))}
        </div>
        {periodo === "mes" && (
          <SelectorMes
            ruta="/ventas"
            mes={mes}
            meses={meses}
            params={filtrosVentas(periodo, filtroTipo)}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Chip href={hrefVentas(periodo, "todas", mes)} activo={filtroTipo === "todas"} suave>
            Todos los tipos
          </Chip>
          {TIPOS_VENTA.map((x) => (
            <Chip
              key={x.value}
              href={hrefVentas(periodo, x.value, mes)}
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
              · {periodo === "mes" ? nombreMes(mes) : periodoLabel[periodo].toLowerCase()} ·{" "}
              {cuantasDe(tipoPrincipal)}
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
          {periodo === "mes" && (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-2 text-sm">
              <span className="text-muted-foreground">
                vs {nombreMes(mesPrevio)}: {formatQ(totalPrevio)} · {previasTipo.length}
              </span>
              <span className="flex items-center gap-3">
                <Cambio valor={cambio} />
                {puedeReportes && (
                  <Link
                    href={`/reportes?${new URLSearchParams({ periodo: "mes", mes }).toString()}`}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <BarChart3 className="h-3.5 w-3.5" /> Comparar meses
                  </Link>
                )}
              </span>
            </div>
          )}
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

/** Variación contra el mes anterior: ▲ en verde, ▼ en rojo. */
function Cambio({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-xs text-muted-foreground">sin base</span>;
  const sube = valor >= 0;
  return (
    <span className={cn("text-sm font-semibold", sube ? "text-emerald-700" : "text-destructive")}>
      {sube ? "▲" : "▼"} {Math.abs(valor).toFixed(1)} %
    </span>
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
