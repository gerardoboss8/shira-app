-- =====================================================================
-- Shira App · Inventario Librería Shira — 06/11/2026
-- Fuente: "Inventario_Shira.docx" + respuestas de Gerardo.
--
-- REQUIERE haber corrido antes: migrations/0010_combos_comprobantes.sql
--
--  · Códigos (SKU) nuevos ordenados: BIB-001…, LIT-001…, ORN-001…, OTR-001…
--  · Los productos que ya existían CONSERVAN su historial de ventas y su
--    stock: solo cambian código, nombre, precio, costo y categoría.
--  · Productos nuevos del documento: se crean; los litúrgicos con cantidad
--    en el documento entran con esa cantidad (pedido COT69514).
--  · Ornamentos: solo los 7 del documento. Los 4 antiguos se dan de baja
--    (inactivos, stock a 0, con su historial intacto).
--  · Camisas: pasan a Ornamentos, ordenadas por color y talla.
--    Formales Q225, polo Q175 (blanca, negra, azul).
--  · Combos: Juego de Leccionarios (I+II+III) y los 2 juegos casulla+estola.
--  · "Pedido personalizado" queda con precio libre (monto al vender).
--  · "VENTA POR 1000" y "venta especial" se dan de baja.
--
-- Corre todo o nada (una sola transacción). Si algún producto actual no
-- coincide con lo esperado, se detiene sin cambiar nada.
-- =====================================================================

begin;

do $$
begin
  if exists (select 1 from public.categorias where prefijo = 'ORN') then
    raise exception 'Este inventario ya se aplicó (existe la categoría Ornamentos). No se cambió nada.';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'producto_componentes') then
    raise exception 'Falta correr migrations/0010_combos_comprobantes.sql primero.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Categorías: Ornamentos antes de Otros artículos
-- ---------------------------------------------------------------------
insert into public.categorias (negocio_id, nombre, prefijo, orden)
values ('shira', 'Ornamentos', 'ORN', 3);
update public.categorias set orden = 4 where prefijo = 'OTR';

-- ---------------------------------------------------------------------
-- Mapa: código actual -> código nuevo
--   sku_actual / nombre_actual nulos = producto nuevo
--   costo nulo en un producto existente = se conserva el costo que tenga
-- ---------------------------------------------------------------------
create temp table mapa (
  sku_actual    text,
  nombre_actual text,
  sku_nuevo     text not null,
  prefijo       text not null,
  nombre        text not null,
  grupo         text,
  precio        numeric(10,2) not null,
  costo         numeric(10,2),
  activo        boolean not null default true,
  cantidad      int not null default 0,      -- solo productos nuevos
  precio_libre  boolean not null default false
) on commit drop;

