-- =====================================================================
-- Shira App · 0009_negocios.sql
-- Multi-negocio: la misma app y la misma base atienden a Librería Shira
-- y a Artisan (manteles y accesorios de cocina). Al entrar, el usuario
-- elige el negocio y todo se filtra por él.
--
--  · Tabla `negocios` (id de texto: 'shira', 'artisan').
--  · `negocio_id` en categorias, productos, ventas, gastos,
--    recordatorios y seguimientos. TODO lo existente queda como 'shira'.
--  · El folio de venta pasa a ser correlativo POR negocio
--    (Shira conserva sus números; Artisan empieza en V-0001).
--  · registrar_venta recibe p_negocio_id y valida que los productos
--    sean de ese negocio.
--  · Alta de Artisan: categorías Cantel / Lino / Jacquard y manteles
--    por tamaño (inactivos y en Q0 hasta que se les ponga precio).
--
-- Seguro de correr más de una vez (idempotente).
-- Todos los usuarios pueden trabajar en ambos negocios.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Negocios
-- ---------------------------------------------------------------------
create table if not exists public.negocios (
  id         text primary key,             -- 'shira', 'artisan'
  nombre     text not null,
  orden      int  not null default 0,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.negocios is 'Negocios que comparten la app. El id se usa en la cookie y en el tema visual.';

insert into public.negocios (id, nombre, orden) values
  ('shira',   'Librería Shira', 1),
  ('artisan', 'Artisan',        2)
on conflict (id) do update set nombre = excluded.nombre, orden = excluded.orden;

alter table public.negocios enable row level security;

drop policy if exists negocios_read on public.negocios;
create policy negocios_read on public.negocios
  for select to authenticated using (true);

drop policy if exists negocios_admin on public.negocios;
create policy negocios_admin on public.negocios
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------------
-- negocio_id en las tablas de datos.
-- El default 'shira' mantiene funcionando la versión anterior de la app
-- mientras se publica la nueva (no rompe nada a medio despliegue).
-- ---------------------------------------------------------------------
alter table public.categorias    add column if not exists negocio_id text not null default 'shira' references public.negocios(id);
alter table public.productos     add column if not exists negocio_id text not null default 'shira' references public.negocios(id);
alter table public.ventas        add column if not exists negocio_id text not null default 'shira' references public.negocios(id);
alter table public.gastos        add column if not exists negocio_id text not null default 'shira' references public.negocios(id);
alter table public.recordatorios add column if not exists negocio_id text not null default 'shira' references public.negocios(id);
alter table public.seguimientos  add column if not exists negocio_id text not null default 'shira' references public.negocios(id);

create index if not exists idx_categorias_negocio    on public.categorias(negocio_id, orden);
create index if not exists idx_productos_negocio     on public.productos(negocio_id);
create index if not exists idx_ventas_negocio        on public.ventas(negocio_id, fecha desc);
create index if not exists idx_gastos_negocio        on public.gastos(negocio_id, fecha desc);
create index if not exists idx_recordatorios_negocio on public.recordatorios(negocio_id);
create index if not exists idx_seguimientos_negocio  on public.seguimientos(negocio_id);

-- El nombre de categoría ya no es único global, sino por negocio.
alter table public.categorias drop constraint if exists categorias_nombre_key;
create unique index if not exists idx_categorias_negocio_nombre on public.categorias(negocio_id, nombre);

-- ---------------------------------------------------------------------
-- El producto hereda siempre el negocio de su categoría.
-- ---------------------------------------------------------------------
create or replace function public.tg_producto_negocio()
returns trigger language plpgsql as $$
begin
  select negocio_id into new.negocio_id from public.categorias where id = new.categoria_id;
  return new;
end;
$$;

drop trigger if exists producto_negocio on public.productos;
create trigger producto_negocio before insert or update of categoria_id, negocio_id on public.productos
  for each row execute function public.tg_producto_negocio();

-- Alinea los productos existentes con su categoría (hoy todo es Shira).
update public.productos p
   set negocio_id = c.negocio_id
  from public.categorias c
 where c.id = p.categoria_id and p.negocio_id <> c.negocio_id;

-- ---------------------------------------------------------------------
-- Folio correlativo por negocio.
-- Se quita la identidad global; Shira conserva sus números actuales.
-- ---------------------------------------------------------------------
alter table public.ventas alter column folio drop identity if exists;
drop index if exists public.idx_ventas_folio;
create unique index if not exists idx_ventas_negocio_folio on public.ventas(negocio_id, folio);

-- ---------------------------------------------------------------------
-- registrar_venta: igual que 0008 + p_negocio_id y folio por negocio.
-- ---------------------------------------------------------------------
drop function if exists public.registrar_venta(jsonb, text, text, numeric, text, boolean, date, text);

create or replace function public.registrar_venta(
  p_items          jsonb,
  p_metodo_pago    text default 'efectivo',
  p_cliente_nombre text default null,
  p_descuento      numeric default 0,
  p_nota           text default null,
  p_permitir_stock_negativo boolean default false,
  p_fecha          date default null,
  p_tipo           text default 'normal',
  p_negocio_id     text default 'shira'
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
  v_negocio   text := coalesce(p_negocio_id, 'shira');
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

  -- Crea la cabecera (subtotal/total se completan al final)
  insert into public.ventas (negocio_id, folio, vendedor_id, fecha, cliente_nombre, metodo_pago,
                             subtotal, descuento, total, nota, tipo)
  values (v_negocio, v_folio, v_uid, v_fecha, nullif(trim(p_cliente_nombre), ''),
          coalesce(p_metodo_pago,'efectivo'), 0, coalesce(p_descuento,0), 0, v_nota, v_tipo)
  returning id into v_venta_id;

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
    if v_prod.negocio_id <> v_negocio then
      raise exception '"%" no pertenece a este negocio.', v_prod.nombre;
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

  return jsonb_build_object('venta_id', v_venta_id, 'folio', v_folio, 'total', v_total,
                            'fecha', v_fecha, 'tipo', v_tipo, 'negocio_id', v_negocio);
end;
$$;

grant execute on function public.registrar_venta(jsonb, text, text, numeric, text, boolean, date, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Alta de Artisan
--   Categorías = material: Cantel (CAN), Lino (LIN), Jacquard (JAC).
--   Grupos dentro de cada una: Manteles, Paneras, Tortilleras, Baguetera,
--   Gabachas, Individuales, Bolsas (se eligen al crear el producto).
--   Manteles por tamaño: se crean INACTIVOS y en Q0; al ponerles precio
--   y activarlos en Inventario ya aparecen para vender.
-- ---------------------------------------------------------------------
insert into public.categorias (negocio_id, nombre, prefijo, orden) values
  ('artisan', 'Cantel',   'CAN', 1),
  ('artisan', 'Lino',     'LIN', 2),
  ('artisan', 'Jacquard', 'JAC', 3)
on conflict (prefijo) do nothing;

insert into public.productos (categoria_id, nombre, sku, precio_venta, stock_minimo, activo, grupo)
select c.id,
       'Mantel ' || t.personas || ' personas',
       c.prefijo || '-' || lpad(t.n::text, 3, '0'),
       0, 2, false, 'Manteles'
  from public.categorias c
 cross join (values (1, 4), (2, 6), (3, 8), (4, 10), (5, 12)) as t(n, personas)
 where c.negocio_id = 'artisan'
on conflict (sku) do nothing;

commit;

-- Recarga el esquema de la API para que la app vea los cambios de inmediato
notify pgrst, 'reload schema';
