import { requireProfile, esAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Inventario, type ProductoInv } from "@/components/inventario/inventario";
import type { Categoria } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: productosData }, { data: categoriasData }] = await Promise.all([
    supabase
      .from("productos")
      .select(
        "id, nombre, sku, precio_venta, stock, stock_minimo, activo, categoria_id, categoria:categorias(nombre, prefijo, orden)",
      )
      .order("nombre"),
    supabase.from("categorias").select("*").order("orden"),
  ]);

  const productos = (productosData ?? []) as unknown as ProductoInv[];
  const categorias = (categoriasData ?? []) as unknown as Categoria[];

  return (
    <Inventario
      productos={productos}
      categorias={categorias}
      esAdmin={esAdmin(profile)}
    />
  );
}
