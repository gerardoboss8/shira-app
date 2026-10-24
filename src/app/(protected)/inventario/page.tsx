import { requireProfile, esAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { requireNegocio } from "@/lib/negocio";
import { Inventario, type ProductoInv } from "@/components/inventario/inventario";
import type { Categoria } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const [profile, negocio] = await Promise.all([requireProfile(), requireNegocio()]);
  const supabase = await createClient();

  const [{ data: productosData }, { data: categoriasData }] = await Promise.all([
    supabase
      .from("productos")
      .select(
        "id, nombre, sku, precio_venta, stock, stock_minimo, activo, grupo, categoria_id, categoria:categorias(nombre, prefijo, orden)",
      )
      .eq("negocio_id", negocio.id)
      .order("nombre"),
    supabase.from("categorias").select("*").eq("negocio_id", negocio.id).order("orden"),
  ]);

  const productos = (productosData ?? []) as unknown as ProductoInv[];
  const categorias = (categoriasData ?? []) as unknown as Categoria[];

  return (
    <Inventario
      productos={productos}
      categorias={categorias}
      esAdmin={esAdmin(profile)}
      gruposSugeridos={negocio.gruposSugeridos}
    />
  );
}