insert into mapa (sku_actual, nombre_actual, sku_nuevo, prefijo, nombre, grupo, precio, costo, activo, cantidad, precio_libre) values
  -- ======================= BIBLIAS =======================
  ('BIB-004', 'Latino Bolsillo Color',                  'BIB-001', 'BIB', 'Biblia Latino pequeña sin uñero',        null, 130.00,  76.00, true, 0, false),
  ('BIB-019', 'Biblia latino bolsillo uñero',           'BIB-002', 'BIB', 'Biblia Latino pequeña con uñero',        null, 150.00, 105.00, true, 0, false),
  ('BIB-003', 'Latino Grande sin Uñero (letra grande)', 'BIB-003', 'BIB', 'Biblia Latino grande sin uñero',         null, 185.00, 132.00, true, 0, false),
  ('BIB-002', 'Latino Grande con Uñero',                'BIB-004', 'BIB', 'Biblia Latino grande con uñero',         null, 250.00, 162.00, true, 0, false),
  ('BIB-012', 'Jerusalén Latino',                       'BIB-005', 'BIB', 'Biblia de Jerusalén Latinoamericana',    null, 250.00, 165.00, true, 0, false),
  (null,      null,                                     'BIB-006', 'BIB', 'Biblia de Jerusalén letra grande',       null, 375.00, 293.00, true, 0, false),
  ('BIB-010', 'Jerusalén 5ta Edición Pasta Suave',      'BIB-007', 'BIB', 'Biblia de Jerusalén 5ta ed. vinil',      'Jerusalén 5ta edición', 375.00, 260.00, true, 0, false),
  ('BIB-011', 'Jerusalén 5ta Edición Pasta Dura',       'BIB-008', 'BIB', 'Biblia de Jerusalén 5ta ed. pasta dura', 'Jerusalén 5ta edición', 400.00, 280.00, true, 0, false),
  ('BIB-017', 'Biblia de Navarra',                      'BIB-009', 'BIB', 'Biblia de Navarra',                      null, 250.00, 188.00, true, 0, false),
  ('BIB-005', 'Jóvenes Católica',                       'BIB-010', 'BIB', 'Biblia Jóvenes',                         null, 250.00, 180.00, true, 0, false),
  -- Biblias que no están en el documento: se quedan igual
  ('BIB-007', 'Jerusalén 5ta Edición con Forro',        'BIB-011', 'BIB', 'Biblia de Jerusalén 5ta ed. con forro',  'Jerusalén 5ta edición', 415.00, null, true, 0, false),
  ('BIB-001', 'Edición Ministro Negra',                 'BIB-012', 'BIB', 'Edición Ministro Negra',                 null, 200.00, null, true, 0, false),
  ('BIB-006', 'Jóvenes Pasta Suave',                    'BIB-013', 'BIB', 'Jóvenes Pasta Suave',                    null, 200.00, null, true, 0, false),
  ('BIB-008', 'Biblia Familia Pasta Dura',              'BIB-014', 'BIB', 'Biblia Familia Pasta Dura',              null, 275.00, null, true, 0, false),
  ('BIB-009', 'Familia Pasta Suave',                    'BIB-015', 'BIB', 'Familia Pasta Suave',                    null, 200.00, null, true, 0, false),
  ('BIB-013', 'Nuestro Pueblo Pequeña',                 'BIB-016', 'BIB', 'Nuestro Pueblo Pequeña',                 null, 130.00, null, true, 0, false),
  ('BIB-014', 'Nuestro Pueblo Grande',                  'BIB-017', 'BIB', 'Nuestro Pueblo Grande',                  null, 190.00, null, true, 0, false),
  ('BIB-015', 'Latino Mediana',                         'BIB-018', 'BIB', 'Latino Mediana',                         null, 160.00, null, true, 0, false),
  ('BIB-016', 'Latino Grande Blanca',                   'BIB-019', 'BIB', 'Latino Grande Blanca',                   null, 185.00, null, true, 0, false),

  -- =================== LIBROS LITÚRGICOS ===================
  ('LIT-009', 'Monaguillos',                            'LIT-001', 'LIT', 'ABC de los Monaguillos',                 null,  100.00,    null, true,  0, false),
  (null,      null,                                     'LIT-002', 'LIT', 'Juego Leccionario I, II y III',          null, 3000.00, 1658.84, true,  0, false),
  ('LIT-006', 'Diurnal',                                'LIT-003', 'LIT', 'Diurnal (con estuche)',                  null,  875.00,    null, true,  0, false),
  (null,      null,                                     'LIT-004', 'LIT', 'Evangeliario',                           null, 4999.00, 2652.06, true,  1, false),
  ('LIT-001', 'Leccionario',                            'LIT-005', 'LIT', 'Leccionario I: Adviento–Pentecostés',    null, 1200.00,  548.84, true,  0, false),
  (null,      null,                                     'LIT-006', 'LIT', 'Leccionario II',                         null, 1200.00,  560.00, true,  0, false),
  (null,      null,                                     'LIT-007', 'LIT', 'Leccionario III',                        null, 1200.00,  550.00, true,  0, false),
  (null,      null,                                     'LIT-008', 'LIT', 'Libro de la Sede',                       null,  995.00,    null, true,  0, false),
  (null,      null,                                     'LIT-009', 'LIT', 'Liturgia de las Horas (ed. popular, letra grande)', null, 250.00, 129.47, true, 2, false),
  (null,      null,                                     'LIT-010', 'LIT', 'Liturgia de las Horas (juego de 4 tomos)', null, 3499.00,  null, true,  0, false),
  ('LIT-011', 'MISAL ROMANO 3RA EDICION',               'LIT-011', 'LIT', 'Misal Romano (3a edición típica)',       null, 1600.00,  973.00, true,  0, false),
  (null,      null,                                     'LIT-012', 'LIT', 'Misas de la Virgen María (2 tomos, con estuche)', null, 1300.00, 665.27, true, 1, false),
  ('LIT-005', 'Oración de los Fieles',                  'LIT-013', 'LIT', 'Oración de los fieles',                  null,  899.00,    null, true,  0, false),
  (null,      null,                                     'LIT-014', 'LIT', 'Plegarias Eucarísticas para la concelebración', null, 350.00, 174.89, true, 35, false),
  (null,      null,                                     'LIT-015', 'LIT', 'Rito de Institución de los Catequistas', null,  225.00,   99.92, true,  5, false),
  (null,      null,                                     'LIT-016', 'LIT', 'Ritual Breve Presbítero Itinerante',     null,    0.00,    null, false, 0, false),
  (null,      null,                                     'LIT-017', 'LIT', 'Ritual de Exequias',                     null,    0.00,    null, false, 0, false),
  (null,      null,                                     'LIT-018', 'LIT', 'Ritual de la Iniciación Cristiana de Adultos', null, 550.00, 307.67, true, 10, false),
  (null,      null,                                     'LIT-019', 'LIT', 'Ritual de la Penitencia',                null,  460.00,  232.19, true, 10, false),
  (null,      null,                                     'LIT-020', 'LIT', 'Ritual de la Sagrada Comunión y del Culto Eucarístico fuera de la Misa', null, 350.00, null, true, 0, false),
  ('LIT-003', 'Matrimonio',                             'LIT-021', 'LIT', 'Ritual del Matrimonio',                  null,  460.00,  237.49, true,  0, false),
  ('LIT-002', 'Bautismo de Niños',                      'LIT-022', 'LIT', 'Ritual para el Bautismo de los Niños',   null,  499.00,    null, true,  0, false),
  (null,      null,                                     'LIT-023', 'LIT', 'Ritual para la Confirmación',            null,  390.00,    null, true,  0, false),
  (null,      null,                                     'LIT-024', 'LIT', 'Ritual para la Unción de los Enfermos',  null,  425.00,  223.21, true,  3, false),
  (null,      null,                                     'LIT-025', 'LIT', 'Ritual para la Vida Consagrada',         null,  350.00,  153.31, true,  3, false),
  ('LIT-004', 'Roguemos al Señor',                      'LIT-026', 'LIT', 'Roguemos al Señor (plegaria de los fieles)', null, 399.00, null, true, 0, false),
  ('LIT-007', 'Semana Santa',                           'LIT-027', 'LIT', 'Semana Santa (textos del sacerdote)',    null,  470.00,  249.62, true,  0, false),
  (null,      null,                                     'LIT-028', 'LIT', 'Separadores bíblicos autoadheribles',    null,   30.00,   13.74, true, 10, false),
  -- Litúrgicos que no están en el documento: se quedan igual
  ('LIT-008', 'Copón y Cáliz',                          'LIT-029', 'LIT', 'Copón y Cáliz',                          null, 6000.00,    null, true,  0, false),
  ('LIT-010', 'Para llevar Comunión',                   'LIT-030', 'LIT', 'Para llevar Comunión',                   null,   50.00,    null, true,  0, false),

  -- ======================= ORNAMENTOS =======================
  (null, null, 'ORN-001', 'ORN', 'Casulla de lino sencilla (galón)',             null, 700.00, 275.00, true, 0, false),
  (null, null, 'ORN-002', 'ORN', 'Estola sencilla (brocado)',                    null, 200.00, 125.00, true, 0, false),
  (null, null, 'ORN-003', 'ORN', 'Juego casulla + estola sencilla',              null, 800.00, 400.00, true, 0, false),
  (null, null, 'ORN-004', 'ORN', 'Casulla de lino bordada',                      null, 800.00, 375.00, true, 0, false),
  (null, null, 'ORN-005', 'ORN', 'Estola bordada',                               null, 250.00, 150.00, true, 0, false),
  (null, null, 'ORN-006', 'ORN', 'Juego casulla + estola bordada (caja de regalo)', null, 900.00, 525.00, true, 0, false),
  (null, null, 'ORN-007', 'ORN', 'Alba',                                         null, 450.00, 195.00, true, 0, false),
  -- Camisas formales: blanca, negra, azul · manga larga, manga corta · S, M, L, XL
  ('OTR-006', 'Camisa manga larga S blanca',  'ORN-008', 'ORN', 'Camisa formal blanca manga larga S',  'Camisas formales', 225.00, 125.00, true, 0, false),
  ('OTR-008', 'Camisa manga larga M blanca',  'ORN-009', 'ORN', 'Camisa formal blanca manga larga M',  'Camisas formales', 225.00, 125.00, true, 0, false),
  ('OTR-011', 'Camisa manga larga L blanca',  'ORN-010', 'ORN', 'Camisa formal blanca manga larga L',  'Camisas formales', 225.00, 125.00, true, 0, false),
  ('OTR-014', 'Camisa manga larga XL blanca', 'ORN-011', 'ORN', 'Camisa formal blanca manga larga XL', 'Camisas formales', 225.00, 125.00, true, 0, false),
  ('OTR-017', 'Camisa manga corta S blanca',  'ORN-012', 'ORN', 'Camisa formal blanca manga corta S',  'Camisas formales', 225.00, 125.00, true, 0, false),
  ('OTR-018', 'Camisa manga corta M blanca',  'ORN-013', 'ORN', 'Camisa formal blanca manga corta M',  'Camisas formales', 225.00, 125.00, true, 0, false),
  ('OTR-020', 'Camisa manga corta L blanca',  'ORN-014', 'ORN', 'Camisa formal blanca manga corta L',  'Camisas formales', 225.00, 125.00, true, 0, false),
  ('OTR-010', 'Camisa manga larga M negra',   'ORN-015', 'ORN', 'Camisa formal negra manga larga M',   'Camisas formales', 225.00, 125.00, true, 0, false),
  ('OTR-013', 'Camisa manga larga L negra',   'ORN-016', 'ORN', 'Camisa formal negra manga larga L',   'Camisas formales', 225.00, 125.00, true, 0, false),
  ('OTR-016', 'Camisa manga larga XL negra',  'ORN-017', 'ORN', 'Camisa formal negra manga larga XL',  'Camisas formales', 225.00, 125.00, true, 0, false),
  ('OTR-007', 'Camisa manga larga S azul',    'ORN-018', 'ORN', 'Camisa formal azul manga larga S',    'Camisas formales', 225.00, 125.00, true, 0, false),
  ('OTR-009', 'Camisa manga larga M azul',    'ORN-019', 'ORN', 'Camisa formal azul manga larga M',    'Camisas formales', 225.00, 125.00, true, 0, false),
  ('OTR-012', 'Camisa manga larga L azul',    'ORN-020', 'ORN', 'Camisa formal azul manga larga L',    'Camisas formales', 225.00, 125.00, true, 0, false),
  ('OTR-015', 'Camisa manga larga XL azul',   'ORN-021', 'ORN', 'Camisa formal azul manga larga XL',   'Camisas formales', 225.00, 125.00, true, 0, false),
  ('OTR-019', 'Camisa manga corta M azul',    'ORN-022', 'ORN', 'Camisa formal azul manga corta M',    'Camisas formales', 225.00, 125.00, true, 0, false),
  ('OTR-021', 'Camisa manga corta L azul',    'ORN-023', 'ORN', 'Camisa formal azul manga corta L',    'Camisas formales', 225.00, 125.00, true, 0, false),
  -- Camisas polo: blanca, negra, azul
  (null,      null,                           'ORN-024', 'ORN', 'Camisa polo blanca (S–XL)',            'Camisas polo', 175.00, 75.00, true, 0, false),
  ('BIB-018', 'Camisa Polo NEGRA (S-XL)',     'ORN-025', 'ORN', 'Camisa polo negra (S–XL)',             'Camisas polo', 175.00, 75.00, true, 0, false),
  ('OTR-022', 'Camisa Polo azul (S-XL)',      'ORN-026', 'ORN', 'Camisa polo azul (S–XL)',              'Camisas polo', 175.00, 75.00, true, 0, false),

  -- =================== OTROS ARTÍCULOS ===================
  ('OTR-001', 'Rosario',                            'OTR-001', 'OTR', 'Rosario',               null,    5.00,  null, true, 0, false),
  ('OTR-005', 'Porta Viático',                      'OTR-002', 'OTR', 'Porta Viático',         null,  200.00,  null, true, 0, false),
  ('OTR-025', 'agenda parroquial',                  'OTR-003', 'OTR', 'Agenda parroquial',     null,  140.00, 72.06, true, 0, false),
  ('OTR-027', 'agenda de la mujer',                 'OTR-004', 'OTR', 'Agenda de la mujer',    null,   55.00, 22.39, true, 0, false),
  ('OTR-026', 'misal anual',                        'OTR-005', 'OTR', 'Misal anual 2027',      null,   45.00, 23.44, true, 0, false),
  ('OTR-028', 'PEDIDO PERSONALIZADO FUERA DE MENU', 'OTR-006', 'OTR', 'Pedido personalizado',  null,    0.00,  null, true, 0, true),

  -- ======================= DE BAJA =======================
  -- (inactivos, stock a 0; conservan su historial de ventas)
  ('BIB-020', 'VENTA POR 1000',                 'BAJA-001', 'BIB', 'VENTA POR 1000 (baja)',                null, 1000.00, null, false, 0, false),
  ('LIT-012', 'venta especial',                 'BAJA-002', 'LIT', 'Venta especial (baja)',                null, 10000.00, null, false, 0, false),
  ('OTR-023', 'Casulla',                        'BAJA-003', 'ORN', 'Casulla (antigua)',                    null,  575.00, null, false, 0, false),
  ('OTR-024', 'Estola',                         'BAJA-004', 'ORN', 'Estola (antigua)',                     null,  175.00, null, false, 0, false),
  ('OTR-029', 'JUEGO CASULLA Y ESTOLA LINO',    'BAJA-005', 'ORN', 'Juego casulla y estola lino (antiguo)', null, 900.00, null, false, 0, false),
  ('OTR-030', 'JUEGO CASULLA Y ESTOLA GALON',   'BAJA-006', 'ORN', 'Juego casulla y estola galón (antiguo)', null, 700.00, null, false, 0, false),
  ('OTR-002', 'Camisa talla L',                 'BAJA-007', 'OTR', 'Camisa talla L (antigua)',             null,  175.00, null, false, 0, false),
  ('OTR-003', 'Camisa talla XL',                'BAJA-008', 'OTR', 'Camisa talla XL (antigua)',            null,  200.00, null, false, 0, false),
  ('OTR-004', 'Camisa talla M',                 'BAJA-009', 'OTR', 'Camisa talla M (antigua)',             null,  175.00, null, false, 0, false);

