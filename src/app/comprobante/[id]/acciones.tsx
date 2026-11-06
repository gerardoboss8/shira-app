"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";

/** Barra superior del comprobante (no sale en el PDF). */
export function AccionesComprobante({ ventaId }: { ventaId: string }) {
  return (
    <div className="mx-auto mb-4 flex max-w-[816px] items-center justify-between gap-2 px-4 print:hidden">
      <Button
        render={<Link href={`/ventas/${ventaId}`} />}
        nativeButton={false}
        variant="ghost"
        size="sm"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a la venta
      </Button>
      <Button onClick={() => window.print()}>
        <Download className="h-4 w-4" /> Descargar PDF
      </Button>
    </div>
  );
}
