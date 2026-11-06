"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Pencil } from "lucide-react";

export type DatosClienteVenta = {
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  cliente_direccion: string | null;
  cliente_referencia: string | null;
  envio_empresa: string | null;
  envio_costo: number;
};

/** Completar o corregir los datos del cliente y envío de una venta ya hecha. */
export function EditarDatosCliente({
  ventaId,
  folio,
  datos,
}: {
  ventaId: string;
  folio: string;
  datos: DatosClienteVenta;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [f, setF] = useState(() => valores(datos));

  function abrir() {
    setF(valores(datos));
    setAbierto(true);
  }

  async function guardar() {
    const costo = f.envio_costo.trim() === "" ? 0 : Number(f.envio_costo);
    if (!Number.isFinite(costo) || costo < 0) {
      toast.warning("El costo de envío no es válido.");
      return;
    }
    setProcesando(true);
    const { error } = await createClient().rpc("actualizar_datos_cliente", {
      p_venta_id: ventaId,
      p_cliente_nombre: f.cliente_nombre.trim() || null,
      p_datos_cliente: {
        telefono: f.cliente_telefono.trim() || null,
        direccion: f.cliente_direccion.trim() || null,
        referencia: f.cliente_referencia.trim() || null,
        envio_empresa: f.envio_empresa.trim() || null,
        envio_costo: costo,
      },
    });
    setProcesando(false);
    if (error) {
      toast.error(error.message ?? "No se pudo guardar.");
      return;
    }
    toast.success("Datos del cliente guardados.");
    setAbierto(false);
    router.refresh();
  }

  const campo = (
    clave: keyof ReturnType<typeof valores>,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`dc-${clave}`}>{label}</Label>
      <Input
        id={`dc-${clave}`}
        value={f[clave]}
        onChange={(e) => setF((prev) => ({ ...prev, [clave]: e.target.value }))}
        {...props}
      />
    </div>
  );

  return (
    <>
      <Button variant="outline" size="sm" onClick={abrir}>
        <Pencil className="h-4 w-4" /> Datos del cliente
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => !o && setAbierto(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Datos del cliente · {folio}</DialogTitle>
            <DialogDescription>
              Salen en el comprobante de pago. No cambian montos ni inventario.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {campo("cliente_nombre", "Nombre")}
            {campo("cliente_telefono", "Teléfono", { type: "tel", inputMode: "tel" })}
            {campo("cliente_direccion", "Dirección")}
            {campo("cliente_referencia", "Referencia")}
            <div className="grid grid-cols-[1fr_110px] gap-3">
              {campo("envio_empresa", "Envío por", { placeholder: "Forza – departamentos" })}
              {campo("envio_costo", "Costo (Q)", {
                type: "number",
                inputMode: "decimal",
                min: 0,
                placeholder: "0.00",
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={procesando}>
              {procesando && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function valores(d: DatosClienteVenta) {
  return {
    cliente_nombre: d.cliente_nombre ?? "",
    cliente_telefono: d.cliente_telefono ?? "",
    cliente_direccion: d.cliente_direccion ?? "",
    cliente_referencia: d.cliente_referencia ?? "",
    envio_empresa: d.envio_empresa ?? "",
    envio_costo: d.envio_costo ? String(d.envio_costo) : "",
  };
}