-- ---------------------------------------------------------------------
-- 1) Verificación: cada producto actual debe existir con el nombre esperado
-- ---------------------------------------------------------------------
do $$
declare
  v_faltan text;
begin
  select string_agg(m.sku_actual || ' (' || m.nombre_actual || ')', ', ')
    into v_faltan
    from mapa m
   where m.sku_actual is not null
     and not exists (select 1 from public.productos p
                      where p.sku = m.sku_actual
                        and p.negocio_id = 'shira'
                        and p.nombre = m.nombre_actual);
  if v_faltan is not null then
    raise exception 'No coinciden estos productos actuales; no se cambió nada: %', v_faltan;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) Códigos temporales (evita choques al intercambiar códigos)
-- ---------------------------------------------------------------------
update public.productos p
   set sku = 'TMP:' || m.sku_actual
  from mapa m
 where m.sku_actual is not null and p.sku = m.sku_actual and p.negocio_id = 'shira';

-- ---------------------------------------------------------------------
-- 3) Productos existentes: código, nombre, categoría, precio, costo
-- ---------------------------------------------------------------------
update public.productos p
   set sku          = m.sku_nuevo,
       nombre       = m.nombre,
       grupo        = m.grupo,
       categoria_id = c.id,
       precio_venta = m.precio,
       costo        = coalesce(m.costo, p.costo),
       activo       = m.activo,
       precio_libre = m.precio_libre
  from mapa m
  join public.categorias c on c.prefijo = m.prefijo
 where m.sku_actual is not null and p.sku = 'TMP:' || m.sku_actual;

