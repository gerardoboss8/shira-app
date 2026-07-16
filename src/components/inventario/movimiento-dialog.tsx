"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

type Movimiento = "entrada" | "merma" | "ajuste_mas" | "ajuste_menos";

const OPCIONES: { value: Movimiento; label: string; requiereNota: boolean }[] = [
  { value: "entrada", label: "Entrada de mercadería (+)", requiereNota: false },
  { value: "ajuste_mas", label: "Ajuste — sumar (+)", requiereNota: true },
  { value: "ajuste_menos", label: "Ajuste — restar (−)", requiereNota: true },
  { value: "merma", label: "Merma / pérdida (−)", requiereNota: true },
];

export function MovimientoDialog({
  producto,
  abierto,
  onClose,
}: {
  producto: { id: string; nombre: string; sku: string; stock: number } | null;
  abierto: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [movimiento, setMovimiento] = useState<Movimiento>("entrada");
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [procesando, setProcesando] = useState(false);

  const opcion = OPCIONES.find((o) => o.value === movimiento)!;

  function reset() {
    setMovimiento("entrada");
    setCantidad("");
    setNota("");
  }

  async function guardar() {
    if (!producto) return;
    const qty = Math.floor(Number(cantidad));
    if (!qty || qty <= 0) {
      toast.warning("Ingresa una cantidad mayor que cero.");
      return;
    }
    if (opcion.requiereNota && !nota.trim()) {
      toast.warning("Este movimiento requiere una nota.");
      return;
    }

    const tipo = movimiento === "entrada" ? "entrada" : movimiento === "merma" ? "merma" : "ajuste";
    const signo = movimiento === "entrada" || movimiento === "ajuste_mas" ? 1 : -1;

    setProcesando(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("registrar_movimiento", {
      p_producto_id: producto.id,
      p_tipo: tipo as "entrada" | "ajuste" | "merma",
      p_cantidad: signo * qty,
      p_nota: nota.trim() || null,
    });
    setProcesando(false);

    if (error) {
      toast.error(error.message ?? "No se pudo registrar el movimiento.");
      return;
    }
    toast.success("Movimiento registrado. Stock actualizado.");
    reset();
    onClose();
    router.refresh();
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover inventario</DialogTitle>
          <DialogDescription>
            {producto?.nombre} · {producto?.sku} · stock actual: {producto?.stock}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo de movimiento</Label>
            <Select value={movimiento} onValueChange={(v) => setMovimiento(v as Movimiento)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPCIONES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cantidad">Cantidad</Label>
            <Input
              id="cantidad"
              type="number"
              inputMode="numeric"
              min={1}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nota">
              Nota {opcion.requiereNota ? "(obligatoria)" : "(opcional)"}
            </Label>
            <Input
              id="nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej. Compra a proveedor, corrección de conteo…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={procesando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={procesando}>
            {procesando && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar movimiento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
