import Link from "next/link";
import { requireProfile, puedeVender } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatQ, fechaCortaGT, hoyGT } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NuevoGasto } from "@/components/gastos/nuevo-gasto";

export const dynamic = "force-dynamic";

type Periodo = "hoy" | "semana" | "mes";
type Filtro = "todos" | "gasto" | "compra";

const metodoLabel: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
};

function desdeDe(periodo: Periodo): string {
  const hoy = hoyGT(); // YYYY-MM-DD
  const [y, m, d] = hoy.split("-").map(Number);
  if (periodo === "hoy") return hoy;
  if (periodo === "mes") return `${y}-${String(m).padStart(2, "0")}-01`;
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() - 6);
  return base.toISOString().slice(0, 10);
}

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; tipo?: string }>;
}) {
  const profile = await requireProfile();
  const { periodo: p, tipo: t } = await searchParams;
  const periodo: Periodo = p === "hoy" || p === "semana" ? (p as Periodo) : "mes";
  const filtro: Filtro = t === "gasto" || t === "compra" ? (t as Filtro) : "todos";

  const supabase = await createClient();
  let query = supabase
    .from("gastos")
    .select(
      "id, fecha, tipo, categoria, proveedor, descripcion, monto, metodo_pago, registrado:profiles(nombre)",
    )
    .gte("fecha", desdeDe(periodo))
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (filtro !== "todos") query = query.eq("tipo", filtro);

  const { data } = await query;
  const gastos = (data ?? []) as unknown as {
    id: string;
    fecha: string;
    tipo: "gasto" | "compra";
    categoria: string;
    proveedor: string | null;
    descripcion: string | null;
    monto: number;
    metodo_pago: string;
    registrado: { nombre: string } | null;
  }[];

  const totalGastos = gastos
    .filter((g) => g.tipo === "gasto")
    .reduce((s, g) => s + Number(g.monto), 0);
  const totalCompras = gastos
    .filter((g) => g.tipo === "compra")
    .reduce((s, g) => s + Number(g.monto), 0);
  const total = totalGastos + totalCompras;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Gastos y compras</h1>
        {puedeVender(profile) && <NuevoGasto userId={profile.id} />}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-2">
        <Resumen label="Gastos" valor={formatQ(totalGastos)} />
        <Resumen label="Compras" valor={formatQ(totalCompras)} />
        <Resumen label="Total salidas" valor={formatQ(total)} destacado />
      </div>

      {/* Filtros de período */}
      <div className="flex flex-wrap gap-2">
        {(["hoy", "semana", "mes"] as Periodo[]).map((per) => (
          <Link
            key={per}
            href={`/gastos?periodo=${per}${filtro !== "todos" ? `&tipo=${filtro}` : ""}`}
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
        <span className="mx-1 w-px self-stretch bg-border" />
        {(["todos", "gasto", "compra"] as Filtro[]).map((f) => (
          <Link
            key={f}
            href={`/gastos?periodo=${periodo}${f !== "todos" ? `&tipo=${f}` : ""}`}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm capitalize transition-colors",
              filtro === f
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-accent",
            )}
          >
            {f === "gasto" ? "Gastos" : f === "compra" ? "Compras" : "Todos"}
          </Link>
        ))}
      </div>

      {/* Lista */}
      {gastos.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No hay registros en este período.
        </p>
      ) : (
        <div className="space-y-2">
          {gastos.map((g) => (
            <Card key={g.id}>
              <CardContent className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={g.tipo === "compra" ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {g.tipo === "compra" ? "Compra" : "Gasto"}
                    </Badge>
                    <span className="truncate font-medium">{g.categoria}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {fechaCortaGT(g.fecha)} · {metodoLabel[g.metodo_pago]}
                    {g.proveedor ? ` · ${g.proveedor}` : ""}
                    {g.registrado?.nombre ? ` · ${g.registrado.nombre}` : ""}
                  </p>
                  {g.descripcion && (
                    <p className="truncate text-xs text-muted-foreground">
                      {g.descripcion}
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-semibold text-destructive">
                  − {formatQ(g.monto)}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Resumen({
  label,
  valor,
  destacado,
}: {
  label: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <Card>
      <CardContent className="px-3 py-3 text-center">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-0.5 font-bold",
            destacado ? "text-lg text-destructive" : "text-lg",
          )}
        >
          {valor}
        </p>
      </CardContent>
    </Card>
  );
}
