import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { requireNegocio } from "@/lib/negocio";
import { POS } from "@/components/pos/pos";

export const dynamic = "force-dynamic";

export default async function NuevaVentaPage() {
  const [profile, negocio] = await Promise.all([requireProfile(), requireNegocio()]);
  const supabase = await createClient();

  const [{ data: categorias }, { data: productos }] = await Promise.all([
    supabase.from("categorias").select("*").eq("negocio_id", negocio.id).order("orden"),
    supabase
      .from("productos")
      .select("id, nombre, sku, precio_venta, stock, categoria_id, grupo")
      .eq("negocio_id", negocio.id)
      .eq("activo", true)
      .order("nombre"),
  ]);

  return (
    <POS
      role={profile.role}
      negocioId={negocio.id}
      categorias={categorias ?? []}
      productos={productos ?? []}
    />
  );
}
