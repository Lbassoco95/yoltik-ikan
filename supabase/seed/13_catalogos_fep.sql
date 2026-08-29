-- =====================================================================
-- Seed 13 · Registro de los catálogos del layout de fe pública
-- =====================================================================
-- ARCHIVO GENERADO — no editar a mano.
-- Regenerar con: node scripts/generar-catalogos-fep.mjs
--
-- REGISTRA los catálogos, no los CARGA. Los archivos de catálogo de la UIF no
-- vienen en el instructivo; aquí sólo queda constancia de cuáles existen, qué
-- campos los usan y qué forma tiene su clave. Quedan en version = 0 (sin
-- valores) hasta que Kawiil los cargue desde la consola de plataforma.
--
-- La única excepción es 'prioridad': el instructivo sí enumera sus dos valores
-- (campo 3.3), así que se siembra.
-- =====================================================================

insert into catalogo_sat (codigo, nombre, layout, etiquetas_layout, clave_patron, fuente, notas)
values
  ('actividad_economica', 'ACTIVIDAD ECONÓMICA', 'fep', array['actividad_economica']::text[], '^[0-9]{7}$', 'uif', 'Referenciado por 7 campo(s) del instructivo.'),
  ('actividades_vulnerables', 'actividades vulnerables', 'fep', array['clave_actividad']::text[], '^[A-Z0-9]{3}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('cargo_de_accionista', 'CARGO DE ACCIONISTA', 'fep', array['cargo_accionista']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('codigos_postales_de_sepomex', 'Códigos Postales de SEPOMEX', 'fep', array['codigo_postal']::text[], '^[A-Z0-9]{5}$', 'uif', 'Referenciado por 2 campo(s) del instructivo.'),
  ('entidad_federativa', 'ENTIDAD FEDERATIVA', 'fep', array['entidad_federativa']::text[], '^[0-9]{1,2}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('giro_mercantil', 'GIRO MERCANTIL', 'fep', array['giro_mercantil']::text[], '^[0-9]{7}$', 'uif', 'Referenciado por 13 campo(s) del instructivo.'),
  ('instrumentos_monetarios', 'Instrumentos Monetarios', 'fep', array['instrumento_monetario']::text[], '^[0-9]{1,2}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('monedas_o_divisas', 'Monedas o Divisas', 'fep', array['moneda']::text[], '^[0-9]{1,3}$', 'uif', 'Referenciado por 3 campo(s) del instructivo.'),
  ('motivo_cosntitucion_modificacion', 'MOTIVO COSNTITUCION MODIFICACION', 'fep', array['motivo_constitucion', 'motivo_modificacion']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 2 campo(s) del instructivo.'),
  ('pais', 'PAÍS', 'fep', array['pais_nacionalidad']::text[], '^[A-Z]{2}$', 'uif', 'Referenciado por 38 campo(s) del instructivo.'),
  ('tipo_alerta', 'Catálogo de <tipo_alerta>', 'fep', array['tipo_alerta']::text[], '^[0-9]{3,4}$', 'uif', 'El instructivo cita "el catálogo provisto por la UIF" sin nombrarlo. Al cargarlo, verificar si coincide con otro ya registrado.'),
  ('tipo_de_bien_donado', 'Tipo de bien donado', 'fep', array['tipo_bien']::text[], '^[0-9]{1,2}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipo_de_cesion', 'Tipo de Cesión', 'fep', array['tipo_cesion']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipo_de_fideicomiso', 'Tipo de Fideicomiso', 'fep', array['tipo_fideicomiso']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipo_de_modificacion_patrimonial', 'Tipo de Modificación Patrimonial', 'fep', array['tipo_modificacion_capital_fijo', 'tipo_modificacion_capital_variable']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 2 campo(s) del instructivo.'),
  ('tipo_de_movimiento', 'Tipo de Movimiento', 'fep', array['tipo_movimiento']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipo_de_persona_moral', 'Tipo de Persona Moral', 'fep', array['tipo_persona_moral']::text[], '^[0-9]{1,2}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipo_de_poder', 'Tipo de Poder', 'fep', array['tipo_poder']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipo_fusion', 'TIPO FUSION', 'fep', array['tipo_fusion']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipo_movimiento_fideicomisario', 'Catálogo de <tipo_movimiento_fideicomisario>', 'fep', array['tipo_movimiento_fideicomisario']::text[], '^[0-9]{1}$', 'uif', 'El instructivo cita "el catálogo provisto por la UIF" sin nombrarlo. Al cargarlo, verificar si coincide con otro ya registrado.'),
  ('tipo_movimiento_fideicomitente', 'Catálogo de <tipo_movimiento_fideicomitente>', 'fep', array['tipo_movimiento_fideicomitente']::text[], '^[0-9]{1}$', 'uif', 'El instructivo cita "el catálogo provisto por la UIF" sin nombrarlo. Al cargarlo, verificar si coincide con otro ya registrado.'),
  ('tipos_de_garantia', 'Tipos de Garantía', 'fep', array['tipo_garantia']::text[], '^[0-9]{1,2}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipos_de_inmueble', 'Tipos de Inmueble', 'fep', array['tipo_inmueble']::text[], '^[0-9]{1,2}$', 'uif', 'Referenciado por 2 campo(s) del instructivo.'),
  ('tipos_de_operacion', 'Tipos de Operación', 'fep', array['tipo_operacion']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.'),
  ('tipos_de_otorgamiento', 'Tipos de Otorgamiento', 'fep', array['tipo_otorgamiento']::text[], '^[0-9]{1}$', 'uif', 'Referenciado por 1 campo(s) del instructivo.')
on conflict (codigo) do update set
  nombre = excluded.nombre,
  etiquetas_layout = excluded.etiquetas_layout,
  clave_patron = excluded.clave_patron,
  notas = excluded.notas;

-- Prioridad del aviso — campo 3.3. Valores tomados literalmente del
-- instructivo: "1 - Normal. 2 - 24 hrs. con operaciones".
insert into catalogo_sat (codigo, nombre, layout, etiquetas_layout, clave_patron, fuente, notas)
values ('prioridad', 'Prioridad de aviso', 'fep', array['prioridad']::text[], '^[0-9]$',
        'instructivo_fep', 'Único catálogo cuyos valores enumera el propio instructivo (campo 3.3).')
on conflict (codigo) do nothing;

insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values ('1', 'Normal', 1), ('2', '24 hrs. con operaciones', 2))
     as v(clave, descripcion, orden)
where c.codigo = 'prioridad'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

update catalogo_sat
   set version = greatest(version, 1), actualizado_en = coalesce(actualizado_en, now())
 where codigo = 'prioridad' and version = 0;
