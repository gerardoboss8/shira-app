-- =====================================================================
-- Shira App · Actualización de inventario — 05/08/2026
-- Fuente: "actualización de inventario.xlsx" (conteo físico).
--
-- Requiere haber corrido antes: migrations/0006_grupo_producto.sql
--
-- Reglas aplicadas:
--   · Las cantidades del Excel son CONTEO FÍSICO: el stock queda
--     exactamente en ese número, con un movimiento de 'ajuste' que deja
--     la diferencia auditada (nunca se toca productos.stock a mano).
--   · Los productos que NO vienen en el Excel se dejan intactos.
--   · Las camisas pasan a ser 16 variantes dentro de "Otros artículos",
--     agrupadas con grupo = 'Camisas'; las 3 camisas genéricas viejas se
--     dejan en 0 y se quitan (soft-delete, conserva su historial).
--
-- Es idempotente: se puede correr dos veces sin duplicar ni descuadrar.
-- =====================================================================

-- Red de seguridad por si se corre sin la migración 0006
alter table public.productos add column if not exists grupo text;

-- ---------------------------------------------------------------------
-- 1) Productos que YA existen: nombre del Excel, precio y conteo físico
--    (se localizan por SKU, que nunca cambia)
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_nota text := 'Actualización de inventario 05/08/2026';
begin
  for r in
    select * from (values
      -- Biblias
      ('BIB-001', 'Edición Ministro Negra',                 200.00,  1),
      ('BIB-002', 'Latino Grande con Uñero',                250.00, 13),
      ('BIB-003', 'Latino Grande sin Uñero (letra grande)', 185.00, 63),
      ('BIB-004', 'Latino Bolsillo Color',                  130.00, 50),
      ('BIB-005', 'Jóvenes Católica',                       250.00, 29),
      ('BIB-006', 'Jóvenes Pasta Suave',                    200.00,  1),
      ('BIB-007', 'Jerusalén 5ta Edición con Forro',        415.00,  2),
      ('BIB-008', 'Biblia Familia Pasta Dura',              275.00,  2),
      ('BIB-010', 'Jerusalén 5ta Edición Pasta Suave',      375.00, 17),
      ('BIB-011', 'Jerusalén 5ta Edición Pasta Dura',       400.00,  4),
      ('BIB-012', 'Jerusalén Latino',                       250.00,  9),
      ('BIB-013', 'Nuestro Pueblo Pequeña',                 130.00,  7),
      ('BIB-014', 'Nuestro Pueblo Grande',                  190.00,  1),
      ('BIB-015', 'Latino Mediana',                         160.00, 26),
      -- Libros litúrgicos
      ('LIT-002', 'Bautismo de Niños',                      470.00,  3),
      ('LIT-003', 'Matrimonio',                             460.00, 15),
      ('LIT-004', 'Roguemos al Señor',                      400.00,  7),
      ('LIT-006', 'Diurnal',                                875.00,  1),
      ('LIT-007', 'Semana Santa',                           470.00,  7)
    ) as t(sku, nombre, precio, cantidad)
  loop
    -- Nombre y precio según el Excel
    update public.productos
       set nombre = r.nombre,
           precio_venta = r.precio,
           activo = true
     where sku = r.sku;

    if not found then
      raise notice 'OJO: no existe el SKU % (%). No se actualizó.', r.sku, r.nombre;
      continue;
    end if;

    -- Ajuste hasta dejar el stock igual al conteo físico
    insert into public.movimientos_inventario (producto_id, tipo, cantidad, nota)
    select p.id, 'ajuste', r.cantidad - p.stock, v_nota
      from public.productos p
     where p.sku = r.sku
       and p.stock <> r.cantidad;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2) Productos NUEVOS del Excel (SKU correlativo automático por categoría)
--    Si ya existiera uno con el mismo nombre, se actualiza en vez de duplicar.
-- ---------------------------------------------------------------------
do $$
declare
  r          record;
  v_cat      uuid;
  v_next     int;
  v_sku      text;
  v_id       uuid;
  v_existente uuid;
  v_nota     text := 'Actualización de inventario 05/08/2026';
