import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { requireNegocio } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/server";
import { fechaCortaGT, folioVenta, formatQ } from "@/lib/format";
import { AccionesComprobante } from "./acciones";

export const dynamic = "force-dynamic";

type VentaComprobante = {
  id: string;
  folio: number;
  fecha: string;
  estado: string;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  cliente_direccion: string | null;
  cliente_referencia: string | null;
  envio_empresa: string | null;
  envio_costo: number;
  subtotal: number;
  descuento: number;
  total: number;
};

type LineaComprobante = {
  cantidad: number;
  precio_unitario: number;
  total_linea: number;
  descripcion: string | null;
  producto: { nombre: string; precio_libre: boolean } | null;
};

async function cargar(id: string) {
  const negocio = await requireNegocio();
  const supabase = await createClient();
  const [{ data: venta }, { data: items }] = await Promise.all([
    supabase
      .from("ventas")
      .select(
        "id, folio, fecha, estado, cliente_nombre, cliente_telefono, cliente_direccion, cliente_referencia, envio_empresa, envio_costo, subtotal, descuento, total",
      )
      .eq("id", id)
      .eq("negocio_id", negocio.id)
      .maybeSingle(),
    supabase
      .from("venta_items")
      .select("cantidad, precio_unitario, total_linea, descripcion, producto:productos(nombre, precio_libre)")
      .eq("venta_id", id)
      .order("id"),
  ]);
  return {
    negocio,
    venta: venta as VentaComprobante | null,
    lineas: (items ?? []) as unknown as LineaComprobante[],
  };
}

// El título es el nombre sugerido al guardar el PDF.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { venta } = await cargar(id);
  if (!venta) return { title: "Comprobante" };
  return {
    title: `Comprobante ${folioVenta(venta.folio)}${venta.cliente_nombre ? ` – ${venta.cliente_nombre}` : ""}`,
  };
}

