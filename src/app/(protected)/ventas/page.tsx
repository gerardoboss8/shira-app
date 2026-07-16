import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatQ, fechaHoraGT, folioVenta, hoyGT } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

type Periodo = "hoy" | "semana" | "mes";

const metodoLabel: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
};

function desdeDe(periodo: Periodo): string {
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

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requireProfile();
  const { periodo: p } = await searchParams;
  const periodo: Periodo =
    p === "semana" || p === "mes" ? (p as Periodo) : "hoy";

  const supabase = await createClient();
  const { data } = await supabase
    .from("ventas")
    .select(
      "id, folio, fecha, cliente_nombre, metodo_pago, total, estado, vendedor:profiles(nombre)",
    )
    .gte("fecha", desdeDe(periodo))
    .order("fecha", { ascending: false });

  const ventas = (data ?? []) as unknown as {
    id: string;
    folio: number;
    fecha: string;
    cliente_nombre: string | null;
    metodo_pago: string;
    total: number;
    estado: string;
    vendedor: { nombre: string } | null;
  }[];

  const totalPeriodo = ventas
    .filter((v) => v.estado === "completada")
    .reduce((s, v) => s + Number(v.total), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ventas</h1>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {(["hoy", "semana", "mes"] as Periodo[]).map((per) => (
          <Link
            key={per}
            href={`/ventas?periodo=${per}`}
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

      {/* Total del período */}
      <Card className="bg-accent/40">
        <CardContent className="flex items-center justify-between py-4">
          <span className="text-sm text-muted-foreground">
            Total {periodo} · {ventas.filter((v) => v.estado === "completada").length}{" "}
            ventas
          </span>
          <span className="text-xl font-bold text-primary">
            {formatQ(totalPeriodo)}
          </span>
        </CardContent>
      </Card>

      {/* Lista */}
      {ventas.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No hay ventas en este período.
        </p>
      ) : (
        <div className="space-y-2">
          {ventas.map((v) => (
            <Link key={v.id} href={`/ventas/${v.id}`}>
              <Card className="transition-colors hover:border-primary">
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{folioVenta(v.folio)}</span>
                      {v.estado === "anulada" && (
                        <Badge variant="destructive" className="text-[10px]">
                          Anulada
                        </Badge>
                      )}
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
