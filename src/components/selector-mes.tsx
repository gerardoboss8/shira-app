"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { nombreMes } from "@/lib/meses";

/**
 * Elegir mes: flechas para el anterior/siguiente y lista desplegable.
 * `meses` va del más reciente al más antiguo. Cambia solo `?mes=` en la URL
 * y conserva los demás filtros (`params`).
 */
export function SelectorMes({
  ruta,
  mes,
  meses,
  params = {},
}: {
  ruta: string;
  mes: string;
  meses: string[];
  params?: Record<string, string>;
}) {
  const router = useRouter();
  const href = (m: string) => `${ruta}?${new URLSearchParams({ ...params, mes: m }).toString()}`;

  const i = meses.indexOf(mes);
  const anterior = i >= 0 && i < meses.length - 1 ? meses[i + 1] : null;
  const siguiente = i > 0 ? meses[i - 1] : null;

  return (
    <div className="flex items-center gap-2">
      <Flecha href={anterior && href(anterior)} etiqueta="Mes anterior">
        <ChevronLeft className="h-5 w-5" />
      </Flecha>
      <select
        value={mes}
        onChange={(e) => router.push(href(e.target.value))}
        aria-label="Elegir mes"
        className="h-10 min-w-0 flex-1 rounded-lg border bg-card px-3 text-base font-medium capitalize outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {meses.map((m) => (
          <option key={m} value={m} className="capitalize">
            {nombreMes(m)}
          </option>
        ))}
      </select>
      <Flecha href={siguiente && href(siguiente)} etiqueta="Mes siguiente">
        <ChevronRight className="h-5 w-5" />
      </Flecha>
    </div>
  );
}

function Flecha({
  href,
  etiqueta,
  children,
}: {
  href: string | null;
  etiqueta: string;
  children: React.ReactNode;
}) {
  const clase = "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-card";
  if (!href) {
    return (
      <span aria-hidden className={cn(clase, "text-muted-foreground/40")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={etiqueta} className={cn(clase, "hover:bg-accent")}>
      {children}
    </Link>
  );
}
