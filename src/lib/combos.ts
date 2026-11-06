/**
 * Combos (producto hecho de otros) y productos de precio libre.
 * Un combo no tiene stock propio: se pueden vender tantos como alcancen
 * sus piezas. Uso con el select `COMPONENTES_SELECT` dentro de productos.
 */

/** Ni combo, ni precio libre, ni sobre pedido: lleva existencias propias. */
export function llevaStock(p: { es_combo: boolean; precio_libre: boolean; controla_stock: boolean }) {
  return !p.es_combo && !p.precio_libre && p.controla_stock;
}

/** Fragmento de select de Supabase para traer las piezas de un combo. */
export const COMPONENTES_SELECT =
  "componentes:producto_componentes!producto_componentes_producto_fk(cantidad, componente:productos!producto_componentes_componente_fk(id, nombre, stock, activo))";

export type ComponenteRow = {
  cantidad: number;
  componente: { id: string; nombre: string; stock: number; activo: boolean } | null;
};

/** Cuántos combos alcanzan con el stock de sus piezas (0 si falta alguna). */
export function stockDeCombo(componentes: ComponenteRow[]): number {
  if (componentes.length === 0) return 0;
  return Math.max(
    0,
    Math.min(
      ...componentes.map((c) =>
        c.componente && c.componente.activo ? Math.floor(c.componente.stock / c.cantidad) : 0,
      ),
    ),
  );
}

/** "Leccionario I + Leccionario II + Leccionario III" */
export function piezasDeCombo(componentes: ComponenteRow[]): string {
  return componentes
    .map((c) => `${c.cantidad > 1 ? `${c.cantidad}× ` : ""}${c.componente?.nombre ?? "—"}`)
    .join(" + ");
}

/**
 * Normaliza un producto leído con COMPONENTES_SELECT: si es combo, su stock
 * pasa a ser el calculado; marca `es_combo` y quita la lista cruda.
 */
export function conStockReal<T extends { stock: number; componentes?: ComponenteRow[] | null }>(
  p: T,
): Omit<T, "componentes"> & { es_combo: boolean; piezas: string | null } {
  const { componentes, ...resto } = p;
  const lista = componentes ?? [];
  const esCombo = lista.length > 0;
  return {
    ...resto,
    stock: esCombo ? stockDeCombo(lista) : p.stock,
    es_combo: esCombo,
    piezas: esCombo ? piezasDeCombo(lista) : null,
  };
}
