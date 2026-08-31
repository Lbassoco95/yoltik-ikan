-- =====================================================================
-- Ikán · Qué hay en el catálogo de parámetros, y qué rastro dejó
-- =====================================================================
-- SÓLO LECTURA. No escribe, no corrige, no borra.
--
-- Existe porque el 31/08/2026 se editó `uma_diaria` en producción con un
-- `update` directo desde el SQL Editor, no por las funciones de la 0029. Eso
-- puede pasar: quien entra al SQL Editor lo hace como `postgres`, que es el
-- dueño de la tabla y se salta tanto la RLS como los `revoke` de la 0029. La
-- 0029 protege a la APLICACIÓN, no a quien tiene la llave de la base.
--
-- Tres cosas hay que mirar, y la tercera es la urgente:
--
--   1. Qué valores hay hoy y si alguno cambió.
--   2. Si el cambio dejó evento en la cadena de auditoría. Un `update` directo
--      NO llama a registrar_evento, así que lo esperable es que no haya nada:
--      un cambio en el catálogo del que el motor saca sus cifras, sin rastro.
--   3. SI SE FILTRÓ UN TOKEN. La política de lectura de esta tabla es
--      `auth.uid() is not null`: la lee CUALQUIER usuario autenticado, de
--      cualquier organización. Una URL de API con su token pegada en `fuente`,
--      `url_fuente` o `notas` queda a la vista de todos los clientes de Ikán.
-- =====================================================================

drop table if exists pg_temp.ikan_param;
create temp table ikan_param (seccion text, orden int, que text, detalle text, dato text);

-- ---------------------------------------------------------------------
-- 3 primero, porque es el que puede obligar a rotar una credencial
-- ---------------------------------------------------------------------
insert into ikan_param
select '0 · Credenciales', 1,
       codigo || ' (' || sector || ', desde ' || vigente_desde || ')',
       'campo: ' || campo,
       'REVISAR: parece llevar un token o una clave'
from parametro_regulatorio p,
lateral (values ('fuente', p.fuente), ('url_fuente', p.url_fuente), ('notas', p.notas)) as c(campo, texto)
where texto is not null
  and (   texto ~* '[?&](token|key|apikey|api_key)='
       or texto ~* '/2\.0/[A-Za-z0-9-]{20,}'
       or texto ~* '\m[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\M' );

insert into ikan_param
select '0 · Credenciales', 2, 'ninguna cadena sospechosa', 'nada que rotar', ''
where not exists (select 1 from ikan_param where seccion = '0 · Credenciales');

-- ---------------------------------------------------------------------
-- 1. El catálogo tal como está
-- ---------------------------------------------------------------------
insert into ikan_param
select '1 · Catálogo', row_number() over (order by codigo, vigente_desde desc)::int,
       codigo || '  ·  ' || nombre,
       valor_numerico::text || ' ' || unidad || '  ·  ' || sector
         || '  ·  desde ' || vigente_desde
         || coalesce(' hasta ' || vigente_hasta::text, ' (abierto)'),
       case when confirmado_por is null then 'SIN CONFIRMAR'
            else 'confirmado por ' || confirmado_por end
from parametro_regulatorio;

-- Fuente y notas aparte: son los campos que se tocaron.
insert into ikan_param
select '2 · Fuente y notas', row_number() over (order by codigo)::int,
       codigo,
       'fuente: ' || left(coalesce(fuente, '—'), 90),
       case when length(coalesce(notas, '')) = 0 then 'sin notas'
            else length(notas) || ' caracteres en notas' end
from parametro_regulatorio;

-- ---------------------------------------------------------------------
-- 2. ¿Quedó rastro?
-- ---------------------------------------------------------------------
insert into ikan_param
select '3 · Rastro en la bitácora', 1,
       'eventos de parámetros en la cadena de plataforma',
       count(*)::text || ' evento(s)',
       case when count(*) = 0
            then 'NINGUNO: lo que se haya cambiado, se cambió sin dejar constancia'
            else 'el último: ' || to_char(max(registrado_en), 'DD/MM/YYYY HH24:MI') end
from evento_auditoria
where organization_id = '00000000-0000-0000-0000-000000000000'
  and tipo in ('parametro_fijado', 'parametro_corregido', 'parametro_confirmado');

select seccion, orden, que, detalle, dato from ikan_param order by seccion, orden;