/** Comprobante de pago listo para imprimir o guardar en PDF (tamaño carta). */
export default async function ComprobantePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfile();
  const { id } = await params;
  const { negocio, venta, lineas } = await cargar(id);
  if (!venta) notFound();

  const c = negocio.comprobante;
  const envio = Number(venta.envio_costo ?? 0);
  const descuento = Number(venta.descuento ?? 0);
  const totalPagado = Number(venta.total) + envio;
  const anulada = venta.estado === "anulada";
  const conDesglose = envio > 0 || descuento > 0;

  return (
    <div className="min-h-dvh bg-muted py-4 print:bg-white print:py-0">
      <AccionesComprobante ventaId={venta.id} />

      <article
        className="comprobante mx-auto flex w-full max-w-[816px] flex-col bg-white text-[#1d2b4f] shadow-lg print:max-w-none print:shadow-none"
        style={{ minHeight: "1056px" }}
      >
        {/* Encabezado */}
        <header
          className="flex items-center justify-between gap-6 px-8 py-9 sm:px-14"
          style={{ background: c.fondo, borderBottom: `8px solid ${c.franja}` }}
        >
          <div className="shrink-0">
            {negocio.id === "artisan" ? (
              <Image
                src={negocio.logoHeader.src}
                alt={negocio.nombre}
                width={negocio.logoHeader.width}
                height={negocio.logoHeader.height}
                className="h-16 w-auto"
                priority
              />
            ) : (
              <span className="inline-block rounded-xl bg-white px-3 py-2">
                <Image
                  src={negocio.logo.src}
                  alt={negocio.nombre}
                  width={negocio.logo.width}
                  height={negocio.logo.height}
                  className="h-12 w-auto"
                  priority
                />
              </span>
            )}
          </div>
          <div className="text-right text-white">
            <p className="text-[11px] uppercase tracking-[0.35em] opacity-80">{negocio.nombre}</p>
            <h1 className="font-heading mt-2 text-3xl font-bold leading-[1.05] sm:text-[42px]">
              COMPROBANTE
              <br />
              DE PAGO
            </h1>
          </div>
        </header>

        {/* Cliente y fecha */}
        <section className="grid gap-6 px-8 pt-10 sm:grid-cols-[1fr_auto] sm:px-14">
          <div>
            <Etiqueta color={c.acento}>Datos del cliente</Etiqueta>
            <p className="font-heading mt-2 text-xl font-bold" style={{ color: c.fondo }}>
              {venta.cliente_nombre || "Cliente"}
            </p>
            {venta.cliente_telefono && <p className="mt-1">Tel. {venta.cliente_telefono}</p>}
            {venta.cliente_direccion && <p className="mt-1">{venta.cliente_direccion}</p>}
            {venta.cliente_referencia && (
              <p className="mt-1 text-sm text-[#5b6680]">Referencia: {venta.cliente_referencia}</p>
            )}
          </div>
          <div className="sm:min-w-52">
            <Etiqueta color={c.acento}>Fecha</Etiqueta>
            <p className="font-heading mt-2 text-lg font-bold" style={{ color: c.fondo }}>
              {fechaCortaGT(venta.fecha)}
            </p>
            <p className="text-sm text-[#5b6680]">Folio {folioVenta(venta.folio)}</p>
            {venta.envio_empresa && (
              <>
                <Etiqueta color={c.acento} className="mt-5">
                  Envío
                </Etiqueta>
                <p className="mt-2">{venta.envio_empresa}</p>
              </>
            )}
          </div>
        </section>

        {/* Productos */}
        <section className="px-8 pt-8 sm:px-14">
          <table className="w-full border-collapse text-[15px]">
            <thead>
              <tr style={{ background: c.tabla, color: c.fondo }}>
                <th className="w-16 px-4 py-3 text-left text-xs font-bold tracking-widest">CANT.</th>
                <th className="px-2 py-3 text-left text-xs font-bold tracking-widest">DESCRIPCIÓN</th>
                <th className="px-2 py-3 text-right text-xs font-bold tracking-widest">P. UNIT.</th>
                <th className="px-4 py-3 text-right text-xs font-bold tracking-widest">SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={i} className="border-b border-[#dde3ef]">
                  <td className="px-4 py-4 align-top">{l.cantidad}</td>
                  <td className="px-2 py-4 align-top">
                    {l.producto?.precio_libre
                      ? (l.descripcion ?? l.producto.nombre)
                      : (l.producto?.nombre ?? "—") + (l.descripcion ? ` – ${l.descripcion}` : "")}
                  </td>
                  <td className="px-2 py-4 text-right align-top">{q(l.precio_unitario)}</td>
                  <td className="px-4 py-4 text-right align-top">{q(l.total_linea)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Sello y totales */}
        <section className="flex flex-col-reverse items-start justify-between gap-8 px-8 pt-8 sm:flex-row sm:px-14">
          <Sello anulada={anulada} color={anulada ? "#c62828" : c.fondo} />

          <div className="w-full sm:w-[380px]">
            {conDesglose && (
              <div className="space-y-3 px-4 pb-3 text-[15px]">
                <Fila label="Subtotal productos" valor={q(venta.subtotal)} />
                {descuento > 0 && <Fila label="Descuento" valor={`− ${q(descuento)}`} />}
                {envio > 0 && (
                  <Fila
                    label={`Envío${venta.envio_empresa ? ` (${venta.envio_empresa.split("–")[0].trim()})` : ""}`}
                    valor={q(envio)}
                  />
                )}
              </div>
            )}
            <div
              className="flex items-center justify-between px-5 py-4 text-white"
              style={{ background: c.fondo }}
            >
              <span className="font-heading text-lg font-bold">TOTAL PAGADO</span>
              <span className="font-heading text-2xl font-bold" style={{ color: c.tabla }}>
                {q(totalPagado)}
              </span>
            </div>
            <p className="mt-2 text-right text-xs text-[#5b6680]">Precios sin IVA.</p>
          </div>
        </section>

        {/* Agradecimiento */}
        <section className="mt-auto px-8 pb-8 pt-16 text-center sm:px-14">
          <p className="font-heading text-lg font-semibold" style={{ color: c.fondo }}>
            Muchas gracias por su compra.
            {negocio.id === "shira" && " Que Dios le bendiga."}
          </p>
          {venta.envio_empresa && (
            <p className="mt-1 text-sm text-[#5b6680]">
              Su pedido será enviado por {venta.envio_empresa.split("–")[0].trim()} a la dirección
              indicada.
            </p>
          )}
        </section>

        <footer
          className="flex items-center justify-between px-8 py-5 text-white sm:px-14"
          style={{ background: c.fondo }}
        >
          <span className="text-xs uppercase tracking-[0.35em] opacity-80">{c.lema}</span>
          {c.whatsapp && <span className="font-heading font-semibold">WhatsApp {c.whatsapp}</span>}
        </footer>
      </article>
    </div>
  );
}

/** "Q2,440.00" (sin espacio, como en el comprobante impreso). */
function q(n: number) {
  return formatQ(n).replace(" ", "");
}

function Etiqueta({
  color,
  className = "",
  children,
}: {
  color: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p className={`text-xs font-semibold uppercase tracking-[0.3em] ${className}`} style={{ color }}>
      {children}
    </p>
  );
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{valor}</span>
    </div>
  );
}

function Sello({ anulada, color }: { anulada: boolean; color: string }) {
  return (
    <div
      className="-rotate-6 border-[3px] px-8 py-3 text-center"
      style={{ borderColor: color, color }}
    >
      <p className="font-heading text-3xl font-extrabold tracking-[0.12em]">
        {anulada ? "ANULADO" : "CANCELADO"}
      </p>
      <p className="text-xs font-semibold tracking-[0.3em]">
        {anulada ? "VENTA ANULADA" : "PAGO RECIBIDO"}
      </p>
    </div>
  );
}
