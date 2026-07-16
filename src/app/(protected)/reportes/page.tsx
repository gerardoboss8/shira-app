import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatQ, hoyGT, fechaCortaGT } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { AccionesReporte } from "@/components/reportes/acciones-reporte";
import { TrendingUp, TrendingDown, Wallet, Receipt } from "lucide-react";

export const dynamic = "force-dynamic";

type Periodo = "hoy" | "semana" | "mes";

const metodoLabel: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
};

/** Devuelve la fecha (YYYY-MM-DD) desde la que arranca el período, en hora de Guatemala. */
function desdeDe(periodo: Periodo): string {
  const hoy = hoyGT();
  const [y, m, d] = hoy.split("-").map(Number);
  if (periodo === "hoy") return hoy;
  if (periodo === "mes") return `${y}-${String(m).padStart(2, "0")}-01`;
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() - 6);
  return base.toISOString().slice(0, 10);
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const profile = await requireProfile();
  // Reportes son de socios y contador
  if (profile.role === "vendedor") redirect("/");

  const { periodo: p } = await searchParams;
  const periodo: Periodo = p === "hoy" || p === "semana" ? (p as Periodo) : "mes";
  const desdeFecha = desdeDe(periodo);
  const desdeTs = `${desdeFecha}T00:00:00-06:00`;

  const supabase = await createClient();

  const [ventasRes, itemsRes, gastosRes, productosRes] = await Promise.all([
    supabase
      .from("ventas")
      .select("id, total, metodo_pago, vendedor:profiles(nombre)")
      .eq("estado", "completada")
      .gte("fecha", desdeTs),
    supabase
      .from("venta_items")
      .select(
        "cantidad, total_linea, producto_id, producto:productos(nombre, sku, categoria:categorias(nombre, orden)), venta:ventas!inner(fecha, estado)",
      )
      .eq("venta.estado", "completada")
      .gte("venta.fecha", desdeTs),
    supabase.from("gastos").select("tipo, categoria, monto").gte("fecha", desdeFecha),
    supabase
      .from("productos")
      .select("id, nombre, sku, stock, precio_venta, costo")
      .eq("activo", true),
  ]);

  const ventas = (ventasRes.data ?? []) as unknown as {
    id: string;
    total: number;
    metodo_pago: string;
    vendedor: { nombre: string } | null;
  }[];

  const items = (itemsRes.data ?? []) as unknown as {
    cantidad: number;
    total_linea: number;
    producto_id: string;
    producto: {
      nombre: string;
      sku: string;
      categoria: { nombre: string; orden: number } | null;
    } | null;
  }[];

  const gastos = (gastosRes.data ?? []) as unknown as {
    tipo: "gasto" | "compra";
    categoria: string;
    monto: number;
  }[];

  const productos = (productosRes.data ?? []) as unknown as {
    id: string;
    nombre: string;
    sku: string;
    stock: number;
    precio_venta: number;
    costo: number | null;
  }[];

  // ---------- Resultado del período ----------
  const ingresos = ventas.reduce((s, v) => s + Number(v.total), 0);
  const totalGastos = gastos
    .filter((g) => g.tipo === "gasto")
    .reduce((s, g) => s + Number(g.monto), 0);
  const totalCompras = gastos
    .filter((g) => g.tipo === "compra")
    .reduce((s, g) => s + Number(g.monto), 0);
  const resultado = ingresos - totalGastos - totalCompras;
  const ticket = ventas.length ? ingresos / ventas.length : 0;

  // ---------- Desgloses ----------
  const acumular = <T,>(
    lista: T[],
    clave: (x: T) => string,
    monto: (x: T) => number,
    unidades?: (x: T) => number,
  ) => {
    const m = new Map<string, { nombre: string; total: number; unidades: number }>();
    for (const x of lista) {
      const k = clave(x);
      const cur = m.get(k) ?? { nombre: k, total: 0, unidades: 0 };
      cur.total += monto(x);
      cur.unidades += unidades ? unidades(x) : 1;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  };

  const porCategoria = acumular(
    items,
    (i) => i.producto?.categoria?.nombre ?? "Sin categoría",
    (i) => Number(i.total_linea),
    (i) => i.cantidad,
  );
  const porVendedor = acumular(
    ventas,
    (v) => v.vendedor?.nombre ?? "—",
    (v) => Number(v.total),
  );
  const porMetodo = acumular(
    ventas,
    (v) => metodoLabel[v.metodo_pago] ?? v.metodo_pago,
    (v) => Number(v.total),
  );
  const porGasto = acumular(gastos, (g) => g.categoria, (g) => Number(g.monto));

  const topProductos = acumular(
    items,
    (i) => i.producto?.nombre ?? "—",
    (i) => Number(i.total_linea),
    (i) => i.cantidad,
  )
    .sort((a, b) => b.unidades - a.unidades)
    .slice(0, 10);

  const vendidos = new Set(items.map((i) => i.producto_id));
  const sinMovimiento = productos.filter((p) => !vendidos.has(p.id));

  const valorVenta = productos.reduce((s, p) => s + p.stock * p.precio_venta, 0);
  const conCosto = productos.filter((p) => p.costo != null);
  const valorCosto = conCosto.reduce((s, p) => s + p.stock * (p.costo ?? 0), 0);

  const etiquetaPeriodo =
    periodo === "hoy" ? "Hoy" : periodo === "semana" ? "Últimos 7 días" : "Este mes";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Reportes</h1>
          <p className="text-sm text-muted-foreground">
            {etiquetaPeriodo} · desde {fechaCortaGT(desdeFecha)}
          </p>
        </div>
        <AccionesReporte
          periodo={etiquetaPeriodo}
          resumen={{ ingresos, totalGastos, totalCompras, resultado, ventas: ventas.length }}
          porCategoria={porCategoria}
          porVendedor={porVendedor}
          porMetodo={porMetodo}
          topProductos={topProductos}
        />
      </div>

      {/* Filtros */}
      <div className="flex gap-2 print:hidden">
        {(["hoy", "semana", "mes"] as Periodo[]).map((per) => (
          <Link
            key={per}
            href={`/reportes?periodo=${per}`}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm capitalize transition-colors",
              periodo === per
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-accent",
            )}
          >
            {per}
          </Link>
        ))}
      </div>

      {/* ---------- Resultado ---------- */}
      <Card className={cn("border-2", resultado >= 0 ? "border-primary/40" : "border-destructive/40")}>
        <CardContent className="py-5">
          <p className="text-sm text-muted-foreground">Resultado del período</p>
          <p
            className={cn(
              "mt-1 text-4xl font-bold",
              resultado >= 0 ? "text-primary" : "text-destructive",
            )}
          >
            {formatQ(resultado)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Ventas {formatQ(ingresos)} − gastos {formatQ(totalGastos)} − compras{" "}
            {formatQ(totalCompras)}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          icon={<TrendingUp className="h-4 w-4" />}
          label="Ventas"
          valor={formatQ(ingresos)}
          nota={`${ventas.length} ventas`}
          color="text-primary"
        />
        <Kpi
          icon={<Receipt className="h-4 w-4" />}
          label="Ticket promedio"
          valor={formatQ(ticket)}
        />
        <Kpi
          icon={<TrendingDown className="h-4 w-4" />}
          label="Gastos"
          valor={formatQ(totalGastos)}
          color="text-destructive"
        />
        <Kpi
          icon={<Wallet className="h-4 w-4" />}
          label="Compras"
          valor={formatQ(totalCompras)}
          color="text-destructive"
        />
      </div>

      {/* ---------- Desgloses ---------- */}
      <Desglose titulo="Ventas por categoría" filas={porCategoria} sufijoUnidades="u" />
      <Desglose titulo="Ventas por vendedor" filas={porVendedor} sufijoUnidades="ventas" />
      <Desglose titulo="Ventas por método de pago" filas={porMetodo} sufijoUnidades="ventas" />

      {/* Top productos */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-primary">Productos más vendidos</h2>
        {topProductos.length === 0 ? (
          <Vacio />
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {topProductos.map((t, i) => (
                  <li key={t.nombre} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-5 text-sm font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {t.nombre}
                    </span>
                    <span className="text-sm text-muted-foreground">{t.unidades} u</span>
                    <span className="w-24 text-right text-sm font-semibold">
                      {formatQ(t.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Gastos por categoría */}
      <Desglose titulo="Gastos y compras por categoría" filas={porGasto} sufijoUnidades="registros" negativo />

      {/* Inventario */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-primary">Inventario</h2>
        <Card>
          <CardContent className="grid grid-cols-2 gap-y-3 py-4 text-sm">
            <Dato label="Valor a precio de venta" valor={formatQ(valorVenta)} />
            <Dato
              label="Valor al costo"
              valor={
                conCosto.length === 0
                  ? "Sin datos de costo"
                  : `${formatQ(valorCosto)}${
                      conCosto.length < productos.length
                        ? ` (${conCosto.length}/${productos.length} productos)`
                        : ""
                    }`
              }
            />
            <Dato label="Productos activos" valor={String(productos.length)} />
            <Dato
              label="Sin movimiento en el período"
              valor={String(sinMovimiento.length)}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Kpi({
  icon,
  label,
  valor,
  nota,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  valor: string;
  nota?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="px-3 py-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon} {label}
        </div>
        <p className={cn("mt-1 text-lg font-bold", color)}>{valor}</p>
        {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
      </CardContent>
    </Card>
  );
}

function Desglose({
  titulo,
  filas,
  sufijoUnidades,
  negativo,
}: {
  titulo: string;
  filas: { nombre: string; total: number; unidades: number }[];
  sufijoUnidades: string;
  negativo?: boolean;
}) {
  const max = Math.max(...filas.map((f) => f.total), 1);
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-primary">{titulo}</h2>
      {filas.length === 0 ? (
        <Vacio />
      ) : (
        <Card>
          <CardContent className="space-y-3 py-4">
            {filas.map((f) => (
              <div key={f.nombre} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{f.nombre}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {f.unidades} {sufijoUnidades}
                  </span>
                  <span
                    className={cn(
                      "w-24 shrink-0 text-right font-semibold",
                      negativo ? "text-destructive" : "",
                    )}
                  >
                    {formatQ(f.total)}
                  </span>
                </div>
                {/* Barra proporcional (sin librerías) */}
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      negativo ? "bg-destructive/60" : "bg-primary",
                    )}
                    style={{ width: `${Math.max((f.total / max) * 100, 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{valor}</div>
    </div>
  );
}

function Vacio() {
  return (
    <p className="py-4 text-center text-sm text-muted-foreground">
      Sin datos en este período.
    </p>
  );
}
