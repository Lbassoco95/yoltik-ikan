-- =====================================================================
-- Seed 01b · Perfil de actividad vulnerable de Ixim Pay
-- =====================================================================
-- Debe correr DESPUÉS de 01 (la org) y ANTES de 06 (clientes): el trigger
-- `trg_bloqueo_sin_perfil_client` de la 0077 rechaza altas sin perfil.
-- En el remoto, la 0078 ya lo sembraría si la org existía al migrar; este
-- seed es idempotente y cubre el proyecto nuevo.
-- =====================================================================

insert into organizacion_actividad_vulnerable (
  organization_id, fraccion, codigo_anexo, clave_actividad, vigente_desde, notas
)
select
  o.id,
  'XVI',
  '16',
  coalesce(o.clave_actividad, 'AVI'),
  coalesce(o.fecha_alta_sat, date '2025-12-10'),
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
