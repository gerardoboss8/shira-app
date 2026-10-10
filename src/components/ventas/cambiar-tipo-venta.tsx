"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { TipoVenta } from "@/lib/database.types";
import { TIPOS_VENTA, tipoVentaClase, tipoVentaLabel } from "@/lib/tipos-venta";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

/** Botones para re-marcar el tipo de una venta ya registrada (solo admin). */
export function CambiarTipoVenta({
  ventaId,
  folio,
  tipo,
}: {
  ventaId: string;
  folio: string;
  tipo: TipoVenta;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState<TipoVenta | null>(null);

  async function cambiar(nuevo: TipoVenta) {
    if (nuevo === tipo || guardando) return;
    setGuardando(nuevo);
    const supabase = createClient();
    const { error } = await supabase.rpc("cambiar_tipo_venta", {
      p_venta_id: ventaId,
      p_tipo: nuevo,
    });
    setGuardando(null);

    if (error) {
      toast.error(error.message ?? "No se pudo cambiar el tipo de venta.");
      return;
    }
    toast.success(`${folio} marcada como "${tipoVentaLabel[nuevo]}".`);
    router.refresh();
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {TIPOS_VENTA.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => cambiar(t.value)}
          disabled={!!guardando}
          aria-pressed={tipo === t.value}
          className={cn(
            "flex h-10 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-60",
            tipo === t.value
              ? t.value === "normal"
                ? "border-primary bg-primary text-primary-foreground"
                : tipoVentaClase[t.value]
              : "bg-card hover:bg-accent",
          )}
        >
          {guardando === t.value && <Loader2 className="h-4 w-4 animate-spin" />}
          {t.corto}
        </button>
      ))}
    </div>
  );
}
