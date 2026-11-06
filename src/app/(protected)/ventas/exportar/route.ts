import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNegocio } from "@/lib/negocio";
import { traerTodo } from "@/lib/supabase/paginar";
import { fechaCortaGT, folioVenta } from "@/lib/format";
import { esMes, mesActualGT, nombreMes, rangoMes } from "@/lib/meses";
import { esTipoVenta, tipoVentaLabel } from "@/lib/tipos-venta";
import type { TipoVenta } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const metodoLabel: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
};

const hora = new Intl.DateTimeFormat("es-GT", {
  timeZone: "America/Guatemala",
  hour: "2-digit",
  minute: "2-digit",
});

type Fila = {
  cantidad: number;
  precio_unitario: number;
  total_linea: number;
  descripcion: string | null;
  producto: {
    nombre: string;
    sku: string;
    grupo: string | null;
    categoria: { nombre: string } | null;
  } | null;
  venta: {
    folio: number;
    fecha: string;
    cliente_nombre: string | null;
    cliente_telefono: string | null;
    envio_costo: number;
    metodo_pago: string;
    descuento: number;
    total: number;
    estado: string;
    tipo: TipoVenta;
    nota: string | null;
    vendedor: { nombre: string } | null;
  };
};

/**
 * Detalle de ventas de un mes en CSV (una fila por producto vendido).
 * GET /ventas/exportar?mes=2026-10[&tipo=normal]
 * Solo admin y contador, del negocio activo.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const negocio = await getNegocio();
  if (!negocio) return NextResponse.redirect(new URL("/negocio", request.url));

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, activo")
    .eq("id", user.id)
    .single();
  if (!profile?.activo || !["admin", "contador"].includes(profile.role)) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const mesParam = params.get("mes");
  const mes = esMes(mesParam) ? mesParam : mesActualGT();
  const tipoParam = params.get("tipo");
  const tipo = esTipoVenta(tipoParam) ? tipoParam : null;
  const { desdeTs, hastaTs } = rangoMes(mes);

  const filas = await traerTodo<Fila>((d, h) => {
    let q = supabase
      .from("venta_items")
      .select(
        "cantidad, precio_unitario, total_linea, descripcion, producto:productos(nombre, sku, grupo, categoria:categorias(nombre)), venta:ventas!inner(folio, fecha, cliente_nombre, cliente_telefono, envio_costo, metodo_pago, descuento, total, estado, tipo, nota, negocio_id, vendedor:profiles(nombre))",
      )
      .eq("venta.negocio_id", negocio.id)
      .gte("venta.fecha", desdeTs)
      .lt("venta.fecha", hastaTs)
      .order("id");
    if (tipo) q = q.eq("venta.tipo", tipo);
    return q.range(d, h);
  });

  // Por folio y luego en el orden en que se vendieron
  filas.sort((a, b) => a.venta.folio - b.venta.folio);

  const esc = (v: string | number | null | undefined) =>
    `"${String(v ?? "").replace(/"/g, '""')}"`;
  const q = (n: number) => Number(n).toFixed(2);

  const lineas: string[] = [];
  lineas.push(
    esc(
      `Detalle de ventas ${negocio.nombre} · ${nombreMes(mes)}${tipo ? ` · ${tipoVentaLabel[tipo]}` : ""}`,
    ),
  );
  lineas.push("");
  lineas.push(
    [
      "Folio",
      "Fecha",
      "Hora",
      "Estado",
      "Tipo",
      "Vendedor",
      "Cliente",
      "Telefono",
      "Metodo de pago",
      "SKU",
      "Producto",
      "Categoria",
      "Subcategoria",
      "Cantidad",
      "Precio unitario",
      "Total linea",
      "Descuento de la venta",
      "Total de la venta",
      "Nota",
    ].join(","),
  );

  let totalCompletadas = 0;
  const contadas = new Set<number>();
  for (const f of filas) {
    const v = f.venta;
    if (v.estado === "completada" && !contadas.has(v.folio)) {
      contadas.add(v.folio);
      totalCompletadas += Number(v.total);
    }
    lineas.push(
      [
        esc(folioVenta(v.folio)),
        esc(fechaCortaGT(v.fecha)),
        esc(hora.format(new Date(v.fecha))),
        esc(v.estado === "anulada" ? "Anulada" : "Completada"),
        esc(tipoVentaLabel[v.tipo ?? "normal"]),
        esc(v.vendedor?.nombre),
        esc(v.cliente_nombre),
        esc(v.cliente_telefono),
        esc(metodoLabel[v.metodo_pago] ?? v.metodo_pago),
        esc(f.producto?.sku),
        esc(f.descripcion ? `${f.producto?.nombre ?? ""}: ${f.descripcion}` : f.producto?.nombre),
        esc(f.producto?.categoria?.nombre),
        esc(f.producto?.grupo),
        f.cantidad,
        q(f.precio_unitario),
        q(f.total_linea),
        q(v.descuento),
        q(v.total),
        esc(v.nota),
      ].join(","),
    );
  }

  lineas.push("");
  lineas.push(`"Ventas completadas",${contadas.size}`);
  lineas.push(`"Total vendido (sin anuladas)",${q(totalCompletadas)}`);

  const archivo = negocio.nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();

  return new NextResponse("﻿" + lineas.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ventas_${archivo}_${mes}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
