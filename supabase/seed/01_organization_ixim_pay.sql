-- =====================================================================
-- Seed · Ixim Pay como organización demo
-- =====================================================================
-- Datos derivados de "Metodologia PLD-FT - Ixim Pay.docx".
-- Uso autorizado por el representante legal de Ixim Pay para demos
-- Kawiil/Yoltik. Para demos a terceros sin contexto Kawiil, crear seed
-- paralelo "01b_demo_generica_xvi.sql" con datos sintéticos (Sprint D-2+).
-- =====================================================================

insert into organizations (id, rfc, razon_social, sectores, oficio_alta_sat,
                           fecha_alta_sat, representante_legal, domicilio_fiscal)
values (
  '11111111-1111-1111-1111-111111111111',
  'FRA250514B41',
  'IXIM PAY, S.A. DE C.V.',
  ARRAY['XVI']::sector_av[],
  '600-07-01-00-2025-2068',
  '2025-12-10',
  'Leopoldo Bassoco Nova',
  'Calle Tuxpan No. 63, Interior 402, Colonia Roma Sur, Cuauhtémoc, CDMX, C.P. 06760'
)
on conflict (rfc) do update set
  razon_social = excluded.razon_social,
  sectores = excluded.sectores;
