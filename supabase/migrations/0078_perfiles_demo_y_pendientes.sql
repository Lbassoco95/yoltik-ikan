-- =====================================================================
-- 0078 · Perfiles AV de organizaciones demo + placeholders pendientes
-- =====================================================================
-- Siembra el perfil mínimo para Ixim Pay (XVI → anexo 16) y notarías demo
-- (XII → 12-A) para que el trigger de captura no las deje sin operar.
-- Registra anexos 4, 10 y 14 como `pendiente` (no se inventan campos).
--
-- La carga de los 4,008 campos y 250 fracciones la hace el seed generado
-- `24_formatos_oficiales_uif.sql` (script scripts/generar-seed-formatos-uif.mjs).
-- =====================================================================

-- Placeholders de anexos no publicados en la extracción
insert into formato_oficial (
  codigo_anexo, ambito, version, estado, regimen_entrada,
  vigente_desde, total_campos, archivo_origen, notas
) values
  (
    '4',
    'Artículo 17, fracción IV de la Ley — préstamos o créditos',
    'dof-2026-09-24', 'pendiente', 'jun_2027',
    date '2027-06-01', 0, null,
    'La Resolución reforma los anexos 1 al 16, pero la publicación extraída no contiene el Anexo 4. Pendiente de carga; no se inventa.'
  ),
  (
    '10',
    'Artículo 17, fracción X de la Ley — traslado y custodia de valores',
    'dof-2026-09-24', 'pendiente', 'jun_2027',
    date '2027-06-01', 0, null,
    'Anexo 10 ausente en la extracción del DOF 24/09/2026. Pendiente de carga; no se inventa.'
  ),
  (
    '14',
    'Informe sin operaciones (art. 3 Bis de la Resolución y art. 25 de las Reglas)',
    'dof-2026-09-24', 'pendiente', 'jun_2027',
    date '2027-06-01', 0, null,
    'Anexo 14 (informe sin operaciones) ausente en la extracción. El sistema opera sin él y lo señala pendiente; no se inventa.'
  )
on conflict (codigo_anexo, version) do update set
  estado = excluded.estado,
  notas = excluded.notas;

-- Catálogo Anexo A (registro; valores en el seed 24)
insert into catalogo_formato (codigo, nombre, descripcion, fuente, version)
values (
  'anexo_a_fracciones_arancelarias',
  'Anexo A — Fracciones arancelarias cuya mercancía es Actividad Vulnerable (fr. XIV)',
  'Único catálogo de valores publicado en el DOF de la Resolución. 250 fracciones.',
  'dof',
  0
)
on conflict (codigo) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion;

-- Mecanismo vacío para catálogos que publica la UIF en el Portal (art. 9).
-- Sin valores: los campos que dependan de ellos quedan «no validados».
insert into catalogo_formato (codigo, nombre, descripcion, fuente, version)
values
  ('tipo_operacion', 'Tipo de operación', 'Lo publica la UIF en el Portal (art. 9).', 'portal_uif', 0),
  ('tipo_alerta', 'Tipo de alerta', 'Lo publica la UIF en el Portal (art. 9).', 'portal_uif', 0),
  ('moneda', 'Moneda', 'Lo publica la UIF en el Portal (art. 9).', 'portal_uif', 0),
  ('actividad_economica', 'Actividad económica', 'Lo publica la UIF en el Portal (art. 9).', 'portal_uif', 0),
  ('clave_actividad_vulnerable', 'Clave de actividad vulnerable', 'Lo publica la UIF en el Portal (art. 9).', 'portal_uif', 0),
  ('instrumento_monetario', 'Instrumento monetario', 'Lo publica la UIF en el Portal (art. 9).', 'portal_uif', 0),
  ('activo_virtual', 'Activo virtual operado', 'Lo publica la UIF en el Portal (art. 9).', 'portal_uif', 0),
  ('tipo_inmueble', 'Tipo de inmueble', 'Lo publica la UIF en el Portal (art. 9).', 'portal_uif', 0)
on conflict (codigo) do nothing;

-- Perfiles demo: Ixim Pay (XVI)
insert into organizacion_actividad_vulnerable (
  organization_id, fraccion, codigo_anexo, clave_actividad, vigente_desde, notas
)
select
  o.id, 'XVI', '16', o.clave_actividad, date '2025-12-10',
  'Perfil canónico demo Ixim Pay · Art. 17 fr. XVI · Anexo 16'
from organizations o
where o.id = '11111111-1111-1111-1111-111111111111'
  and not exists (
    select 1 from organizacion_actividad_vulnerable av
     where av.organization_id = o.id
       and av.fraccion = 'XVI'
       and av.codigo_anexo = '16'
       and av.vigente_hasta is null
  );

-- Notarías demo (XII → 12-A como anexo principal de fe pública A/B)
insert into organizacion_actividad_vulnerable (
  organization_id, fraccion, codigo_anexo, clave_actividad, vigente_desde, notas
)
select
  o.id, 'XII', '12-A', coalesce(o.clave_actividad, 'FEP'), current_date,
  'Perfil demo fe pública · Art. 17 fr. XII · Anexo 12-A'
from organizations o
where 'XII' = any (o.sectores)
  and o.id <> '11111111-1111-1111-1111-111111111111'
  and not exists (
    select 1 from organizacion_actividad_vulnerable av
     where av.organization_id = o.id
       and av.fraccion = 'XII'
       and av.codigo_anexo = '12-A'
       and av.vigente_hasta is null
  );

-- Cualquier otra org con sectores: un perfil por sector conocido
insert into organizacion_actividad_vulnerable (
  organization_id, fraccion, codigo_anexo, clave_actividad, vigente_desde, notas
)
select
  o.id,
  s.fraccion,
  s.anexo,
  o.clave_actividad,
  current_date,
  'Perfil derivado de organizations.sectores al aplicar 0078'
from organizations o
cross join lateral (
  select * from (values
    ('IV',  '4'),
    ('V',   '5-A'),
    ('VII', '6'),
    ('VIII','8'),
    ('XV',  '15'),
    ('XVI', '16')
  ) as m(fraccion, anexo)
  where m.fraccion::text = any (select unnest(o.sectores)::text)
) s
where not exists (
  select 1 from organizacion_actividad_vulnerable av
   where av.organization_id = o.id
     and av.fraccion = s.fraccion
     and av.codigo_anexo = s.anexo
     and av.vigente_hasta is null
);
