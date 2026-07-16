-- =====================================================================
-- Shira App · 0004_gastos.sql
-- Gastos y compras (registro de dinero que sale). No afecta inventario.
-- Ver/registrar: admin y vendedor. Lectura además para contador (reportes).
-- =====================================================================

create table if not exists public.gastos (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null default (now() at time zone 'America/Guatemala')::date,
  tipo           text not null check (tipo in ('gasto','compra')),
  categoria      text not null,
  proveedor      text,
  descripcion    text,
  monto          numeric(10,2) not null check (monto > 0),
  metodo_pago    text not null default 'efectivo'
                 check (metodo_pago in ('efectivo','tarjeta','transferencia','otro')),
  registrado_por uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
create index if not exists idx_gastos_fecha on public.gastos(fecha desc);
create index if not exists idx_gastos_tipo  on public.gastos(tipo);

alter table public.gastos enable row level security;

drop policy if exists gastos_read on public.gastos;
create policy gastos_read on public.gastos
  for select to authenticated
  using (public.rol_actual() in ('admin','vendedor','contador'));

drop policy if exists gastos_insert on public.gastos;
create policy gastos_insert on public.gastos
  for insert to authenticated
  with check (
    public.rol_actual() in ('admin','vendedor')
    and registrado_por = auth.uid()
  );

drop policy if exists gastos_update on public.gastos;
create policy gastos_update on public.gastos
  for update to authenticated
  using (registrado_por = auth.uid() or public.es_admin())
  with check (registrado_por = auth.uid() or public.es_admin());

drop policy if exists gastos_delete on public.gastos;
create policy gastos_delete on public.gastos
  for delete to authenticated
  using (registrado_por = auth.uid() or public.es_admin());
