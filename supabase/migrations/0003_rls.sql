-- =====================================================================
-- Shira App · 0003_rls.sql
-- Row Level Security. Roles: admin, vendedor, contador (solo lectura).
-- Las funciones registrar_venta/anular_venta/registrar_movimiento son
-- SECURITY DEFINER: hacen las escrituras controladas de forma segura.
-- =====================================================================

alter table public.profiles               enable row level security;
alter table public.categorias             enable row level security;
alter table public.productos              enable row level security;
alter table public.ventas                 enable row level security;
alter table public.venta_items            enable row level security;
alter table public.movimientos_inventario enable row level security;
alter table public.recordatorios          enable row level security;
alter table public.seguimientos           enable row level security;
alter table public.seguimiento_notas      enable row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.es_admin());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = public.rol_actual());

-- ---------------------------------------------------------------------
-- categorias  (lectura para todos; escritura admin)
-- ---------------------------------------------------------------------
drop policy if exists categorias_read on public.categorias;
create policy categorias_read on public.categorias
  for select to authenticated using (true);

drop policy if exists categorias_admin on public.categorias;
create policy categorias_admin on public.categorias
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------------
-- productos  (lectura para todos; crear/editar solo admin)
-- ---------------------------------------------------------------------
drop policy if exists productos_read on public.productos;
create policy productos_read on public.productos
  for select to authenticated using (true);

drop policy if exists productos_admin on public.productos;
create policy productos_admin on public.productos
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------------
-- ventas / venta_items  (lectura todos; escritura vía RPC. Sin insert/update directo)
-- ---------------------------------------------------------------------
drop policy if exists ventas_read on public.ventas;
create policy ventas_read on public.ventas
  for select to authenticated using (true);

drop policy if exists venta_items_read on public.venta_items;
create policy venta_items_read on public.venta_items
  for select to authenticated using (true);
-- (no hay policies de insert/update/delete: solo las funciones SECURITY DEFINER escriben)

-- ---------------------------------------------------------------------
-- movimientos_inventario  (lectura todos; insert directo solo admin)
-- ---------------------------------------------------------------------
drop policy if exists mov_read on public.movimientos_inventario;
create policy mov_read on public.movimientos_inventario
  for select to authenticated using (true);

drop policy if exists mov_admin_insert on public.movimientos_inventario;
create policy mov_admin_insert on public.movimientos_inventario
  for insert to authenticated with check (public.es_admin());

-- ---------------------------------------------------------------------
-- recordatorios
--   lectura: 'todos' para cualquiera; 'admins' solo admin
--   crear/editar: el creador o admin (avisos de empresa: el app restringe a admin)
-- ---------------------------------------------------------------------
drop policy if exists recordatorios_read on public.recordatorios;
create policy recordatorios_read on public.recordatorios
  for select to authenticated
  using (visible_para = 'todos' or public.es_admin());

drop policy if exists recordatorios_insert on public.recordatorios;
create policy recordatorios_insert on public.recordatorios
  for insert to authenticated
  with check (public.rol_actual() in ('admin','vendedor') and creado_por = auth.uid());

drop policy if exists recordatorios_update on public.recordatorios;
create policy recordatorios_update on public.recordatorios
  for update to authenticated
  using (creado_por = auth.uid() or public.es_admin());

drop policy if exists recordatorios_delete on public.recordatorios;
create policy recordatorios_delete on public.recordatorios
  for delete to authenticated
  using (creado_por = auth.uid() or public.es_admin());

-- ---------------------------------------------------------------------
-- seguimientos  (vendedor y admin gestionan; contador solo lee)
-- ---------------------------------------------------------------------
drop policy if exists seguimientos_read on public.seguimientos;
create policy seguimientos_read on public.seguimientos
  for select to authenticated using (true);

drop policy if exists seguimientos_write on public.seguimientos;
create policy seguimientos_write on public.seguimientos
  for all to authenticated
  using (public.rol_actual() in ('admin','vendedor'))
  with check (public.rol_actual() in ('admin','vendedor'));

drop policy if exists seg_notas_read on public.seguimiento_notas;
create policy seg_notas_read on public.seguimiento_notas
  for select to authenticated using (true);

drop policy if exists seg_notas_write on public.seguimiento_notas;
create policy seg_notas_write on public.seguimiento_notas
  for insert to authenticated
  with check (public.rol_actual() in ('admin','vendedor') and usuario_id = auth.uid());

-- ---------------------------------------------------------------------
-- Permisos de ejecución de las funciones RPC
-- ---------------------------------------------------------------------
grant execute on function public.registrar_venta(jsonb, text, text, numeric, text, boolean) to authenticated;
grant execute on function public.anular_venta(uuid, text)                                     to authenticated;
grant execute on function public.registrar_movimiento(uuid, text, int, text)                  to authenticated;
