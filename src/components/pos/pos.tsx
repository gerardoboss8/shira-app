"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatQ, folioVenta, hoyGT, fechaCortaGT } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Categoria, MetodoPago, NegocioId, Rol, TipoVenta } from "@/lib/database.types";
import { TIPOS_VENTA, tipoVentaClase } from "@/lib/tipos-venta";
import { TipoVentaBadge } from "@/components/ventas/tipo-venta-badge";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Minus,
  Plus,
  Search,
  Trash2,
  ShoppingCart,
  CheckCircle2,
  Palette,
  Loader2,
  X,
  Layers,
  ChevronRight,
  CalendarDays,
  FileText,
  Truck,
  ChevronDown,
  Package,
} from "lucide-react";

type ProductoPOS = {
  id: string;
  nombre: string;
  sku: string;
  precio_venta: number;
  /** En combos: cuántos alcanzan con el stock de sus piezas. */
  stock: number;
  categoria_id: string;
  grupo: string | null;
  /** Monto y descripción se escriben al vender (ej. pedido personalizado). */
  precio_libre: boolean;
  /** false = sobre pedido: se vende sin existencias. */
  controla_stock: boolean;
  es_combo: boolean;
  piezas: string | null;
};

/** Se puede vender sin mirar existencias (precio libre o sobre pedido). */
const sinLimite = (p: ProductoPOS) => p.precio_libre || (!p.es_combo && !p.controla_stock);

/**
 * Línea del carrito. `clave` es el id del producto, salvo en precio libre:
 * cada pedido personalizado es una línea aparte con su monto y descripción.
 */
type LineaCarrito = {
  clave: string;
  producto: ProductoPOS;
  cantidad: number;
  precio: number;
  descripcion?: string;
};

const porSku = (a: { sku: string }, b: { sku: string }) => a.sku.localeCompare(b.sku, "es");

/** Celda del catálogo: un producto suelto o una subcategoría con variantes. */
type Celda =
  | { tipo: "producto"; clave: string; nombre: string; producto: ProductoPOS }
  | { tipo: "grupo"; clave: string; nombre: string; sku: string; items: ProductoPOS[] };

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "otro", label: "Otro" },
];

