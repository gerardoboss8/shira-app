/**
 * Supabase devuelve como máximo 1000 filas por consulta. Para reportes de un
 * mes (o de varios) se piden en páginas hasta traerlas todas.
 *
 *   const ventas = await traerTodo((d, h) => supabase.from("ventas").select("…").range(d, h));
 */
const PAGINA = 1000;

export async function traerTodo<T>(
  consulta: (
    desde: number,
    hasta: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as T[];
    filas.push(...pagina);
    if (pagina.length < PAGINA) return filas;
  }
}
