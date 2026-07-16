"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Categoria } from "@/lib/database.types";
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

export type ProductoEdit = {
  id: string;
  nombre: string;
  sku: string;
  precio_venta: number;
  costo?: number | null;
  stock_minimo: number;
  categoria_id?: string;
};

export function ProductoDialog({
  categorias,
  producto,
  abierto,
  onClose,
}: {
  categorias: Categoria[];
  producto: ProductoEdit | null; // null = crear
  abierto: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const editando = !!producto;

  const [categoriaId, setCategoriaId] = useState("");
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [costo, setCosto] = useState("");
  const [stockInicial, setStockInicial] = useState("");
  const [stockMinimo, setStockMinimo] = useState("2");
  const [procesando, setProcesando] = useState(false);

  // Carga los valores al abrir
  useEffect(() => {
    if (!abierto) return;
    setCategoriaId(producto?.categoria_id ?? categorias[0]?.id ?? "");
    setNombre(producto?.nombre ?? "");
    setPrecio(producto ? String(producto.precio_venta) : "");
    setCosto(producto?.costo != null ? String(producto.costo) : "");
    setStockInicial("");
    setStockMinimo(producto ? String(producto.stock_minimo) : "2");
  }, [abierto, producto, categorias]);

  async function guardar() {
    if (!nombre.trim()) {
      toast.warning("Escribe el nombre del producto.");
      return;
    }
    const p = Number(precio);
    if (!Number.isFinite(p) || p < 0) {
      toast.warning("Ingresa un precio válido.");
      return;
    }
    if (!categoriaId) {
      toast.warning("Elige una categoría.");
      return;
    }

    const costoNum = costo.trim() === "" ? null : Number(costo);
    const minimo = Math.max(0, Math.floor(Number(stockMinimo) || 0));
    const supabase = createClient();
    setProcesando(true);

    if (editando) {
      const { error } = await supabase
        .from("productos")
        .update({
          categoria_id: categoriaId,
          nombre: nombre.trim(),
          precio_venta: p,
          costo: costoNum,
          stock_minimo: minimo,
        })
        .eq("id", producto!.id);
      setProcesando(false);
      if (error) {
        toast.error(error.message ?? "No se pudo guardar.");
        return;
      }
      toast.success("Producto actualizado.");
    } else {
      const inicial = Math.max(0, Math.floor(Number(stockInicial) || 0));
      const { data, error } = await supabase.rpc("crear_producto", {
        p_categoria_id: categoriaId,
        p_nombre: nombre.trim(),
        p_precio_venta: p,
        p_stock_inicial: inicial,
        p_stock_minimo: minimo,
        p_costo: costoNum,
      });
      setProcesando(false);
      if (error) {
        toast.error(error.message ?? "No se pudo crear el producto.");
        return;
      }
      const res = data as { sku: string };
      toast.success(`Producto creado con SKU ${res.sku}.`);
    }

    onClose();
    router.refresh();
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editando ? "Editar producto" : "Nuevo producto"}
          </DialogTitle>
          <DialogDescription>
            {editando
              ? `${producto?.sku} · el stock se cambia con movimientos, no aquí.`
              : "El SKU se genera solo según la categoría (ej. BIB-016)."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Biblia Latinoamericana Grande"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Select
              value={categoriaId}
              onValueChange={(v) => v && setCategoriaId(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Elige una categoría" />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="precio">Precio de venta (Q)</Label>
              <Input
                id="precio"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="costo">Costo (Q, opcional)</Label>
              <Input
                id="costo"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                placeholder="—"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!editando && (
              <div className="space-y-1.5">
                <Label htmlFor="stockInicial">Stock inicial</Label>
                <Input
                  id="stockInicial"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={stockInicial}
                  onChange={(e) => setStockInicial(e.target.value)}
                  placeholder="0"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="stockMinimo">Alerta de stock bajo</Label>
              <Input
                id="stockMinimo"
                type="number"
                inputMode="numeric"
                min={0}
                value={stockMinimo}
                onChange={(e) => setStockMinimo(e.target.value)}
                placeholder="2"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={procesando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={procesando}>
            {procesando && <Loader2 className="h-4 w-4 animate-spin" />}
            {editando ? "Guardar cambios" : "Crear producto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
