"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { hoyGT } from "@/lib/format";
import type { MetodoPago } from "@/lib/database.types";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";

export const CATEGORIAS: Record<"gasto" | "compra", string[]> = {
  gasto: [
    "Alquiler",
    "Servicios (luz/agua/internet)",
    "Salarios",
    "Impuestos",
    "Mantenimiento",
    "Transporte",
    "Otros",
  ],
  compra: ["Mercadería", "Papelería", "Empaque", "Equipo", "Otros"],
};

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "otro", label: "Otro" },
];

export function NuevoGasto({ userId }: { userId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<"gasto" | "compra">("gasto");
  const [categoria, setCategoria] = useState(CATEGORIAS.gasto[0]);
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyGT());
  const [proveedor, setProveedor] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [procesando, setProcesando] = useState(false);

  function cambiarTipo(t: "gasto" | "compra") {
    setTipo(t);
    setCategoria(CATEGORIAS[t][0]);
  }

  function reset() {
    setTipo("gasto");
    setCategoria(CATEGORIAS.gasto[0]);
    setMonto("");
    setFecha(hoyGT());
    setProveedor("");
    setDescripcion("");
    setMetodo("efectivo");
  }

  async function guardar() {
    const m = Number(monto);
    if (!m || m <= 0) {
      toast.warning("Ingresa un monto mayor que cero.");
      return;
    }
    setProcesando(true);
    const supabase = createClient();
    const { error } = await supabase.from("gastos").insert({
      tipo,
      categoria,
      monto: m,
      fecha,
      proveedor: proveedor.trim() || null,
      descripcion: descripcion.trim() || null,
      metodo_pago: metodo,
      registrado_por: userId,
    });
    setProcesando(false);

    if (error) {
      toast.error(error.message ?? "No se pudo guardar.");
      return;
    }
    toast.success(tipo === "gasto" ? "Gasto registrado." : "Compra registrada.");
    reset();
    setAbierto(false);
    router.refresh();
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button />}>
        <Plus className="h-4 w-4" /> Nuevo
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar {tipo === "gasto" ? "gasto" : "compra"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cambiarTipo("gasto")}
              className={
                "rounded-lg border py-2 text-sm font-medium transition-colors " +
                (tipo === "gasto"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-accent")
              }
            >
              Gasto
            </button>
            <button
              type="button"
              onClick={() => cambiarTipo("compra")}
              className={
                "rounded-lg border py-2 text-sm font-medium transition-colors " +
                (tipo === "compra"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-accent")
              }
            >
              Compra
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select
                value={categoria}
                onValueChange={(v) => v && setCategoria(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS[tipo].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="monto">Monto (Q)</Label>
              <Input
                id="monto"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fecha">Fecha</Label>
              <Input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Método de pago</Label>
              <Select value={metodo} onValueChange={(v) => setMetodo(v as MetodoPago)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METODOS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="proveedor">Proveedor / a quién (opcional)</Label>
            <Input
              id="proveedor"
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              placeholder="Ej. Distribuidora Paulinas"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descripcion">Descripción (opcional)</Label>
            <Input
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalle del gasto o compra"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setAbierto(false)} disabled={procesando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={procesando}>
            {procesando && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
