import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile, esAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatQ, fechaHoraGT, folioVenta } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnularVenta } from "@/components/ventas/anular-venta";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const metodoLabel: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
};

export default async function VentaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = await createClient();

  const { data: venta } = await supabase
    .from("ventas")
    .select(
      "id, folio, fecha, cliente_nombre, metodo_pago, subtotal, descuento, total, estado, nota, vendedor:profiles(nombre)",
    )
    .eq("id", id)
    .single();

  if (!venta) notFound();

  const { data: items } = await supabase
    .from("venta_items")
    .select("cantidad, precio_unitario, total_linea, producto:productos(nombre, sku)")
    .eq("venta_id", id);

  const vendedor = (venta.vendedor as unknown as { nombre: string } | null)?.nombre;
  const lineas = (items ?? []) as unknown as {
    cantidad: number;
    precio_unitario: number;
    total_linea: number;
    producto: { nombre: string; sku: string } | null;
  }[];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Button
        render={<Link href="/ventas" />}
        nativeButton={false}
        variant="ghost"
        size="sm"
        className="-ml-2"
      >
        <ArrowLeft className="h-4 w-4" /> Ventas
      </Button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{folioVenta(venta.folio)}</h1>
            {venta.estado === "anulada" && (
              <Badge variant="destructive">Anulada</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{fechaHoraGT(venta.fecha)}</p>
        </div>
        {esAdmin(profile) && venta.estado === "completada" && (
          <AnularVenta ventaId={venta.id} folio={folioVenta(venta.folio)} />
        )}
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-y-2 py-4 text-sm">
          <Dato label="Método de pago" valor={metodoLabel[venta.metodo_pago]} />
          <Dato label="Vendedor" valor={vendedor ?? "—"} />
          <Dato label="Cliente" valor={venta.cliente_nombre || "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2 font-medium">Producto</th>
                <th className="px-2 py-2 text-center font-medium">Cant.</th>
                <th className="px-2 py-2 text-right font-medium">P. unit.</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lineas.map((l, i) => (
                <tr key={i}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{l.producto?.nombre ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.producto?.sku}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-center">{l.cantidad}</td>
                  <td className="px-2 py-2.5 text-right">
                    {formatQ(l.precio_unitario)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {formatQ(l.total_linea)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1 border-t px-4 py-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatQ(venta.subtotal)}</span>
            </div>
            {Number(venta.descuento) > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Descuento</span>
                <span>− {formatQ(venta.descuento)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">{formatQ(venta.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {venta.nota && (
        <Card>
          <CardContent className="py-3 text-sm">
            <span className="text-muted-foreground">Nota: </span>
            {venta.nota}
          </CardContent>
        </Card>
      )}
    </div>
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
