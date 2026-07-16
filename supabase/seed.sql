-- =====================================================================
-- Shira App · seed.sql
-- Inventario inicial confirmado (17/06/2026): 28 renglones, 828 u,
-- Q 83,705.00 a precio de venta. + fechas importantes litúrgicas.
-- Idempotente: se puede correr varias veces sin duplicar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Categorías
-- ---------------------------------------------------------------------
insert into public.categorias (nombre, prefijo, orden) values
  ('Biblias',            'BIB', 1),
  ('Libros litúrgicos',  'LIT', 2),
  ('Otros artículos',    'OTR', 3)
on conflict (prefijo) do nothing;

-- ---------------------------------------------------------------------
-- Productos (stock inicia en 0; lo fija el movimiento de entrada)
-- ---------------------------------------------------------------------
insert into public.productos (categoria_id, nombre, sku, precio_venta)
select c.id, d.nombre, d.sku, d.precio
from (values
  -- Biblias
  ('BIB','Latino Vinil',            'BIB-001', 200.00),
  ('BIB','Latino con Uñero',        'BIB-002', 250.00),
  ('BIB','Latino Letra Grande',     'BIB-003', 185.00),
  ('BIB','Latino Pequeña',          'BIB-004', 135.00),
  ('BIB','Jóvenes',                 'BIB-005', 250.00),
  ('BIB','Jóvenes Pasta Suave',     'BIB-006', 200.00),
  ('BIB','Jerusalén con Forro',     'BIB-007', 425.00),
  ('BIB','Familia Pasta Dura',      'BIB-008', 250.00),
  ('BIB','Familia Pasta Suave',     'BIB-009', 200.00),
  ('BIB','Jerusalén Pasta Suave',   'BIB-010', 375.00),
  ('BIB','Jerusalén Pasta Dura',    'BIB-011', 400.00),
  ('BIB','Jerusalén Latino',        'BIB-012', 250.00),
  ('BIB','Nuestro Pueblo Pequeña',  'BIB-013', 130.00),
  ('BIB','Nuestro Pueblo Grande',   'BIB-014', 190.00),
  ('BIB','Latino Normal',           'BIB-015', 160.00),
  -- Libros litúrgicos
  ('LIT','Leccionario',             'LIT-001', 1000.00),
  ('LIT','Bautismo de Niños',       'LIT-002', 470.00),
  ('LIT','Matrimonio',              'LIT-003', 460.00),
  ('LIT','Roguemos al Señor',       'LIT-004', 400.00),
  ('LIT','Oración de los Fieles',   'LIT-005', 900.00),
  ('LIT','Diurnal',                 'LIT-006', 875.00),
  ('LIT','Semana Santa',            'LIT-007', 470.00),
  ('LIT','Copón y Cáliz',           'LIT-008', 6000.00),
  ('LIT','Monaguillos',             'LIT-009', 75.00),
  -- Otros artículos
  ('OTR','Rosario',                 'OTR-001', 5.00),
  ('OTR','Camisa talla L',          'OTR-002', 175.00),
  ('OTR','Camisa talla XL',         'OTR-003', 200.00),
  ('OTR','Camisa talla M',          'OTR-004', 175.00)
) as d(prefijo, nombre, sku, precio)
join public.categorias c on c.prefijo = d.prefijo
on conflict (sku) do nothing;

-- ---------------------------------------------------------------------
-- Movimiento de entrada "Inventario inicial" por producto (auditado)
-- ---------------------------------------------------------------------
insert into public.movimientos_inventario (producto_id, tipo, cantidad, nota)
select p.id, 'entrada', d.cant, 'Inventario inicial 17/06/2026'
from (values
  ('BIB-001',6),('BIB-002',20),('BIB-003',127),('BIB-004',43),('BIB-005',28),
  ('BIB-006',1),('BIB-007',2),('BIB-008',2),('BIB-009',1),('BIB-010',17),
  ('BIB-011',8),('BIB-012',21),('BIB-013',7),('BIB-014',1),('BIB-015',1),
  ('LIT-001',1),('LIT-002',4),('LIT-003',5),('LIT-004',3),('LIT-005',1),
  ('LIT-006',1),('LIT-007',7),('LIT-008',1),('LIT-009',1),
  ('OTR-001',500),('OTR-002',12),('OTR-003',1),('OTR-004',6)
) as d(sku, cant)
join public.productos p on p.sku = d.sku
where not exists (
  select 1 from public.movimientos_inventario m
  where m.producto_id = p.id
    and m.tipo = 'entrada'
    and m.nota = 'Inventario inicial 17/06/2026'
);

-- ---------------------------------------------------------------------
-- Fechas importantes (litúrgicas y comerciales)
--   Fijas -> recurrente 'anual'.  Movibles -> se carga la del año 2026.
-- ---------------------------------------------------------------------
insert into public.recordatorios (titulo, descripcion, tipo, fecha, recurrente, visible_para)
select v.titulo, v.descripcion, 'fecha_importante', v.fecha::date, v.recurrente, v.visible_para
from (values
  ('Mes de la Biblia',              'Temporada de alta venta de biblias.',              '2026-09-01', 'anual', 'todos'),
  ('Día de la Virgen de Guadalupe', 'Alta demanda de artículos religiosos.',            '2026-12-12', 'anual', 'todos'),
  ('Navidad',                       'Temporada alta comercial.',                        '2026-12-25', 'anual', 'todos'),
  ('Inicio de Adviento',            'Comienza la temporada de Adviento (fecha 2026).',  '2026-11-29', null,    'todos'),
  ('Miércoles de Ceniza',           'Inicio de Cuaresma (fecha 2026, varía cada año).', '2026-02-18', null,    'todos'),
  ('Domingo de Ramos',              'Inicio de Semana Santa (fecha 2026).',             '2026-03-29', null,    'todos'),
  ('Semana Santa',                  'Temporada alta de libros litúrgicos (2026).',      '2026-04-02', null,    'todos'),
  ('Corpus Christi',                'Fecha litúrgica 2026 (varía cada año).',           '2026-06-07', null,    'todos'),
  ('Primeras Comuniones y Confirmaciones', 'Temporada mayo–octubre.',                   '2026-05-01', 'anual', 'todos'),
  ('Declaración y pago de IVA',     'Recordatorio mensual para los socios.',            '2026-07-31', null,    'admins')
) as v(titulo, descripcion, fecha, recurrente, visible_para)
where not exists (
  select 1 from public.recordatorios r
  where r.titulo = v.titulo and r.tipo = 'fecha_importante'
);
