import Link from "next/link";
import { requireProfile, esAdmin, puedeVender } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatQ, fechaLargaGT, fechaCortaGT, hoyGT } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart, Pin, CalendarDays, Receipt, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const admin = esAdmin(profile);

  const desdeHoy = `${hoyGT()}T00:00:00-06:00`;

  const [fijadosRes, fechasRes, ventasHoyRes] = await Promise.all([
    supabase
      .from("recordatorios")
      .select("id, titulo, descripcion")
      .eq("fijado", true)
      .eq("completado", false)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("recordatorios")
      .select("id, titulo, fecha")
      .eq("tipo", "fecha_importante")
      .gte("fecha", hoyGT())
      .order("fecha", { ascending: true })
      .limit(5),
    admin
      ? supabase
          .from("ventas")
          .select("total")
          .eq("estado", "completada")
          .gte("fecha", desdeHoy)
      : Promise.resolve({ data: null }),
  ]);

  const fijados = fijadosRes.data ?? [];
  const fechas = fechasRes.data ?? [];
  const ventasHoy = (ventasHoyRes.data ?? []) as { total: number }[];
  const totalHoy = ventasHoy.reduce((s, v) => s + Number(v.total), 0);

  const primerNombre = profile.nombre.split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hola, {primerNombre} 👋</h1>
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {fechaLargaGT()}
        </p>
      </div>

      {puedeVender(profile) && (
        <Button
          render={<Link href="/ventas/nueva" />}
          nativeButton={false}
          size="lg"
          className="h-16 w-full text-lg shadow-sm"
        >
          <ShoppingCart className="h-6 w-6" /> Nueva venta
        </Button>
      )}

      {admin && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <TrendingUp className="h-4 w-4" /> Ventas de hoy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">{formatQ(totalHoy)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Receipt className="h-4 w-4" /> Nº de ventas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{ventasHoy.length}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {fijados.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Pin className="h-4 w-4" /> Avisos
          </h2>
          <div className="space-y-2">
            {fijados.map((r) => (
              <Card key={r.id} className="border-l-4 border-l-primary">
                <CardContent className="py-3">
                  <p className="font-medium">{r.titulo}</p>
                  {r.descripcion && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {r.descripcion}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <CalendarDays className="h-4 w-4" /> Próximas fechas importantes
        </h2>
        {fechas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin fechas próximas.</p>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {fechas.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <span className="text-sm font-medium">{f.titulo}</span>
                  <span className="text-sm text-muted-foreground">
                    {f.fecha ? fechaCortaGT(f.fecha) : ""}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
