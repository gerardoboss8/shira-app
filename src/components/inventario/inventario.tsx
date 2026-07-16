"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatQ, hoyGT } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Categoria } from "@/lib/database.types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MovimientoDialog } from "@/components/inventario/movimiento-dialog";
import {
  ProductoDialog,
  type ProductoEdit,
} from "@/components/inventario/producto-dialog";
import {
  Search,
  Download,
  ArrowUpDown,
  AlertTriangle,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  RotateCcw,
  Loader2,
} from "lucide-react";

export type ProductoInv = {
  id: string;
  nombre: string;
  sku: string;
  precio_venta: number;
  stock: number;
  stock_minimo: number;
  activo: boolean;
  categoria_id: string;
  categoria: { nombre: string; prefijo: string; orden: number } | null;
};

export function Inventario({
  productos,
  categorias,
  esAdmin,
}: {
  productos: ProductoInv[];
  categorias: Categoria[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [productoMov, setProductoMov] = useState<ProductoInv | null>(null);
  const [productoEdit, setProductoEdit] = useState<ProductoEdit | null>(null);
  const [dialogProducto, setDialogProducto] = useState(false);
  const [porQuitar, setPorQuitar] = useState<ProductoInv | null>(null);
  const [procesando, setProcesando] = useState(false);

  const activos = productos.filter((p) => p.activo);
  const inactivos = productos.filter((p) => !p.activo);

  const visibles = useMemo(() => {
    const base = verInactivos ? productos : activos;
    const q = busqueda.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }, [productos, activos, verInactivos, busqueda]);

  // Los totales siempre reflejan el inventario activo
  const unidades = activos.reduce((s, p) => s + p.stock, 0);
  const valor = activos.reduce((s, p) => s + p.stock * p.precio_venta, 0);
  const bajoStock = activos.filter((p) => p.stock <= p.stock_minimo).length;

  const grupos = useMemo(() => {
    const map = new Map<string, { nombre: string; orden: number; items: ProductoInv[] }>();
    for (const p of visibles) {
      const key = p.categoria?.nombre ?? "Sin categoría";
      if (!map.has(key)) {
        map.set(key, { nombre: key, orden: p.categoria?.orden ?? 99, items: [] });
      }
      map.get(key)!.items.push(p);
    }
    return [...map.values()].sort((a, b) => a.orden - b.orden);
  }, [visibles]);

  function abrirNuevo() {
    setProductoEdit(null);
    setDialogProducto(true);
  }

  function abrirEditar(p: ProductoInv) {
    setProductoEdit({
      id: p.id,
      nombre: p.nombre,
      sku: p.sku,
      precio_venta: p.precio_venta,
      stock_minimo: p.stock_minimo,
      categoria_id: p.categoria_id,
    });
    setDialogProducto(true);
  }

  async function cambiarActivo(p: ProductoInv, activo: boolean) {
    setProcesando(true);
    const { error } = await createClient()
      .from("productos")
      .update({ activo })
      .eq("id", p.id);
    setProcesando(false);
    if (error) {
      toast.error(error.message ?? "No se pudo actualizar.");
      return;
    }
    toast.success(
      activo
        ? `"${p.nombre}" volvió al inventario.`
        : `"${p.nombre}" se quitó del inventario.`,
    );
    setPorQuitar(null);
    router.refresh();
  }

  function exportarCSV() {
    const filas = [
      ["SKU", "Producto", "Categoria", "Stock", "Precio_venta", "Valor"],
      ...activos.map((p) => [
        p.sku,
        `"${p.nombre.replace(/"/g, '""')}"`,
        p.categoria?.nombre ?? "",
        String(p.stock),
        p.precio_venta.toFixed(2),
        (p.stock * p.precio_venta).toFixed(2),
      ]),
    ];
    const csv = "﻿" + filas.map((f) => f.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventario_shira_${hoyGT()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Inventario</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportarCSV}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          {esAdmin && (
            <Button size="sm" onClick={abrirNuevo}>
              <Plus className="h-4 w-4" /> Producto
            </Button>
          )}
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-2">
        <Resumen label="Unidades" valor={unidades.toLocaleString("en-US")} />
        <Resumen label="Valor (venta)" valor={formatQ(valor)} />
        <Resumen label="Stock bajo" valor={String(bajoStock)} alerta={bajoStock > 0} />
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre o SKU…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {esAdmin && inactivos.length > 0 && (
        <button
          onClick={() => setVerInactivos((v) => !v)}
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          {verInactivos
            ? "Ocultar productos quitados"
            : `Ver productos quitados (${inactivos.length})`}
        </button>
      )}

      {/* Tabla por categoría */}
      {grupos.map((g) => (
        <div key={g.nombre} className="space-y-2">
          <h2 className="text-sm font-semibold text-primary">{g.nombre}</h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {g.items.map((p) => {
                  const bajo = p.activo && p.stock <= p.stock_minimo;
                  return (
                    <li
                      key={p.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3",
                        !p.activo && "opacity-60",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-medium">{p.nombre}</p>
                          {!p.activo && (
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              Quitado
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {p.sku} · {formatQ(p.precio_venta)}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {bajo && (
                            <Badge variant="destructive" className="gap-1 text-[10px]">
                              <AlertTriangle className="h-3 w-3" /> Bajo
                            </Badge>
                          )}
                          <span
                            className={cn(
                              "font-semibold tabular-nums",
                              bajo && "text-destructive",
                            )}
                          >
                            {p.stock}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatQ(p.stock * p.precio_venta)}
                        </p>
                      </div>

                      {esAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 shrink-0"
                                aria-label="Acciones"
                              />
                            }
                          >
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {p.activo ? (
                              <>
                                <DropdownMenuItem onClick={() => setProductoMov(p)}>
                                  <ArrowUpDown className="h-4 w-4" /> Mover inventario
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => abrirEditar(p)}>
                                  <Pencil className="h-4 w-4" /> Editar producto
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setPorQuitar(p)}>
                                  <Trash2 className="h-4 w-4" /> Quitar del inventario
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem onClick={() => cambiarActivo(p, true)}>
                                <RotateCcw className="h-4 w-4" /> Devolver al inventario
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      ))}

      {grupos.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No se encontraron productos.
        </p>
      )}

      {esAdmin && (
        <>
          <MovimientoDialog
            producto={productoMov}
            abierto={!!productoMov}
            onClose={() => setProductoMov(null)}
          />
          <ProductoDialog
            categorias={categorias}
            producto={productoEdit}
            abierto={dialogProducto}
            onClose={() => setDialogProducto(false)}
          />

          {/* Confirmación para quitar */}
          <Dialog open={!!porQuitar} onOpenChange={(o) => !o && setPorQuitar(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Quitar del inventario</DialogTitle>
                <DialogDescription>
                  &quot;{porQuitar?.nombre}&quot; dejará de aparecer en el inventario y
                  en el punto de venta. Sus ventas y movimientos anteriores se
                  conservan, y puedes devolverlo cuando quieras.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setPorQuitar(null)}
                  disabled={procesando}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => porQuitar && cambiarActivo(porQuitar, false)}
                  disabled={procesando}
                >
                  {procesando && <Loader2 className="h-4 w-4 animate-spin" />}
                  Quitar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function Resumen({
  label,
  valor,
  alerta,
}: {
  label: string;
  valor: string;
  alerta?: boolean;
}) {
  return (
    <Card>
      <CardContent className="px-3 py-3 text-center">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-0.5 text-lg font-bold",
            alerta ? "text-destructive" : "text-foreground",
          )}
        >
          {valor}
        </p>
      </CardContent>
    </Card>
  );
}
