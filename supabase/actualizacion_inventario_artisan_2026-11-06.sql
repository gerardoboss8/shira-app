-- =====================================================================
-- Shira App · Catálogo Artisan — 06/11/2026
-- Fuente: catálogos PDF Cantel 2026 v4, Jacquard v6 y Lino.
--
-- REQUIERE: migrations/0010_combos_comprobantes.sql (ya corrida).
--
--  · 83 productos con su PRECIO DE VENTA de catálogo (precio al público).
--  · Los 15 manteles provisionales (CAN/LIN/JAC-001…005, en Q0) se
--    convierten en los manteles rectangulares de 4 a 12 personas.
--  · Medidas "a cotizar" (Cantel cuadrado/redondo y medidas especiales):
--    producto de precio libre por línea, el monto se escribe al vender.
--  · Costos: vacíos (los catálogos no los traen).
--  · Stock: queda en 0 (se carga con "Mover inventario").
--
-- Si Artisan ya tiene productos distintos a los 15 provisionales, se
-- detiene sin cambiar nada.
-- =====================================================================

begin;

do $$
declare
  v_otros text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'productos'
                    and column_name = 'precio_libre') then
    raise exception 'Falta correr migrations/0010_combos_comprobantes.sql primero.';
  end if;
  select string_agg(sku || ' (' || nombre || ')', ', ') into v_otros
    from public.productos
   where negocio_id = 'artisan'
     and sku not in ('CAN-001','CAN-002','CAN-003','CAN-004','CAN-005',
                     'LIN-001','LIN-002','LIN-003','LIN-004','LIN-005',
                     'JAC-001','JAC-002','JAC-003','JAC-004','JAC-005');
  if v_otros is not null then
    raise exception 'Artisan ya tiene otros productos; revisar antes de aplicar: %', v_otros;
  end if;
end $$;