export function POS({
  role,
  negocioId,
  categorias,
  productos,
}: {
  role: Rol;
  negocioId: NegocioId;
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
  const [fecha, setFecha] = useState(() => hoyGT());
  const [tipo, setTipo] = useState<TipoVenta>("normal");
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState<{
    ventaId: string;
    folio: number;
    total: number;
    fecha: string;
    tipo: TipoVenta;
  } | null>(null);
  // Datos opcionales para el comprobante
  const [verDatos, setVerDatos] = useState(false);
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [referencia, setReferencia] = useState("");
  const [envioEmpresa, setEnvioEmpresa] = useState("");
  const [envioCosto, setEnvioCosto] = useState("");
  // Opciones por línea (color, diseño…) del producto que se está agregando
  const [conOpciones, setConOpciones] = useState<ProductoPOS | null>(null);
  const [elegidas, setElegidas] = useState<Record<string, string>>({});
  const [notaLinea, setNotaLinea] = useState("");
  const opcionesPorCategoria = useMemo(
    () => new Map(categorias.map((c) => [c.id, c.opciones ?? []])),
    [categorias],
  );
  // Precio libre: producto que se está agregando
  const [libre, setLibre] = useState<ProductoPOS | null>(null);
  const [libreMonto, setLibreMonto] = useState("");
  const [libreDesc, setLibreDesc] = useState("");
  const [grupoAbierto, setGrupoAbierto] = useState<{
    nombre: string;
    items: ProductoPOS[];
  } | null>(null);

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

  // Sin búsqueda, las variantes se colapsan en su subcategoría (ej. Camisas).
  const celdas = useMemo(() => {
    const buscando = busqueda.trim().length > 0;
    const sueltos: Celda[] = [];
    const porGrupo = new Map<string, ProductoPOS[]>();

    for (const p of productosFiltrados) {
      if (p.grupo && !buscando) {
        if (!porGrupo.has(p.grupo)) porGrupo.set(p.grupo, []);
        porGrupo.get(p.grupo)!.push(p);
      } else {
        sueltos.push({ tipo: "producto", clave: p.id, nombre: p.nombre, producto: p });
      }
    }

    return [
      ...sueltos,
      ...[...porGrupo.entries()].map(([nombre, items]) => ({
        tipo: "grupo" as const,
        clave: `grupo:${nombre}`,
        nombre,
        sku: items[0].sku,
        items: [...items].sort(porSku),
      })),
    ].sort((a, b) =>
      (a.tipo === "producto" ? a.producto.sku : a.sku).localeCompare(
        b.tipo === "producto" ? b.producto.sku : b.sku,
        "es",
      ),
    );
  }, [productosFiltrados, busqueda]);

  const lineas = [...carrito.values()];
  const subtotal = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  const descNum = Math.max(0, Number(descuento) || 0);
  const total = Math.max(subtotal - descNum, 0);
  const envioNum = Math.max(0, Number(envioCosto) || 0);
  const aCobrar = total + envioNum;
  const totalUnidades = lineas.reduce((s, l) => s + l.cantidad, 0);
  const hoy = hoyGT();
  const esFechaPasada = fecha < hoy;

  function agregar(p: ProductoPOS) {
    if (p.precio_libre) {
      setGrupoAbierto(null);
      setLibreMonto("");
      setLibreDesc("");
      setLibre(p);
      return;
    }
    if ((opcionesPorCategoria.get(p.categoria_id) ?? []).length > 0) {
      setGrupoAbierto(null);
      setElegidas({});
      setNotaLinea("");
      setConOpciones(p);
      return;
    }
    sumarLinea(p, null);
  }

  /** Suma 1 a la línea del producto con ese detalle (o la crea). */
  function sumarLinea(p: ProductoPOS, detalle: string | null) {
    const clave = detalle ? `${p.id}|${detalle}` : p.id;
    setCarrito((prev) => {
      const next = new Map(prev);
      const actual = next.get(clave);
      const cantidad = (actual?.cantidad ?? 0) + 1;
      const yaPedidas = [...prev.values()]
        .filter((l) => l.producto.id === p.id && l.clave !== clave)
        .reduce((s, l) => s + l.cantidad, 0);
      if (!sinLimite(p) && cantidad + yaPedidas > p.stock) {
        toast.warning(
          p.es_combo
            ? `Solo alcanzan las piezas para ${p.stock} de "${p.nombre}".`
            : `Solo hay ${p.stock} de "${p.nombre}" en stock.`,
        );
        return prev;
      }
      next.set(clave, {
        clave,
        producto: p,
        cantidad,
        precio: p.precio_venta,
        descripcion: detalle ?? undefined,
      });
      return next;
    });
  }

  function agregarConOpciones() {
    if (!conOpciones) return;
    const grupos = opcionesPorCategoria.get(conOpciones.categoria_id) ?? [];
    const detalle = [
      ...grupos.map((g) => elegidas[g.nombre]).filter(Boolean),
      notaLinea.trim(),
    ]
      .filter(Boolean)
      .join(" · ");
    sumarLinea(conOpciones, detalle || null);
    toast.success(`Agregado: ${conOpciones.nombre}${detalle ? ` – ${detalle}` : ""}`);
    setConOpciones(null);
  }

  function agregarLibre() {
    if (!libre) return;
    const monto = Math.round(Number(libreMonto) * 100) / 100;
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.warning("Escribe el monto del pedido.");
      return;
    }
    if (!libreDesc.trim()) {
      toast.warning("Describe qué incluye el pedido.");
      return;
    }
    const clave = `${libre.id}:${Date.now()}`;
    setCarrito((prev) =>
      new Map(prev).set(clave, {
        clave,
        producto: libre,
        cantidad: 1,
        precio: monto,
        descripcion: libreDesc.trim(),
      }),
    );
    setLibre(null);
  }

  function tileProducto(p: ProductoPOS) {
    const enCarrito = lineas
      .filter((l) => l.producto.id === p.id)
      .reduce((s, l) => s + l.cantidad, 0);
    const agotado = !sinLimite(p) && p.stock <= 0;
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
        <span className="mt-1 text-xs text-muted-foreground">
          {p.sku}
          {p.es_combo && " · combo"}
        </span>
        <span className="mt-2 font-semibold text-primary">
          {p.precio_libre ? "Monto libre" : formatQ(p.precio_venta)}
        </span>
        <span
          className={cn(
            "mt-0.5 text-xs",
            !sinLimite(p) && p.stock <= 2 ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {p.precio_libre
            ? "Escribe monto y detalle"
            : !p.controla_stock && !p.es_combo
              ? "Sobre pedido"
              : agotado
              ? p.es_combo
                ? "Faltan piezas"
                : "Sin stock"
              : `${p.es_combo ? "Alcanza para" : "Stock"}: ${p.stock}`}
        </span>
        {enCarrito > 0 && (
          <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
            {enCarrito}
          </span>
        )}
      </button>
    );
  }

  function cambiarCantidad(id: string, delta: number) {
    setCarrito((prev) => {
      const next = new Map(prev);
      const linea = next.get(id);
      if (!linea) return prev;
      const cantidad = linea.cantidad + delta;
      if (cantidad <= 0) {
        next.delete(id);
      } else if (linea.producto.precio_libre) {
        return prev;
      } else if (
        !sinLimite(linea.producto) &&
        delta > 0 &&
        [...prev.values()]
          .filter((l) => l.producto.id === linea.producto.id)
          .reduce((s, l) => s + l.cantidad, 0) +
          delta >
          linea.producto.stock
      ) {
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
    setTelefono("");
    setDireccion("");
    setReferencia("");
    setEnvioEmpresa("");
    setEnvioCosto("");
    setVerDatos(false);
    setDescuento("");
    setMetodo("efectivo");
    setFecha(hoyGT());
    setTipo("normal");
    setBusqueda("");
    setResultado(null);
    router.refresh(); // recarga stock actualizado
  }

  async function confirmar() {
    if (lineas.length === 0) return;
    if (!fecha) {
      toast.error("Elige la fecha de la venta.");
      return;
    }
    if (fecha > hoyGT()) {
      toast.error("La fecha de la venta no puede ser futura.");
      return;
    }
    setProcesando(true);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("registrar_venta", {
      p_items: lineas.map((l) =>
        l.producto.precio_libre
          ? {
              producto_id: l.producto.id,
              cantidad: l.cantidad,
              precio: l.precio,
              descripcion: l.descripcion,
            }
          : { producto_id: l.producto.id, cantidad: l.cantidad, descripcion: l.descripcion ?? null },
      ),
      p_metodo_pago: metodo,
      p_cliente_nombre: cliente.trim() || null,
      p_descuento: esAdmin ? descNum : 0,
      p_nota: null,
      p_fecha: fecha,
      p_tipo: tipo,
      p_negocio_id: negocioId,
      p_datos_cliente: {
        telefono: telefono.trim() || null,
        direccion: direccion.trim() || null,
        referencia: referencia.trim() || null,
        envio_empresa: envioEmpresa.trim() || null,
        envio_costo: envioNum,
      },
    });

    setProcesando(false);

    if (error) {
      toast.error(error.message ?? "No se pudo registrar la venta.");
      return;
    }

    const res = data as { venta_id: string; folio: number; total: number };
    setResultado({ ventaId: res.venta_id, folio: res.folio, total: res.total + envioNum, fecha, tipo });
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
        {resultado.fecha < hoyGT() && (
          <p className="mt-1 text-sm text-amber-700">
            Registrada con fecha {fechaCortaGT(resultado.fecha)}
          </p>
        )}
        <TipoVentaBadge tipo={resultado.tipo} className="mt-2" />
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
            render={<Link href={`/comprobante/${resultado.ventaId}`} />}
            nativeButton={false}
          >
            <FileText className="h-5 w-5" /> Comprobante de pago
          </Button>
          <Button
            size="lg"
            variant="ghost"
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
          {celdas.map((c) => {
            if (c.tipo === "producto") return tileProducto(c.producto);

            const stock = c.items.reduce((s, p) => s + (sinLimite(p) ? 1 : p.stock), 0);
            const sobrePedido = c.items.every((p) => sinLimite(p));
            const enCarrito = lineas
              .filter((l) => c.items.some((p) => p.id === l.producto.id))
              .reduce((s, l) => s + l.cantidad, 0);
            const precios = c.items.map((p) => p.precio_venta);
            const min = Math.min(...precios);
            const max = Math.max(...precios);
            const agotado = stock <= 0;

            return (
              <button
                key={c.clave}
                onClick={() => setGrupoAbierto({ nombre: c.nombre, items: c.items })}
                disabled={agotado}
                className={cn(
                  "relative flex flex-col rounded-xl border bg-card p-3 text-left transition-colors",
                  agotado
                    ? "cursor-not-allowed opacity-50"
                    : "hover:border-primary hover:bg-accent/40 active:scale-[0.98]",
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium leading-snug">
                  <Layers className="h-4 w-4 shrink-0 text-primary" />
                  {c.nombre}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  {c.items.length} variantes
                </span>
                <span className="mt-2 font-semibold text-primary">
                  {min === max ? formatQ(min) : `${formatQ(min)} – ${formatQ(max)}`}
                </span>
                <span
                  className={cn(
                    "mt-0.5 flex items-center gap-0.5 text-xs",
                    stock <= 2 ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {sobrePedido ? "Sobre pedido" : agotado ? "Sin stock" : `Stock: ${stock}`}
                  <ChevronRight className="h-3 w-3" />
                </span>
                {enCarrito > 0 && (
                  <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                    {enCarrito}
                  </span>
                )}
              </button>
            );
          })}
          {celdas.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              No se encontraron productos.
            </p>
          )}
        </div>

        {/* Opciones de la línea: color, diseño, cuadro… */}
        <Dialog open={!!conOpciones} onOpenChange={(o) => !o && setConOpciones(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5 shrink-0 text-primary" />
                <span className="text-left">{conOpciones?.nombre}</span>
              </DialogTitle>
              <DialogDescription>
                {conOpciones && formatQ(conOpciones.precio_venta)} · elige las opciones (todas son
                opcionales).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {(conOpciones ? (opcionesPorCategoria.get(conOpciones.categoria_id) ?? []) : []).map(
                (g) => (
                  <div key={g.nombre} className="space-y-2">
                    <Label>
                      {g.nombre}
                      {elegidas[g.nombre] && (
                        <span className="ml-2 font-normal text-primary">{elegidas[g.nombre]}</span>
                      )}
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {g.valores.map((v) => {
                        const activo = elegidas[g.nombre] === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() =>
                              setElegidas((prev) => ({ ...prev, [g.nombre]: activo ? "" : v }))
                            }
                            aria-pressed={activo}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-sm transition-colors",
                              activo
                                ? "border-primary bg-primary text-primary-foreground"
                                : "bg-card hover:bg-accent",
                            )}
                          >
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ),
              )}
              <div className="space-y-1.5">
                <Label htmlFor="nota-linea">Nota (opcional)</Label>
                <Input
                  id="nota-linea"
                  placeholder="Ej. medida 150 × 260, bordado con nombre…"
                  value={notaLinea}
                  onChange={(e) => setNotaLinea(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && agregarConOpciones()}
                />
              </div>
              <Button className="h-11 w-full" onClick={agregarConOpciones}>
                <Plus className="h-4 w-4" /> Agregar al carrito
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Precio libre: monto y descripción del pedido */}
        <Dialog open={!!libre} onOpenChange={(o) => !o && setLibre(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" /> {libre?.nombre}
              </DialogTitle>
              <DialogDescription>
                Escribe qué lleva el pedido y cuánto se cobra en total.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="libre-desc">¿Qué incluye?</Label>
                <Input
                  id="libre-desc"
                  placeholder="Ej. 2 estolas bordadas + 1 alba"
                  value={libreDesc}
                  onChange={(e) => setLibreDesc(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="libre-monto">Monto total (Q)</Label>
                <Input
                  id="libre-monto"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="0.00"
                  value={libreMonto}
                  onChange={(e) => setLibreMonto(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && agregarLibre()}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                No descuenta inventario. Si el pedido lleva productos del catálogo,
                agrégalos aparte para que bajen del stock.
              </p>
              <Button className="h-11 w-full" onClick={agregarLibre}>
                <Plus className="h-4 w-4" /> Agregar al carrito
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Variantes de una subcategoría (ej. Camisas) */}
        <Dialog
          open={!!grupoAbierto}
          onOpenChange={(o) => !o && setGrupoAbierto(null)}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{grupoAbierto?.nombre}</DialogTitle>
              <DialogDescription>
                Toca la variante que vas a vender.
              </DialogDescription>
            </DialogHeader>
            <ul className="divide-y rounded-lg border">
              {grupoAbierto?.items.map((p) => {
                const enCarrito = lineas
                  .filter((l) => l.producto.id === p.id)
                  .reduce((s, l) => s + l.cantidad, 0);
                const agotado = !sinLimite(p) && p.stock <= 0;
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => agregar(p)}
                      disabled={agotado}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors",
                        agotado
                          ? "cursor-not-allowed opacity-50"
                          : "hover:bg-accent/40 active:bg-accent",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.nombre}</p>
                        <p
                          className={cn(
                            "text-xs",
                            p.stock <= 2 ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {p.precio_libre
                            ? "Monto libre"
                            : sinLimite(p)
                              ? "Sobre pedido"
                              : agotado
                                ? "Sin stock"
                                : `Stock: ${p.stock}`}
                        </p>
                      </div>
                      <span className="font-semibold text-primary">
                        {p.precio_libre ? "—" : formatQ(p.precio_venta)}
                      </span>
                      {enCarrito > 0 && (
                        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                          {enCarrito}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </DialogContent>
        </Dialog>
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
              {lineas.map(({ clave, producto, cantidad, precio, descripcion }) => (
                <li key={clave} className="flex items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{producto.nombre}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {descripcion ? `${descripcion} · ${formatQ(precio)}` : `${formatQ(precio)} c/u`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => cambiarCantidad(clave, -1)}
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
                      onClick={() => cambiarCantidad(clave, 1)}
                      disabled={producto.precio_libre}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="w-20 text-right text-sm font-semibold">
                    {formatQ(precio * cantidad)}
                  </div>
                  <button
                    onClick={() => quitar(clave)}
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

            {/* Datos para el comprobante de pago (opcionales) */}
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => setVerDatos((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium"
                aria-expanded={verDatos}
              >
                <Truck className="h-4 w-4 text-primary" />
                Datos para comprobante y envío
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {telefono || direccion || envioEmpresa ? "con datos" : "opcional"}
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", verDatos && "rotate-180")}
                />
              </button>
              {verDatos && (
                <div className="space-y-3 border-t p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="telefono">Teléfono</Label>
                    <Input
                      id="telefono"
                      type="tel"
                      inputMode="tel"
                      placeholder="5555-5555"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="direccion">Dirección</Label>
                    <Input
                      id="direccion"
                      placeholder="Calle, zona, municipio, departamento"
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="referencia">Referencia</Label>
                    <Input
                      id="referencia"
                      placeholder="Frente a…"
                      value={referencia}
                      onChange={(e) => setReferencia(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-[1fr_110px] gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="envio-empresa">Envío por</Label>
                      <Input
                        id="envio-empresa"
                        placeholder="Forza – departamentos"
                        value={envioEmpresa}
                        onChange={(e) => setEnvioEmpresa(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="envio-costo">Costo (Q)</Label>
                      <Input
                        id="envio-costo"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        placeholder="0.00"
                        value={envioCosto}
                        onChange={(e) => setEnvioCosto(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    El envío se cobra aparte: no suma a las ventas del reporte.
                  </p>
                </div>
              )}
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

            {/* Tipo de venta: normal por defecto; bonos/extra se separan en reportes */}
            <div className="space-y-1.5">
              <Label>Tipo de venta</Label>
              <div className="grid grid-cols-3 gap-2">
                {TIPOS_VENTA.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTipo(t.value)}
                    aria-pressed={tipo === t.value}
                    className={cn(
                      "h-10 rounded-lg border text-sm font-medium transition-colors",
                      tipo === t.value
                        ? t.value === "normal"
                          ? "border-primary bg-primary text-primary-foreground"
                          : tipoVentaClase[t.value]
                        : "bg-card hover:bg-accent",
                    )}
                  >
                    {t.corto}
                  </button>
                ))}
              </div>
            </div>

            {/* Fecha de la venta (por defecto hoy; permite ventas pasadas) */}
            <div className="space-y-1.5">
              <Label htmlFor="fecha" className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" /> Fecha de la venta
              </Label>
              <div className="flex gap-2">
                <Input
                  id="fecha"
                  type="date"
                  max={hoy}
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className={cn(esFechaPasada && "border-amber-500 bg-amber-50")}
                />
                {fecha !== hoy && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setFecha(hoy)}
                  >
                    Hoy
                  </Button>
                )}
              </div>
              {esFechaPasada && (
                <p className="text-xs text-amber-700">
                  Se registrará como vendida el {fechaCortaGT(fecha)}.
                </p>
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
              {envioNum > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Envío{envioEmpresa.trim() ? ` (${envioEmpresa.trim()})` : ""}</span>
                  <span>+ {formatQ(envioNum)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">{formatQ(aCobrar)}</span>
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
                <>Cobrar {formatQ(aCobrar)}</>
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
