import type { TipoVenta } from "@/lib/database.types";
import { tipoVentaClase, tipoVentaLabel } from "@/lib/tipos-venta";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/** Etiqueta de color para ventas de bonos / ingreso extra. Las normales no muestran nada. */
export function TipoVentaBadge({ tipo, className }: { tipo: TipoVenta; className?: string }) {
  if (tipo === "normal") return null;
  return (
    <Badge variant="outline" className={cn(tipoVentaClase[tipo], className)}>
      {tipoVentaLabel[tipo]}
    </Badge>
  );
}
