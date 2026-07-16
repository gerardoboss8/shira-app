-- =====================================================================
-- Shira App · 0002_stock_and_sales.sql
-- Triggers de stock + funciones transaccionales de venta/anulación.
-- =====================================================================

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.productos;
create trigger set_updated_at before update on public.productos
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.seguimientos;
create trigger set_updated_at before update on public.seguimientos
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- Stock derivado de movimientos_inventario (append-only)
-- El signo de cantidad ajusta el stock. Movimientos no se editan/borran.
-- ---------------------------------------------------------------------
create or replace function public.tg_aplicar_movimiento()
returns trigger language plpgsql as $$
begin
  update public.productos
     set stock = stock + new.cantidad
   where id = new.producto_id;
  return new;
end;
$$;

drop trigger if exists aplicar_movimiento on public.movimientos_inventario;
create trigger aplicar_movimiento after insert on public.movimientos_inventario
  for each row execute function public.tg_aplicar_movimiento();

-- Blindaje: los movimientos son inmutables (auditoría)
create or replace function public.tg_movimiento_inmutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Los movimientos de inventario son inmutables (no se editan ni borran).';
end;
$$;

drop trigger if exists movimiento_no_update on public.movimientos_inventario;
create trigger movimiento_no_update before update or delete on public.movimientos_inventario
  for each row execute function public.tg_movimiento_inmutable();

-- ---------------------------------------------------------------------
-- Alta de perfil al crear usuario en auth (sin registro público).
-- role y nombre vienen del metadata que pone el admin al invitar.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nombre, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'vendedor')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Helpers de rol para RLS (security definer evita recursión en policies)
-- ---------------------------------------------------------------------
create or replace function public.rol_actual()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.rol_actual() = 'admin', false);
$$;

-- ---------------------------------------------------------------------
-- REGISTRAR VENTA (transaccional): crea venta + items + movimientos.
-- Los precios se toman del servidor (no del cliente) para evitar fraude.
-- p_items: jsonb [{ "producto_id": uuid, "cantidad": int }, ...]
-- ---------------------------------------------------------------------
create or replace function public.registrar_venta(
  p_items          jsonb,
  p_metodo_pago    text default 'efectivo',
  p_cliente_nombre text default null,
  p_descuento      numeric default 0,
  p_nota           text default null,
  p_permitir_stock_negativo boolean default false
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

  -- Crea la cabecera (subtotal/total se completan al final)
  insert into public.ventas (vendedor_id, cliente_nombre, metodo_pago, subtotal, descuento, total)
  values (v_uid, nullif(trim(p_cliente_nombre), ''), coalesce(p_metodo_pago,'efectivo'), 0, coalesce(p_descuento,0), 0)
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

  return jsonb_build_object('venta_id', v_venta_id, 'folio', v_folio, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------
-- ANULAR VENTA (solo admin): marca anulada y devuelve el stock.
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
  v_it     record;
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

  -- Devuelve el stock con movimientos de devolución
  for v_it in select producto_id, cantidad from public.venta_items where venta_id = p_venta_id
  loop
    insert into public.movimientos_inventario (producto_id, tipo, cantidad, referencia_venta, usuario_id, nota)
    values (v_it.producto_id, 'devolucion', v_it.cantidad, p_venta_id, v_uid,
            'Anulación V-' || lpad(v_folio::text, 4, '0') || ': ' || p_motivo);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- ENTRADA / AJUSTE de inventario (registro auditado de un movimiento).
-- Vendedores no ajustan stock; el app lo restringe a admin (y RLS).
-- ---------------------------------------------------------------------
create or replace function public.registrar_movimiento(
  p_producto_id uuid,
  p_tipo        text,     -- 'entrada' | 'ajuste' | 'merma' | 'devolucion'
  p_cantidad    int,      -- con signo (+ entra, - sale)
  p_nota        text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede mover inventario manualmente.';
  end if;
  if p_tipo = 'salida_venta' then
    raise exception 'Las salidas por venta se registran desde el punto de venta.';
  end if;
  if p_tipo in ('ajuste','merma') and coalesce(trim(p_nota),'') = '' then
    raise exception 'Los ajustes y mermas requieren una nota.';
  end if;

  insert into public.movimientos_inventario (producto_id, tipo, cantidad, usuario_id, nota)
  values (p_producto_id, p_tipo, p_cantidad, v_uid, nullif(trim(p_nota),''))
  returning id into v_id;

  return v_id;
end;
$$;