insert into public.productos (categoria_id, sku, nombre, grupo, precio_venta, precio_libre, activo)
select c.id, d.sku, d.nombre, d.grupo, d.precio, d.libre, true
  from (values
  ('CAN-001', 'CAN', 'Mantel Cantel 4 personas (143 × 137 cm)', 'Manteles', 125.00, false),
  ('CAN-002', 'CAN', 'Mantel Cantel 6 personas (143 × 228 cm)', 'Manteles', 140.00, false),
  ('CAN-003', 'CAN', 'Mantel Cantel 8 personas (143 × 274 cm)', 'Manteles', 160.00, false),
  ('CAN-004', 'CAN', 'Mantel Cantel 10 personas (143 × 320 cm)', 'Manteles', 190.00, false),
  ('CAN-005', 'CAN', 'Mantel Cantel 12 personas (143 × 366 cm)', 'Manteles', 220.00, false),
  ('CAN-006', 'CAN', 'Mantel Cantel 14 personas (143 × 411 cm)', 'Manteles', 250.00, false),
  ('CAN-007', 'CAN', 'Mantel Cantel a la medida (cuadrado / redondo, cotizado)', 'Manteles', 0.00, true),
  ('CAN-008', 'CAN', 'Camino de mesa Cantel 4 personas (40 × 137 cm)', 'Caminos de mesa', 60.00, false),
  ('CAN-009', 'CAN', 'Camino de mesa Cantel 6 personas (40 × 228 cm)', 'Caminos de mesa', 85.00, false),
  ('CAN-010', 'CAN', 'Camino de mesa Cantel 8 personas (40 × 274 cm)', 'Caminos de mesa', 95.00, false),
  ('CAN-011', 'CAN', 'Camino de mesa Cantel 10 personas (40 × 320 cm)', 'Caminos de mesa', 105.00, false),
  ('CAN-012', 'CAN', 'Camino de mesa Cantel 12 personas (40 × 366 cm)', 'Caminos de mesa', 115.00, false),
  ('CAN-013', 'CAN', 'Camino de mesa Cantel 14 personas (40 × 411 cm)', 'Caminos de mesa', 125.00, false),
  ('CAN-014', 'CAN', 'Servilleta panera Cantel (44 × 34 cm) · 1 unidad', 'Paneras', 20.00, false),
  ('CAN-015', 'CAN', 'Servilleta panera Cantel (44 × 34 cm) · 6 unidades', 'Paneras', 100.00, false),
  ('CAN-016', 'CAN', 'Servilleta baguetera Cantel (44 × 70 cm) · 1 unidad', 'Baguetera', 35.00, false),
  ('CAN-017', 'CAN', 'Servilleta baguetera Cantel (44 × 70 cm) · 6 unidades', 'Baguetera', 175.00, false),
  ('CAN-018', 'CAN', 'Tortillera Cantel (22 × 18 cm)', 'Tortilleras', 35.00, false),
  ('CAN-019', 'CAN', 'Juego panera + baguetera + tortillera Cantel', null, 80.00, false),
  ('CAN-020', 'CAN', 'Servilletas de mesa Cantel (45 × 45 cm) · 2 unidades', 'Servilletas', 30.00, false),
  ('CAN-021', 'CAN', 'Gabacha de peto Cantel adulto (70 × 85 cm)', 'Gabachas', 85.00, false),
  ('CAN-022', 'CAN', 'Gabacha de peto Cantel niño (48 × 60 cm)', 'Gabachas', 60.00, false),
  ('LIN-001', 'LIN', 'Mantel de lino 4 personas (140 × 132 cm)', 'Manteles', 150.00, false),
  ('LIN-002', 'LIN', 'Mantel de lino 6 personas (140 × 224 cm)', 'Manteles', 175.00, false),
  ('LIN-003', 'LIN', 'Mantel de lino 8 personas (140 × 270 cm)', 'Manteles', 200.00, false),
  ('LIN-004', 'LIN', 'Mantel de lino 10 personas (140 × 315 cm)', 'Manteles', 250.00, false),
  ('LIN-005', 'LIN', 'Mantel de lino 12 personas (140 × 360 cm)', 'Manteles', 285.00, false),
  ('LIN-006', 'LIN', 'Mantel de lino 14 personas (140 × 405 cm)', 'Manteles', 310.00, false),
  ('LIN-007', 'LIN', 'Camino de mesa de lino 4 personas (40 × 137 cm)', 'Caminos de mesa', 100.00, false),
  ('LIN-008', 'LIN', 'Camino de mesa de lino 6 personas (40 × 228 cm)', 'Caminos de mesa', 115.00, false),
  ('LIN-009', 'LIN', 'Camino de mesa de lino 8 personas (40 × 274 cm)', 'Caminos de mesa', 125.00, false),
  ('LIN-010', 'LIN', 'Camino de mesa de lino 10 personas (40 × 320 cm)', 'Caminos de mesa', 140.00, false),
  ('LIN-011', 'LIN', 'Camino de mesa de lino 12 personas (40 × 366 cm)', 'Caminos de mesa', 150.00, false),
  ('LIN-012', 'LIN', 'Camino de mesa de lino 14 personas (40 × 411 cm)', 'Caminos de mesa', 165.00, false),
  ('LIN-013', 'LIN', 'Servilletas de lino (44 × 44 cm) · juego de 4', 'Servilletas', 100.00, false),
  ('LIN-014', 'LIN', 'Servilletas de lino (44 × 44 cm) · juego de 6', 'Servilletas', 125.00, false),
  ('LIN-015', 'LIN', 'Mesa de lino 4 personas (mantel + camino + 4 servilletas)', 'Mesa de lino (colección)', 315.00, false),
  ('LIN-016', 'LIN', 'Mesa de lino 6 personas (mantel + camino + 4 servilletas)', 'Mesa de lino (colección)', 350.00, false),
  ('LIN-017', 'LIN', 'Mesa de lino 8 personas (mantel + camino + 4 servilletas)', 'Mesa de lino (colección)', 385.00, false),
  ('LIN-018', 'LIN', 'Mesa de lino 10 personas (mantel + camino + 4 servilletas)', 'Mesa de lino (colección)', 440.00, false),
  ('LIN-019', 'LIN', 'Mesa de lino 12 personas (mantel + camino + 4 servilletas)', 'Mesa de lino (colección)', 480.00, false),
  ('LIN-020', 'LIN', 'Mesa de lino 14 personas (mantel + camino + 4 servilletas)', 'Mesa de lino (colección)', 520.00, false),
  ('LIN-021', 'LIN', 'Mantel de lino a la medida (cotizado)', 'Manteles', 0.00, true),
  ('JAC-001', 'JAC', 'Mantel jacquard rectangular 4 personas (143 × 137 cm)', 'Manteles rectangulares', 140.00, false),
  ('JAC-002', 'JAC', 'Mantel jacquard rectangular 6 personas (143 × 228 cm)', 'Manteles rectangulares', 160.00, false),
  ('JAC-003', 'JAC', 'Mantel jacquard rectangular 8 personas (143 × 274 cm)', 'Manteles rectangulares', 185.00, false),
  ('JAC-004', 'JAC', 'Mantel jacquard rectangular 10 personas (143 × 320 cm)', 'Manteles rectangulares', 225.00, false),
  ('JAC-005', 'JAC', 'Mantel jacquard rectangular 12 personas (143 × 366 cm)', 'Manteles rectangulares', 260.00, false),
  ('JAC-006', 'JAC', 'Mantel jacquard rectangular 14 personas (143 × 411 cm)', 'Manteles rectangulares', 300.00, false),
  ('JAC-007', 'JAC', 'Mantel jacquard cuadrado 4 personas (150 × 150 cm)', 'Manteles cuadrados', 160.00, false),
  ('JAC-008', 'JAC', 'Mantel jacquard cuadrado 6 personas (180 × 180 cm)', 'Manteles cuadrados', 185.00, false),
  ('JAC-009', 'JAC', 'Mantel jacquard cuadrado 8 personas (210 × 210 cm)', 'Manteles cuadrados', 220.00, false),
  ('JAC-010', 'JAC', 'Mantel jacquard cuadrado 10 personas (250 × 250 cm)', 'Manteles cuadrados', 260.00, false),
  ('JAC-011', 'JAC', 'Mantel jacquard cuadrado 12 personas (282 × 282 cm)', 'Manteles cuadrados', 300.00, false),
  ('JAC-012', 'JAC', 'Mantel jacquard redondo 4 personas (Ø 160 cm)', 'Manteles redondos', 175.00, false),
  ('JAC-013', 'JAC', 'Mantel jacquard redondo 6 personas (Ø 180 cm)', 'Manteles redondos', 210.00, false),
  ('JAC-014', 'JAC', 'Mantel jacquard redondo 8 personas (Ø 200 cm)', 'Manteles redondos', 240.00, false),
  ('JAC-015', 'JAC', 'Mantel jacquard redondo 10 personas (Ø 230 cm)', 'Manteles redondos', 270.00, false),
  ('JAC-016', 'JAC', 'Mantel jacquard redondo 12 personas (Ø 260 cm)', 'Manteles redondos', 300.00, false),
  ('JAC-017', 'JAC', 'Mantel jacquard redondo 14 personas (Ø 280 cm)', 'Manteles redondos', 330.00, false),
  ('JAC-018', 'JAC', 'Camino de mesa jacquard 4 personas (40 × 137 cm)', 'Caminos de mesa', 100.00, false),
  ('JAC-019', 'JAC', 'Camino de mesa jacquard 6 personas (40 × 228 cm)', 'Caminos de mesa', 115.00, false),
  ('JAC-020', 'JAC', 'Camino de mesa jacquard 8 personas (40 × 274 cm)', 'Caminos de mesa', 125.00, false),
  ('JAC-021', 'JAC', 'Camino de mesa jacquard 10 personas (40 × 320 cm)', 'Caminos de mesa', 140.00, false),
  ('JAC-022', 'JAC', 'Camino de mesa jacquard 12 personas (40 × 366 cm)', 'Caminos de mesa', 150.00, false),
  ('JAC-023', 'JAC', 'Camino de mesa jacquard 14 personas (40 × 411 cm)', 'Caminos de mesa', 165.00, false),
  ('JAC-024', 'JAC', 'Individuales jacquard rectangulares · juego de 4', 'Individuales', 80.00, false),
  ('JAC-025', 'JAC', 'Individuales jacquard rectangulares · juego de 6', 'Individuales', 115.00, false),
  ('JAC-026', 'JAC', 'Individuales jacquard redondos · juego de 4', 'Individuales', 125.00, false),
  ('JAC-027', 'JAC', 'Individuales jacquard redondos · juego de 6', 'Individuales', 175.00, false),
  ('JAC-028', 'JAC', 'Mesa de Gala 4 personas (mantel + camino + 6 individuales)', 'Mesa de Gala (colección)', 320.00, false),
  ('JAC-029', 'JAC', 'Mesa de Gala 6 personas (mantel + camino + 6 individuales)', 'Mesa de Gala (colección)', 350.00, false),
  ('JAC-030', 'JAC', 'Mesa de Gala 8 personas (mantel + camino + 6 individuales)', 'Mesa de Gala (colección)', 385.00, false),
  ('JAC-031', 'JAC', 'Mesa de Gala 10 personas (mantel + camino + 6 individuales)', 'Mesa de Gala (colección)', 435.00, false),
  ('JAC-032', 'JAC', 'Mesa de Gala 12 personas (mantel + camino + 6 individuales)', 'Mesa de Gala (colección)', 475.00, false),
  ('JAC-033', 'JAC', 'Mesa de Gala 14 personas (mantel + camino + 6 individuales)', 'Mesa de Gala (colección)', 525.00, false),
  ('JAC-034', 'JAC', 'Mesa de Gala redonda 4 personas (mantel Ø 160 cm + 6 individuales)', 'Mesa de Gala redonda (colección)', 315.00, false),
  ('JAC-035', 'JAC', 'Mesa de Gala redonda 6 personas (mantel Ø 180 cm + 6 individuales)', 'Mesa de Gala redonda (colección)', 345.00, false),
  ('JAC-036', 'JAC', 'Mesa de Gala redonda 8 personas (mantel Ø 200 cm + 6 individuales)', 'Mesa de Gala redonda (colección)', 375.00, false),
  ('JAC-037', 'JAC', 'Mesa de Gala redonda 10 personas (mantel Ø 230 cm + 6 individuales)', 'Mesa de Gala redonda (colección)', 400.00, false),
  ('JAC-038', 'JAC', 'Mesa de Gala redonda 12 personas (mantel Ø 260 cm + 6 individuales)', 'Mesa de Gala redonda (colección)', 430.00, false),
  ('JAC-039', 'JAC', 'Mesa de Gala redonda 14 personas (mantel Ø 280 cm + 6 individuales)', 'Mesa de Gala redonda (colección)', 455.00, false),
  ('JAC-040', 'JAC', 'Mantel jacquard a la medida (cotizado)', 'Manteles rectangulares', 0.00, true)
  ) as d(sku, prefijo, nombre, grupo, precio, libre)
  join public.categorias c on c.prefijo = d.prefijo and c.negocio_id = 'artisan'
on conflict (sku) do update
   set nombre       = excluded.nombre,
       grupo        = excluded.grupo,
       precio_venta = excluded.precio_venta,
       precio_libre = excluded.precio_libre,
       categoria_id = excluded.categoria_id,
       activo       = true;

commit;

-- Revisión rápida
select c.nombre as linea, p.sku, p.nombre, coalesce(p.grupo, '') as grupo,
       case when p.precio_libre then 'a cotizar' else p.precio_venta::text end as precio
  from public.productos p
  join public.categorias c on c.id = p.categoria_id
 where p.negocio_id = 'artisan'
 order by c.orden, p.sku;