-- ---------------------------------------------------------------------
-- 4) Productos nuevos
-- ---------------------------------------------------------------------
insert into public.productos (categoria_id, nombre, sku, precio_venta, costo, grupo, activo, precio_libre)
select c.id, m.nombre, m.sku_nuevo, m.precio, m.costo, m.grupo, m.activo, m.precio_libre
  from mapa m
  join public.categorias c on c.prefijo = m.prefijo
 where m.sku_actual is null;

-- Cantidad del documento como entrada auditada
insert into public.movimientos_inventario (producto_id, tipo, cantidad, nota)
select p.id, 'entrada', m.cantidad, 'Inventario 06/11/2026 (pedido COT69514)'
  from mapa m
  join public.productos p on p.sku = m.sku_nuevo
 where m.sku_actual is null and m.cantidad > 0;

-- ---------------------------------------------------------------------
-- 5) De baja y precio libre: stock a 0 con ajuste auditado
-- ---------------------------------------------------------------------
insert into public.movimientos_inventario (producto_id, tipo, cantidad, nota)
select p.id, 'ajuste', -p.stock, 'Inventario 06/11/2026: producto dado de baja / sin stock propio'
  from mapa m
  join public.productos p on p.sku = m.sku_nuevo
 where (not m.activo or m.precio_libre) and p.stock <> 0;

-- ---------------------------------------------------------------------
-- 6) Combos
-- ---------------------------------------------------------------------
insert into public.producto_componentes (producto_id, componente_id, cantidad)
select combo.id, pieza.id, 1
  from (values
    ('LIT-002', 'LIT-005'), ('LIT-002', 'LIT-006'), ('LIT-002', 'LIT-007'),
    ('ORN-003', 'ORN-001'), ('ORN-003', 'ORN-002'),
    ('ORN-006', 'ORN-004'), ('ORN-006', 'ORN-005')
  ) as k(sku_combo, sku_pieza)
  join public.productos combo on combo.sku = k.sku_combo
  join public.productos pieza on pieza.sku = k.sku_pieza;

commit;

-- Revisión rápida del resultado
select p.sku, p.nombre, coalesce(p.grupo, '') as grupo, c.nombre as categoria,
       p.precio_venta, p.costo, p.stock, p.activo
  from public.productos p
  join public.categorias c on c.id = p.categoria_id
 where p.negocio_id = 'shira'
 order by c.orden, p.sku;
