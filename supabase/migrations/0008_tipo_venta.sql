-- =====================================================================
-- Shira App · 0008_tipo_venta.sql
-- Marca el tipo de cada venta para separarla en historial y reportes:
--  · normal → venta del mes (por defecto, no se marca)
--  · bonos  → venta de bonos
--  · extra  → otro ingreso extra
-- Las ventas existentes quedan como 'normal'.
-- El tipo se elige al vender (registrar_venta) y un admin puede
-- cambiarlo después (cambiar_tipo_venta), dejando rastro en la nota.
-- =====================================================================

alter table public.ventas
  add column if not exists tipo text not null default 'normal';

alter table public.ventas drop constraint if exists ventas_tipo_check;
alter table public.ventas
  add constraint ventas_tipo_check check (tipo in ('normal','bonos','extra'));

create index if not exists idx_ventas_tipo on public.ventas(tipo, fecha desc);

-- ---------------------------------------------------------------------
-- registrar_venta: igual que 0007 + p_tipo
-- ---------------------------------------------------------------------
drop function if exists public.registrar_venta(jsonb, text, text, numeric, text, boolean, date);

create or replace function public.registrar_venta(
  p_items          jsonb,
  p_metodo_pago    text default 'efectivo',
  p_cliente_nombre text default null,
  p_descuento      numeric default 0,
  p_nota           text default null,
  p_permitir_stock_negativo boolean default false,
  p_fecha          date default null,
  p_tipo           text default 'normal'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_venta_id  uuid;
  v_folio     bigint;
  v_subtotal  numeric(10,2) := 0;
  v_total     numeric(10,2);
  v_item      jsonb;
  v_prod      public.productos%rowtype;
  v_cant      int;
  v_linea     numeric(10,2);
  v_hoy_gt    date := (now() at time zone 'America/Guatemala')::date;
  v_fecha     timestamptz := now();
  v_nota      text := nullif(trim(p_nota), '');
  v_tipo      text := coalesce(p_tipo, 'normal');
begin
  if v_uid is null then
    raise exception 'No autenticado.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos.';
  end if;
  if coalesce(p_descuento, 0) > 0 and not public.es_admin() then
    raise exception 'Solo un administrador puede aplicar descuento.';
  end if;
  if v_tipo not in ('normal','bonos','extra') then
    raise exception 'Tipo de venta inválido.';
  end if;

  -- Fecha de la venta
  if p_fecha is not null and p_fecha <> v_hoy_gt then
    if p_fecha > v_hoy_gt then
      raise exception 'La fecha de la venta no puede ser futura.';
    end if;
    v_fecha := (p_fecha + time '12:00') at time zone 'America/Guatemala';
    v_nota  := trim(coalesce(v_nota, '') || ' [Registrada el '
               || to_char(v_hoy_gt, 'DD/MM/YYYY') || ']');
  end if;

  -- Crea la cabecera (subtotal/total se completan al final)
  insert into public.ventas (vendedor_id, fecha, cliente_nombre, metodo_pago, subtotal, descuento, total, nota, tipo)
  values (v_uid, v_fecha, nullif(trim(p_cliente_nombre), ''), coalesce(p_metodo_pago,'efectivo'),
          0, coalesce(p_descuento,0), 0, v_nota, v_tipo)
  returning id, folio into v_venta_id, v_folio;

  -- Recorre los items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cant := (v_item->>'cantidad')::int;
    if v_cant is null or v_cant <= 0 then
      raise exception 'Cantidad inválida en un producto.';
    end if;

    select * into v_prod from public.productos
      where id = (v_item->>'producto_id')::uuid and activo = true
      for update;
    if not found then
      raise exception 'Producto no encontrado o inactivo.';
    end if;

    if v_prod.stock < v_cant and not (p_permitir_stock_negativo and public.es_admin()) then
      raise exception 'Stock insuficiente de "%": disponible %, solicitado %.',
        v_prod.nombre, v_prod.stock, v_cant;
    end if;

    v_linea := round(v_prod.precio_venta * v_cant, 2);
    v_subtotal := v_subtotal + v_linea;

    insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario, total_linea)
    values (v_venta_id, v_prod.id, v_cant, v_prod.precio_venta, v_linea);

    insert into public.movimientos_inventario (producto_id, tipo, cantidad, referencia_venta, usuario_id, nota)
    values (v_prod.id, 'salida_venta', -v_cant, v_venta_id, v_uid, 'Venta V-' || lpad(v_folio::text, 4, '0'));
  end loop;

  v_total := greatest(v_subtotal - coalesce(p_descuento, 0), 0);

  update public.ventas
     set subtotal = v_subtotal, total = v_total
   where id = v_venta_id;

  return jsonb_build_object('venta_id', v_venta_id, 'folio', v_folio, 'total', v_total, 'fecha', v_fecha, 'tipo', v_tipo);
end;
$$;

grant execute on function public.registrar_venta(jsonb, text, text, numeric, text, boolean, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- CAMBIAR TIPO (solo admin): re-marca una venta ya registrada.
-- No toca montos ni stock; deja el cambio anotado en la nota.
-- ---------------------------------------------------------------------
create or replace function public.cambiar_tipo_venta(p_venta_id uuid, p_tipo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual text;
  v_hoy_gt date := (now() at time zone 'America/Guatemala')::date;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar el tipo de una venta.';
  end if;
  if p_tipo is null or p_tipo not in ('normal','bonos','extra') then
    raise exception 'Tipo de venta inválido.';
  end if;

  select tipo into v_actual from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'Venta no encontrada.';
  end if;
  if v_actual = p_tipo then
    return;
  end if;

  update public.ventas
     set tipo = p_tipo,
         nota = trim(coalesce(nota, '') || ' [Tipo: ' || v_actual || ' → ' || p_tipo
                || ' el ' || to_char(v_hoy_gt, 'DD/MM/YYYY') || ']')
   where id = p_venta_id;
end;
$$;

grant execute on function public.cambiar_tipo_venta(uuid, text) to authenticated;

-- Recarga el esquema de la API para que la app vea los cambios de inmediato
notify pgrst, 'reload schema';
