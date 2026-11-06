-- =====================================================================
-- Shira App · 0010_combos_comprobantes.sql
--
--  · COMBOS: un producto puede estar hecho de otros (Juego de
--    Leccionarios = Leccionario I + II + III; Juego casulla + estola).
--    Al venderlo se descuentan sus piezas; el combo no tiene stock propio.
--  · PRECIO LIBRE: productos como "Pedido personalizado" se cobran con el
--    monto y la descripción que se escriben al vender (sin control de stock).
--  · COMPROBANTE: la venta guarda teléfono, dirección, referencia del
--    cliente y el envío (empresa y costo, aparte del total de la venta).
--  · anular_venta devuelve exactamente lo que salió del inventario
--    (sirve igual para combos y ventas antiguas).
--
-- Seguro de correr más de una vez.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------
alter table public.ventas
  add column if not exists cliente_telefono   text,
  add column if not exists cliente_direccion  text,
  add column if not exists cliente_referencia text,
  add column if not exists envio_empresa      text,
  add column if not exists envio_costo        numeric(10,2) not null default 0;

alter table public.ventas drop constraint if exists ventas_envio_costo_check;
alter table public.ventas add constraint ventas_envio_costo_check check (envio_costo >= 0);

comment on column public.ventas.envio_costo is
  'Lo que pagó el cliente por el envío. NO está incluido en total (no infla las ventas).';

alter table public.venta_items add column if not exists descripcion text;
comment on column public.venta_items.descripcion is
  'Qué incluyó una línea de precio libre (ej. pedido personalizado).';

alter table public.productos add column if not exists precio_libre boolean not null default false;
comment on column public.productos.precio_libre is
  'Se cobra con monto y descripción escritos al vender; no lleva stock.';

-- ---------------------------------------------------------------------
-- Combos
-- ---------------------------------------------------------------------
create table if not exists public.producto_componentes (
  producto_id   uuid not null
                constraint producto_componentes_producto_fk
                references public.productos(id) on delete cascade,
  componente_id uuid not null
                constraint producto_componentes_componente_fk
                references public.productos(id) on delete restrict,
  cantidad      int  not null default 1 check (cantidad > 0),
  primary key (producto_id, componente_id),
  check (producto_id <> componente_id)
);
comment on table public.producto_componentes is
  'Piezas de un combo. Vender el combo descuenta el stock de cada pieza.';

alter table public.producto_componentes enable row level security;

drop policy if exists componentes_read on public.producto_componentes;
create policy componentes_read on public.producto_componentes
  for select to authenticated using (true);

drop policy if exists componentes_admin on public.producto_componentes;
create policy componentes_admin on public.producto_componentes
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------------
-- registrar_venta: igual que 0009 + combos, precio libre y datos del
-- cliente/envío (p_datos_cliente).
--   p_items: [{ producto_id, cantidad, precio?, descripcion? }]
--            precio y descripcion solo para productos de precio libre.
--   p_datos_cliente: { telefono, direccion, referencia, envio_empresa, envio_costo }
-- ---------------------------------------------------------------------
drop function if exists public.registrar_venta(jsonb, text, text, numeric, text, boolean, date, text, text);

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

  -- Fecha de la venta
  if p_fecha is not null and p_fecha <> v_hoy_gt then
    if p_fecha > v_hoy_gt then
      raise exception 'La fecha de la venta no puede ser futura.';
    end if;
    v_fecha := (p_fecha + time '12:00') at time zone 'America/Guatemala';
    v_nota  := trim(coalesce(v_nota, '') || ' [Registrada el '
               || to_char(v_hoy_gt, 'DD/MM/YYYY') || ']');
  end if;

  -- Folio siguiente del negocio (serializado para que no se repita)
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

    v_desc := null;

    if v_prod.precio_libre then
      -- Monto y descripción vienen de la venta; no mueve inventario
      v_precio := round(nullif(v_item->>'precio', '')::numeric, 2);
      v_desc   := nullif(trim(v_item->>'descripcion'), '');
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
        -- Combo: salen sus piezas
        for v_comp in
          select c.cantidad as por_combo, p.id, p.nombre, p.stock
            from public.producto_componentes c
            join public.productos p on p.id = c.componente_id
           where c.producto_id = v_prod.id
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
      else
        if v_prod.stock < v_cant and not v_forzar then
          raise exception 'Stock insuficiente de "%": disponible %, solicitado %.',
            v_prod.nombre, v_prod.stock, v_cant;
        end if;
        insert into public.movimientos_inventario (producto_id, tipo, cantidad, referencia_venta, usuario_id, nota)
        values (v_prod.id, 'salida_venta', -v_cant, v_venta_id, v_uid, 'Venta V-' || lpad(v_folio::text, 4, '0'));
      end if;
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

-- ---------------------------------------------------------------------
-- ANULAR VENTA: devuelve exactamente lo que salió del inventario con
-- esta venta (piezas de combos incluidas; precio libre no movió nada).
-- ---------------------------------------------------------------------
create or replace function public.anular_venta(p_venta_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_estado text;
  v_folio  bigint;
  v_mov    record;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede anular ventas.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Debe indicar el motivo de la anulación.';
  end if;

  select estado, folio into v_estado, v_folio from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'Venta no encontrada.';
  end if;
  if v_estado = 'anulada' then
    raise exception 'La venta ya está anulada.';
  end if;

  update public.ventas
     set estado = 'anulada',
         nota   = trim(coalesce(nota,'') || ' [ANULADA: ' || p_motivo || ']')
   where id = p_venta_id;

  for v_mov in
    select producto_id, sum(cantidad) as cantidad
      from public.movimientos_inventario
     where referencia_venta = p_venta_id and tipo = 'salida_venta'
     group by producto_id
  loop
    insert into public.movimientos_inventario (producto_id, tipo, cantidad, referencia_venta, usuario_id, nota)
    values (v_mov.producto_id, 'devolucion', -v_mov.cantidad, p_venta_id, v_uid,
            'Anulación V-' || lpad(v_folio::text, 4, '0') || ': ' || p_motivo);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Completar datos del cliente/envío de una venta ya hecha (para sacar
-- su comprobante). Socios y vendedores; no toca montos ni stock.
-- ---------------------------------------------------------------------
create or replace function public.actualizar_datos_cliente(
  p_venta_id       uuid,
  p_cliente_nombre text,
  p_datos_cliente  jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_envio numeric(10,2) := coalesce(nullif(p_datos_cliente->>'envio_costo', '')::numeric, 0);
begin
  if public.rol_actual() not in ('admin','vendedor') then
    raise exception 'No tienes permiso para editar ventas.';
  end if;
  if v_envio < 0 then
    raise exception 'El costo de envío no puede ser negativo.';
  end if;

  update public.ventas
     set cliente_nombre     = nullif(trim(p_cliente_nombre), ''),
         cliente_telefono   = nullif(trim(p_datos_cliente->>'telefono'), ''),
         cliente_direccion  = nullif(trim(p_datos_cliente->>'direccion'), ''),
         cliente_referencia = nullif(trim(p_datos_cliente->>'referencia'), ''),
         envio_empresa      = nullif(trim(p_datos_cliente->>'envio_empresa'), ''),
         envio_costo        = v_envio
   where id = p_venta_id;
  if not found then
    raise exception 'Venta no encontrada.';
  end if;
end;
$$;

grant execute on function public.actualizar_datos_cliente(uuid, text, jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';
