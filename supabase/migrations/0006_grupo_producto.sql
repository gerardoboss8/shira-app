-- =====================================================================
-- Shira App · 0006_grupo_producto.sql
-- Subcategoría opcional de producto ("grupo"): agrupa variantes de un
-- mismo artículo (ej. Camisas → manga/talla/color) para que en Inventario
-- y en el POS aparezcan como UNA fila que se despliega.
-- El grupo NO reemplaza a la categoría: vive dentro de ella.
-- =====================================================================

alter table public.productos add column if not exists grupo text;

comment on column public.productos.grupo is
  'Subcategoría opcional. Los productos con el mismo grupo (dentro de una categoría) se muestran juntos como variantes.';

create index if not exists idx_productos_grupo on public.productos(grupo);

-- ---------------------------------------------------------------------
-- crear_producto ahora acepta el grupo.
-- Se elimina la firma anterior para que no queden dos versiones ambiguas.
-- ---------------------------------------------------------------------
drop function if exists public.crear_producto(uuid, text, numeric, int, int, numeric);

create or replace function public.crear_producto(
  p_categoria_id  uuid,
  p_nombre        text,
  p_precio_venta  numeric,
  p_stock_inicial int default 0,
  p_stock_minimo  int default 2,
  p_costo         numeric default null,
  p_grupo         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_prefijo text;
  v_next    int;
  v_sku     text;
  v_id      uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede crear productos.';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre del producto es obligatorio.';
  end if;
  if p_precio_venta is null or p_precio_venta < 0 then
    raise exception 'El precio de venta no es válido.';
  end if;
  if coalesce(p_stock_inicial, 0) < 0 then
    raise exception 'El stock inicial no puede ser negativo.';
  end if;

  select prefijo into v_prefijo from public.categorias where id = p_categoria_id;
  if not found then
    raise exception 'Categoría no encontrada.';
  end if;

  -- Serializa la generación de SKU por categoría (evita choques entre admins)
  perform pg_advisory_xact_lock(hashtext(v_prefijo));

  select coalesce(max((regexp_replace(sku, '^' || v_prefijo || '-', ''))::int), 0) + 1
    into v_next
    from public.productos
   where sku ~ ('^' || v_prefijo || '-[0-9]+$');

  v_sku := v_prefijo || '-' || lpad(v_next::text, 3, '0');

  insert into public.productos
    (categoria_id, nombre, sku, precio_venta, costo, stock_minimo, grupo)
  values
    (p_categoria_id, trim(p_nombre), v_sku, p_precio_venta, p_costo,
     coalesce(p_stock_minimo, 2), nullif(trim(coalesce(p_grupo, '')), ''))
  returning id into v_id;

  -- El stock nace auditado, como todo en el sistema
  if coalesce(p_stock_inicial, 0) > 0 then
    insert into public.movimientos_inventario
      (producto_id, tipo, cantidad, usuario_id, nota)
    values
      (v_id, 'entrada', p_stock_inicial, v_uid, 'Alta de producto');
  end if;

  return jsonb_build_object('id', v_id, 'sku', v_sku);
end;
$$;

grant execute on function public.crear_producto(uuid, text, numeric, int, int, numeric, text) to authenticated;
