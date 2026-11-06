-- =====================================================================
-- Shira App · 0011_sobre_pedido_opciones.sql
--
--  · SOBRE PEDIDO: productos con controla_stock = false se venden sin
--    existencias (se confeccionan después del pedido). No mueven inventario.
--  · OPCIONES POR LÍNEA: cada categoría puede tener listas para elegir al
--    vender (Cantel: cuadro y color; Lino: color; Jacquard: diseño).
--    Formato: [{"nombre": "Color", "valores": ["Rojo", "Azul", ...]}, ...]
--  · El detalle elegido (ej. "Cuadro grande · Rojo") se guarda en la línea
--    de la venta y sale en el comprobante.
--
-- Seguro de correr más de una vez.
-- =====================================================================

begin;

alter table public.productos add column if not exists controla_stock boolean not null default true;
comment on column public.productos.controla_stock is
  'false = sobre pedido: se vende sin existencias y no mueve inventario.';

alter table public.categorias add column if not exists opciones jsonb not null default '[]'::jsonb;
comment on column public.categorias.opciones is
  'Listas que se eligen al vender: [{"nombre": "Color", "valores": ["Rojo", ...]}].';

-- ---------------------------------------------------------------------
-- registrar_venta: igual que 0010 + sobre pedido + detalle en cualquier
-- línea (p_items[].descripcion).
-- ---------------------------------------------------------------------
create or replace function public.registrar_venta(
  p_items          jsonb,
  p_metodo_pago    text default 'efectivo',
  p_cliente_nombre text default null,
  p_descuento      numeric default 0,
  p_nota           text default null,
  p_permitir_stock_negativo boolean default false,
  p_fecha          date default null,
  p_tipo           text default 'normal',
  p_negocio_id     text default 'shira',
  p_datos_cliente  jsonb default null
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
  v_comp      record;
  v_cant      int;
  v_precio    numeric(10,2);
  v_desc      text;
  v_linea     numeric(10,2);
  v_hoy_gt    date := (now() at time zone 'America/Guatemala')::date;
  v_fecha     timestamptz := now();
  v_nota      text := nullif(trim(p_nota), '');
  v_tipo      text := coalesce(p_tipo, 'normal');
  v_negocio   text := coalesce(p_negocio_id, 'shira');
  v_forzar    boolean := p_permitir_stock_negativo and public.es_admin();
  v_envio     numeric(10,2) := coalesce(nullif(p_datos_cliente->>'envio_costo', '')::numeric, 0);
  v_es_combo  boolean;
begin
  if v_uid is null then
    raise exception 'No autenticado.';
  end if;
  if not exists (select 1 from public.negocios where id = v_negocio and activo) then
    raise exception 'Negocio no válido.';
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
  if v_envio < 0 then
    raise exception 'El costo de envío no puede ser negativo.';
  end if;

  if p_fecha is not null and p_fecha <> v_hoy_gt then
    if p_fecha > v_hoy_gt then
      raise exception 'La fecha de la venta no puede ser futura.';
    end if;
    v_fecha := (p_fecha + time '12:00') at time zone 'America/Guatemala';
    v_nota  := trim(coalesce(v_nota, '') || ' [Registrada el '
               || to_char(v_hoy_gt, 'DD/MM/YYYY') || ']');
  end if;

  perform pg_advisory_xact_lock(hashtext('folio:' || v_negocio));
  select coalesce(max(folio), 0) + 1 into v_folio
    from public.ventas where negocio_id = v_negocio;

  insert into public.ventas (negocio_id, folio, vendedor_id, fecha, cliente_nombre, metodo_pago,
                             subtotal, descuento, total, nota, tipo,
                             cliente_telefono, cliente_direccion, cliente_referencia,
                             envio_empresa, envio_costo)
  values (v_negocio, v_folio, v_uid, v_fecha, nullif(trim(p_cliente_nombre), ''),
          coalesce(p_metodo_pago,'efectivo'), 0, coalesce(p_descuento,0), 0, v_nota, v_tipo,
          nullif(trim(p_datos_cliente->>'telefono'), ''),
          nullif(trim(p_datos_cliente->>'direccion'), ''),
          nullif(trim(p_datos_cliente->>'referencia'), ''),
          nullif(trim(p_datos_cliente->>'envio_empresa'), ''),
          v_envio)
  returning id into v_venta_id;

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
    if v_prod.negocio_id <> v_negocio then
      raise exception '"%" no pertenece a este negocio.', v_prod.nombre;
    end if;

    -- Detalle de la línea (color, diseño, nota...). Opcional, salvo en precio libre.
    v_desc := nullif(trim(v_item->>'descripcion'), '');

    if v_prod.precio_libre then
      v_precio := round(nullif(v_item->>'precio', '')::numeric, 2);
      if v_precio is null or v_precio <= 0 then
        raise exception 'Indica el monto de "%".', v_prod.nombre;
      end if;
      if v_desc is null then
        raise exception 'Describe qué incluye "%".', v_prod.nombre;
      end if;
    else
      v_precio := v_prod.precio_venta;
      v_es_combo := exists (select 1 from public.producto_componentes where producto_id = v_prod.id);

      if v_es_combo then
        for v_comp in
          select c.cantidad as por_combo, p.id, p.nombre, p.stock
            from public.producto_componentes c
            join public.productos p on p.id = c.componente_id
           where c.producto_id = v_prod.id and p.controla_stock
           order by p.sku
             for update of p
        loop
          if v_comp.stock < v_comp.por_combo * v_cant and not v_forzar then
            raise exception 'Stock insuficiente de "%" para el combo "%": disponible %, se necesitan %.',
              v_comp.nombre, v_prod.nombre, v_comp.stock, v_comp.por_combo * v_cant;
          end if;
          insert into public.movimientos_inventario (producto_id, tipo, cantidad, referencia_venta, usuario_id, nota)
          values (v_comp.id, 'salida_venta', -(v_comp.por_combo * v_cant), v_venta_id, v_uid,
                  'Venta V-' || lpad(v_folio::text, 4, '0') || ' (combo ' || v_prod.nombre || ')');
        end loop;
      elsif v_prod.controla_stock then
        if v_prod.stock < v_cant and not v_forzar then
          raise exception 'Stock insuficiente de "%": disponible %, solicitado %.',
            v_prod.nombre, v_prod.stock, v_cant;
        end if;
        insert into public.movimientos_inventario (producto_id, tipo, cantidad, referencia_venta, usuario_id, nota)
        values (v_prod.id, 'salida_venta', -v_cant, v_venta_id, v_uid, 'Venta V-' || lpad(v_folio::text, 4, '0'));
      end if;
      -- Sobre pedido: no mueve inventario.
    end if;

    v_linea := round(v_precio * v_cant, 2);
    v_subtotal := v_subtotal + v_linea;

    insert into public.venta_items (venta_id, producto_id, cantidad, precio_unitario, total_linea, descripcion)
    values (v_venta_id, v_prod.id, v_cant, v_precio, v_linea, v_desc);
  end loop;

  v_total := greatest(v_subtotal - coalesce(p_descuento, 0), 0);

  update public.ventas
     set subtotal = v_subtotal, total = v_total
   where id = v_venta_id;

  return jsonb_build_object('venta_id', v_venta_id, 'folio', v_folio, 'total', v_total,
                            'fecha', v_fecha, 'tipo', v_tipo, 'negocio_id', v_negocio);
end;
$$;

grant execute on function public.registrar_venta(jsonb, text, text, numeric, text, boolean, date, text, text, jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';
