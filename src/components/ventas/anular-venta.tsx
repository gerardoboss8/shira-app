"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Ban, Loader2 } from "lucide-react";

export function AnularVenta({ ventaId, folio }: { ventaId: string; folio: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [procesando, setProcesando] = useState(false);

  async function anular() {
    if (!motivo.trim()) {
      toast.warning("Indica el motivo de la anulación.");
      return;
    }
    setProcesando(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("anular_venta", {
      p_venta_id: ventaId,
      p_motivo: motivo.trim(),
    });
    setProcesando(false);

    if (error) {
      toast.error(error.message ?? "No se pudo anular la venta.");
      return;
    }
    toast.success(`Venta ${folio} anulada. Se devolvió el stock.`);
    setAbierto(false);
    router.refresh();
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button variant="outline" className="text-destructive hover:text-destructive" />
        }
      >
        <Ban className="h-4 w-4" /> Anular venta
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular {folio}</DialogTitle>
          <DialogDescription>
            Esto marca la venta como anulada y devuelve el stock de sus productos.
            La acción queda registrada. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="motivo">Motivo (obligatorio)</Label>
          <Input
            id="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. Producto devuelto por el cliente"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAbierto(false)} disabled={procesando}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={anular} disabled={procesando}>
            {procesando && <Loader2 className="h-4 w-4 animate-spin" />}
            Anular venta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
