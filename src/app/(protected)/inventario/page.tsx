import { requireProfile, esAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { requireNegocio } from "@/lib/negocio";
import { Inventario, type ProductoInv } from "@/components/inventario/inventario";
import { COMPONENTES_SELECT, conStockReal, type ComponenteRow } from "@/lib/combos";
import type { Categoria } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const [profile, negocio] = await Promise.all([requireProfile(), requireNegocio()]);
  const supabase = await createClient();

  const [{ data: productosData }, { data: categoriasData }] = await Promise.all([
    supabase
      .from("productos")
      .select(
        `id, nombre, sku, precio_venta, costo, stock, stock_minimo, activo, grupo, precio_libre, controla_stock, categoria_id, categoria:categorias(nombre, prefijo, orden), ${COMPONENTES_SELECT}`,
      )
      .eq("negocio_id", negocio.id)
      .order("sku"),
    supabase.from("categorias").select("*").eq("negocio_id", negocio.id).order("orden"),
  ]);

  // Los combos muestran cuántos alcanzan con el stock de sus piezas
  const productos = (
    (productosData ?? []) as unknown as (Omit<ProductoInv, "es_combo" | "piezas"> & {
      componentes: ComponenteRow[] | null;
    })[]
  ).map(conStockReal) as ProductoInv[];
  const categorias = (categoriasData ?? []) as unknown as Categoria[];

  return (
    <Inventario
      productos={productos}
      categorias={categorias}
      esAdmin={esAdmin(profile)}
      gruposSugeridos={negocio.gruposSugeridos}
      sobrePedido={negocio.sobrePedido}
    />
  );
}
