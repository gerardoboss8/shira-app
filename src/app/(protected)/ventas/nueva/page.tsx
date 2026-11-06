import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { requireNegocio } from "@/lib/negocio";
import { COMPONENTES_SELECT, conStockReal, type ComponenteRow } from "@/lib/combos";
import { POS } from "@/components/pos/pos";

export const dynamic = "force-dynamic";

export default async function NuevaVentaPage() {
  const [profile, negocio] = await Promise.all([requireProfile(), requireNegocio()]);
  const supabase = await createClient();

  const [{ data: categorias }, { data: productos }] = await Promise.all([
    supabase.from("categorias").select("*").eq("negocio_id", negocio.id).order("orden"),
    supabase
      .from("productos")
      .select(
        `id, nombre, sku, precio_venta, stock, categoria_id, grupo, precio_libre, controla_stock, ${COMPONENTES_SELECT}`,
      )
      .eq("negocio_id", negocio.id)
      .eq("activo", true)
      .order("sku"),
  ]);

  const lista = (
    (productos ?? []) as unknown as {
      id: string;
      nombre: string;
      sku: string;
      precio_venta: number;
      stock: number;
      categoria_id: string;
      grupo: string | null;
      precio_libre: boolean;
      controla_stock: boolean;
      componentes: ComponenteRow[] | null;
    }[]
  ).map(conStockReal);

  return (
    <POS
      role={profile.role}
      negocioId={negocio.id}
      categorias={categorias ?? []}
      productos={lista}
    />
  );
}