begin
  for r in
    select * from (values
      -- prefijo, nombre, precio, cantidad, grupo (subcategoría), alerta de stock bajo
      ('BIB', 'Latino Grande Blanca',         185.00, 32, null::text, 2),
      ('LIT', 'Para llevar Comunión',          50.00,  4, null::text, 2),
      ('OTR', 'Porta Viático',                200.00,  1, null::text, 2),
      -- Camisas (subcategoría "Camisas" dentro de Otros artículos).
      -- Alerta en 1: con 1–2 unidades por variante, el umbral normal de 2
      -- dejaría todo el grupo marcado en rojo todo el tiempo.
      ('OTR', 'Camisa manga larga S blanca',  200.00,  1, 'Camisas',   1),
      ('OTR', 'Camisa manga larga S azul',    200.00,  1, 'Camisas',   1),
      ('OTR', 'Camisa manga larga M blanca',  200.00,  2, 'Camisas',   1),
      ('OTR', 'Camisa manga larga M azul',    200.00,  2, 'Camisas',   1),
      ('OTR', 'Camisa manga larga M negra',   200.00,  2, 'Camisas',   1),
      ('OTR', 'Camisa manga larga L blanca',  200.00,  2, 'Camisas',   1),
      ('OTR', 'Camisa manga larga L azul',    200.00,  2, 'Camisas',   1),
      ('OTR', 'Camisa manga larga L negra',   200.00,  2, 'Camisas',   1),
      ('OTR', 'Camisa manga larga XL blanca', 225.00,  1, 'Camisas',   1),
      ('OTR', 'Camisa manga larga XL azul',   225.00,  2, 'Camisas',   1),
      ('OTR', 'Camisa manga larga XL negra',  225.00,  2, 'Camisas',   1),
      ('OTR', 'Camisa manga corta S blanca',  200.00,  2, 'Camisas',   1),
      ('OTR', 'Camisa manga corta M blanca',  200.00,  2, 'Camisas',   1),
      ('OTR', 'Camisa manga corta M azul',    200.00,  1, 'Camisas',   1),
      ('OTR', 'Camisa manga corta L blanca',  200.00,  1, 'Camisas',   1),
      ('OTR', 'Camisa manga corta L azul',    200.00,  1, 'Camisas',   1)
    ) as t(prefijo, nombre, precio, cantidad, grupo, minimo)
  loop
    select id into v_cat from public.categorias where prefijo = r.prefijo;
    if v_cat is null then
      raise exception 'No existe la categoría con prefijo %.', r.prefijo;
    end if;

    -- ¿Ya existe por nombre? (para poder volver a correr el script)
    select id into v_existente
      from public.productos
     where lower(nombre) = lower(r.nombre)
     limit 1;

    if v_existente is not null then
      update public.productos
         set categoria_id = v_cat,
             precio_venta = r.precio,
             grupo        = r.grupo,
             stock_minimo = r.minimo,
             activo       = true
       where id = v_existente;

      insert into public.movimientos_inventario (producto_id, tipo, cantidad, nota)
      select p.id, 'ajuste', r.cantidad - p.stock, v_nota
        from public.productos p
       where p.id = v_existente
         and p.stock <> r.cantidad;
      continue;
    end if;

    -- SKU correlativo (misma lógica que la función crear_producto)
    perform pg_advisory_xact_lock(hashtext(r.prefijo));

    select coalesce(max((regexp_replace(sku, '^' || r.prefijo || '-', ''))::int), 0) + 1
      into v_next
      from public.productos
     where sku ~ ('^' || r.prefijo || '-[0-9]+$');

    v_sku := r.prefijo || '-' || lpad(v_next::text, 3, '0');

    insert into public.productos (categoria_id, nombre, sku, precio_venta, grupo, stock_minimo)
    values (v_cat, r.nombre, v_sku, r.precio, r.grupo, r.minimo)
    returning id into v_id;

    if r.cantidad > 0 then
      insert into public.movimientos_inventario (producto_id, tipo, cantidad, nota)
      values (v_id, 'entrada', r.cantidad, v_nota);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3) Camisas genéricas viejas: se dejan en 0 y se quitan del inventario
--    (soft-delete; sus ventas y movimientos anteriores se conservan)
-- ---------------------------------------------------------------------
insert into public.movimientos_inventario (producto_id, tipo, cantidad, nota)
select id, 'ajuste', -stock, 'Reemplazadas por las variantes de camisa (05/08/2026)'
  from public.productos
 where sku in ('OTR-002', 'OTR-003', 'OTR-004')
   and stock <> 0;

update public.productos
   set activo = false
 where sku in ('OTR-002', 'OTR-003', 'OTR-004');

-- ---------------------------------------------------------------------
-- 4) Resultado (para revisar)
-- ---------------------------------------------------------------------
select c.nombre                                        as categoria,
       coalesce(p.grupo, '—')                          as subcategoria,
       p.sku,
       p.nombre,
       p.precio_venta,
       p.stock,
       case when p.activo then 'activo' else 'QUITADO' end as estado
  from public.productos p
  join public.categorias c on c.id = p.categoria_id
 order by c.orden, p.grupo nulls first, p.sku;
