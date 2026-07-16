"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatQ, folioVenta } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Categoria, MetodoPago, Rol } from "@/lib/database.types";
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
  Minus,
  Plus,
  Search,
  Trash2,
  ShoppingCart,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";

type ProductoPOS = {
  id: string;
  nombre: string;
  sku: string;
  precio_venta: number;
  stock: number;
  categoria_id: string;
};

type LineaCarrito = { producto: ProductoPOS; cantidad: number };

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "otro", label: "Otro" },
];

export function POS({
  role,
  categorias,
  productos,
}: {
  role: Rol;
  categorias: Categoria[];
  productos: ProductoPOS[];
}) {
  const router = useRouter();
  const esAdmin = role === "admin";

  const [busqueda, setBusqueda] = useState("");
  const [catActiva, setCatActiva] = useState<string | "todas">("todas");
  const [carrito, setCarrito] = useState<Map<string, LineaCarrito>>(new Map());
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [cliente, setCliente] = useState("");
  const [descuento, setDescuento] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState<{ folio: number; total: number } | null>(null);

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      if (catActiva !== "todas" && p.categoria_id !== catActiva) return false;
      if (!q) return true;
      return (
        p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      );
    });
  }, [productos, busqueda, catActiva]);

  const lineas = [...carrito.values()];
  const subtotal = lineas.reduce(
    (s, l) => s + l.producto.precio_venta * l.cantidad,
    0,
  );
  const descNum = Math.max(0, Number(descuento) || 0);
  const total = Math.max(subtotal - descNum, 0);
  const totalUnidades = lineas.reduce((s, l) => s + l.cantidad, 0);

  function agregar(p: ProductoPOS) {
    setCarrito((prev) => {
      const next = new Map(prev);
      const actual = next.get(p.id);
      const cantidad = (actual?.cantidad ?? 0) + 1;
      if (cantidad > p.stock) {
        toast.warning(`Solo hay ${p.stock} de "${p.nombre}" en stock.`);
        return prev;
      }
      next.set(p.id, { producto: p, cantidad });
      return next;
    });
  }

  function cambiarCantidad(id: string, delta: number) {
    setCarrito((prev) => {
      const next = new Map(prev);
      const linea = next.get(id);
      if (!linea) return prev;
      const cantidad = linea.cantidad + delta;
      if (cantidad <= 0) {
        next.delete(id);
      } else if (cantidad > linea.producto.stock) {
        toast.warning(`Solo hay ${linea.producto.stock} en stock.`);
        return prev;
      } else {
        next.set(id, { ...linea, cantidad });
      }
      return next;
    });
  }

  function quitar(id: string) {
    setCarrito((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  function nuevaVenta() {
    setCarrito(new Map());
    setCliente("");
    setDescuento("");
    setMetodo("efectivo");
    setBusqueda("");
    setResultado(null);
    router.refresh(); // recarga stock actualizado
  }

  async function confirmar() {
    if (lineas.length === 0) return;
    setProcesando(true);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("registrar_venta", {
      p_items: lineas.map((l) => ({
        producto_id: l.producto.id,
        cantidad: l.cantidad,
      })),
      p_metodo_pago: metodo,
      p_cliente_nombre: cliente.trim() || null,
      p_descuento: esAdmin ? descNum : 0,
      p_nota: null,
    });

    setProcesando(false);

    if (error) {
      toast.error(error.message ?? "No se pudo registrar la venta.");
      return;
    }

    const res = data as { folio: number; total: number };
    setResultado({ folio: res.folio, total: res.total });
  }

  // ---------- Pantalla de éxito ----------
  if (resultado) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center py-10 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold">¡Venta registrada!</h2>
        <p className="mt-1 text-muted-foreground">
          Folio <span className="font-medium">{folioVenta(resultado.folio)}</span>
        </p>
        <p className="mt-4 text-4xl font-bold text-primary">
          {formatQ(resultado.total)}
        </p>

        <div className="mt-8 flex w-full flex-col gap-3">
          <Button size="lg" className="h-14 text-lg" onClick={nuevaVenta}>
            <Plus className="h-5 w-5" /> Nueva venta
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12"
            render={<Link href="/ventas" />}
            nativeButton={false}
          >
            Ver historial de ventas
          </Button>
        </div>
      </div>
    );
  }

  // ---------- POS ----------
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* Catálogo */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            placeholder="Buscar por nombre o SKU…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <CatChip
            activo={catActiva === "todas"}
            onClick={() => setCatActiva("todas")}
          >
            Todas
          </CatChip>
          {categorias.map((c) => (
            <CatChip
              key={c.id}
              activo={catActiva === c.id}
              onClick={() => setCatActiva(c.id)}
            >
              {c.nombre}
            </CatChip>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {productosFiltrados.map((p) => {
            const enCarrito = carrito.get(p.id)?.cantidad ?? 0;
            const agotado = p.stock <= 0;
            return (
              <button
                key={p.id}
                onClick={() => agregar(p)}
                disabled={agotado}
                className={cn(
                  "relative flex flex-col rounded-xl border bg-card p-3 text-left transition-colors",
                  agotado
                    ? "cursor-not-allowed opacity-50"
                    : "hover:border-primary hover:bg-accent/40 active:scale-[0.98]",
                )}
              >
                <span className="line-clamp-2 text-sm font-medium leading-snug">
                  {p.nombre}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">{p.sku}</span>
                <span className="mt-2 font-semibold text-primary">
                  {formatQ(p.precio_venta)}
                </span>
                <span
                  className={cn(
                    "mt-0.5 text-xs",
                    p.stock <= 2 ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {agotado ? "Sin stock" : `Stock: ${p.stock}`}
                </span>
                {enCarrito > 0 && (
                  <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                    {enCarrito}
                  </span>
                )}
              </button>
            );
          })}
          {productosFiltrados.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              No se encontraron productos.
            </p>
          )}
        </div>
      </div>

      {/* Carrito */}
      <div className="lg:sticky lg:top-20 lg:h-fit">
        <div className="rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3 font-medium">
            <ShoppingCart className="h-4 w-4" />
            Carrito
            {totalUnidades > 0 && (
              <span className="ml-auto text-sm text-muted-foreground">
                {totalUnidades} {totalUnidades === 1 ? "unidad" : "unidades"}
              </span>
            )}
          </div>

          {lineas.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Toca un producto para agregarlo.
            </p>
          ) : (
            <ul className="divide-y">
              {lineas.map(({ producto, cantidad }) => (
                <li key={producto.id} className="flex items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{producto.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatQ(producto.precio_venta)} c/u
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => cambiarCantidad(producto.id, -1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-7 text-center text-sm font-semibold">
                      {cantidad}
                    </span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => cambiarCantidad(producto.id, 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="w-20 text-right text-sm font-semibold">
                    {formatQ(producto.precio_venta * cantidad)}
                  </div>
                  <button
                    onClick={() => quitar(producto.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Quitar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Datos de pago */}
          <div className="space-y-3 border-t p-4">
            <div className="space-y-1.5">
              <Label htmlFor="cliente">Cliente (opcional)</Label>
              <Input
                id="cliente"
                placeholder="Nombre del cliente"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
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

              {esAdmin && (
                <div className="space-y-1.5">
                  <Label htmlFor="descuento">Descuento (Q)</Label>
                  <Input
                    id="descuento"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder="0.00"
                    value={descuento}
                    onChange={(e) => setDescuento(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Totales */}
            <div className="space-y-1 pt-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatQ(subtotal)}</span>
              </div>
              {descNum > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Descuento</span>
                  <span>− {formatQ(descNum)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">{formatQ(total)}</span>
              </div>
            </div>

            <Button
              size="lg"
              className="h-14 w-full text-lg"
              disabled={lineas.length === 0 || procesando}
              onClick={confirmar}
            >
              {procesando ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Procesando…
                </>
              ) : (
                <>Cobrar {formatQ(total)}</>
              )}
            </Button>

            {lineas.length > 0 && (
              <button
                onClick={() => setCarrito(new Map())}
                className="mx-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" /> Vaciar carrito
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CatChip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        activo
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
