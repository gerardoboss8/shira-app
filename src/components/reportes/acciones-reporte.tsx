"use client";

import { hoyGT } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";

type Fila = { nombre: string; total: number; unidades: number };
type FilaMes = {
  nombre: string;
  ventas: number;
  numVentas: number;
  ticket: number;
  aparte: number;
  gastos: number;
  compras: number;
  resultado: number;
};

export function AccionesReporte({
  negocio,
  periodo,
  archivo: sufijoArchivo,
  resumen,
  porCategoria,
  porVendedor,
  porMetodo,
  topProductos,
  porGasto,
  comparacion,
}: {
  negocio: string;
  periodo: string;
  /** Va en el nombre del archivo: el mes (2026-10) o la fecha de hoy. */
  archivo: string;
  resumen: {
    ingresos: number;
    totalBonos: number;
    totalExtra: number;
    totalGastos: number;
    totalCompras: number;
    resultado: number;
    ventas: number;
    ventasBonos: number;
    ventasExtra: number;
  };
  porCategoria: Fila[];
  porVendedor: Fila[];
  porMetodo: Fila[];
  topProductos: Fila[];
  porGasto: Fila[];
  /** Del mes elegido hacia atrás; vacío si no es reporte mensual. */
  comparacion: FilaMes[];
}) {
  function exportarCSV() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const q = (n: number) => n.toFixed(2);
    const lineas: string[] = [];

    lineas.push(esc(`Reporte ${negocio} · ${periodo} · generado ${hoyGT()}`));
    lineas.push("");
    lineas.push("RESUMEN");
    lineas.push("Concepto,Monto");
    lineas.push(`Ventas normales,${q(resumen.ingresos)}`);
    lineas.push(`Venta de bonos,${q(resumen.totalBonos)}`);
    lineas.push(`Ingresos extra,${q(resumen.totalExtra)}`);
    lineas.push(`Gastos,${q(resumen.totalGastos)}`);
    lineas.push(`Compras,${q(resumen.totalCompras)}`);
    lineas.push(`Resultado,${q(resumen.resultado)}`);
    lineas.push(`Numero de ventas normales,${resumen.ventas}`);
    lineas.push(`Numero de ventas de bonos,${resumen.ventasBonos}`);
    lineas.push(`Numero de ingresos extra,${resumen.ventasExtra}`);

    const bloque = (titulo: string, filas: Fila[], colUnidades: string) => {
      lineas.push("");
      lineas.push(titulo.toUpperCase());
      lineas.push(`Nombre,${colUnidades},Total`);
      for (const f of filas) {
        lineas.push(`${esc(f.nombre)},${f.unidades},${q(f.total)}`);
      }
    };

    bloque("Ventas por categoria", porCategoria, "Unidades");
    bloque("Ventas por vendedor", porVendedor, "Ventas");
    bloque("Ventas por metodo de pago", porMetodo, "Ventas");
    bloque("Productos mas vendidos", topProductos, "Unidades");
    bloque("Gastos y compras por categoria", porGasto, "Registros");

    if (comparacion.length > 1) {
      lineas.push("");
      lineas.push("COMPARACION POR MES");
      lineas.push(
        "Mes,Ventas normales,Variacion vs mes anterior (%),Numero de ventas,Ticket promedio,Bonos y extra,Gastos,Compras,Resultado",
      );
      comparacion.forEach((c, i) => {
        const ant = comparacion[i + 1];
        const cambio = ant && ant.ventas ? ((c.ventas - ant.ventas) / ant.ventas) * 100 : null;
        lineas.push(
          [
            esc(c.nombre),
            q(c.ventas),
            cambio === null ? "" : cambio.toFixed(1),
            c.numVentas,
            q(c.ticket),
            q(c.aparte),
            q(c.gastos),
            q(c.compras),
            q(c.resultado),
          ].join(","),
        );
      });
    }

    const csv = "﻿" + lineas.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // "Librería Shira" -> reporte_libreria_shira_2026-10-23.csv
    const archivo = negocio
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .toLowerCase();
    a.download = `reporte_${archivo}_${sufijoArchivo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex shrink-0 gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={exportarCSV}>
        <Download className="h-4 w-4" /> CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> PDF
      </Button>
    </div>
  );
}
