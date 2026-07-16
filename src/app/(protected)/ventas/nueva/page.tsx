import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { POS } from "@/components/pos/pos";

export const dynamic = "force-dynamic";

export default async function NuevaVentaPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: categorias }, { data: productos }] = await Promise.all([
    supabase.from("categorias").select("*").order("orden"),
    supabase
      .from("productos")
      .select("id, nombre, sku, precio_venta, stock, categoria_id")
      .eq("activo", true)
      .order("nombre"),
  ]);

  return (
    <POS
      role={profile.role}
      categorias={categorias ?? []}
      productos={productos ?? []}
    />
  );
}
