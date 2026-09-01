-- =====================================================================
-- 0036 · Forma de pago y origen de los recursos
-- =====================================================================
-- La matriz de riesgo pregunta dos cosas que Ikán nunca capturó: cómo se pagó
-- el acto y de dónde salió el dinero. No es que el sistema no supiera
-- derivarlas: es que el dato no existía en ninguna parte, así que el Oficial de
-- Cumplimiento las contestaba de memoria o las dejaba en blanco, y sin ellas la
-- matriz no cierra y el compareciente se queda sin clasificación de riesgo.
--
-- Las dos son de la OPERACIÓN, no de la persona. El mismo compareciente puede
-- pagar una compraventa por transferencia y la siguiente en efectivo, y de eso
-- se trata: el riesgo se mueve con lo que hace, no con quién es.
--
-- ---------------------------------------------------------------------
-- Y hay una segunda razón, que pesa más que la matriz
-- ---------------------------------------------------------------------
-- El artículo 32 de la LFPIORPI PROHÍBE liquidar en efectivo por encima de
-- ciertos montos —8,025 UMA en inmuebles, 3,210 en acciones y partes
-- sociales—. Esos dos umbrales llevan cargados en `parametro_regulatorio`
-- desde la 0030 con su fuente y su publicación en el DOF, y hasta hoy NINGÚN
-- código los consulta. No podían: no había forma de saber si un acto se pagó
-- en efectivo.
--
-- Un umbral cargado que nada consulta es documentación, no control. Con la
-- forma de pago capturada, la prohibición se puede vigilar de verdad.
--
-- ---------------------------------------------------------------------
-- Por qué text con check y no un enum
-- ---------------------------------------------------------------------
-- Las tres formas de pago salen de las opciones que la matriz ya define. Si
-- Cumplimiento decide mañana partir «mixto» en dos, un check se cambia en una
-- migration y un enum obliga a recrear el tipo con todo lo que cuelga de él.
-- El valor es de negocio, no de infraestructura.
-- =====================================================================

alter table operation
  add column if not exists forma_pago text,
  add column if not exists pais_origen_recursos text;

alter table operation
  drop constraint if exists operation_forma_pago_valida;
alter table operation
  add constraint operation_forma_pago_valida
  check (forma_pago is null or forma_pago in ('bancarizado', 'mixto', 'efectivo'));

-- ISO 3166-1 alfa-2, como el resto de países en la base. En mayúsculas para que
-- 'mx' y 'MX' no acaben siendo dos países distintos al cotejar contra las
-- listas GAFI.
alter table operation
  drop constraint if exists operation_pais_origen_valido;
alter table operation
  add constraint operation_pais_origen_valido
  check (pais_origen_recursos is null or pais_origen_recursos ~ '^[A-Z]{2}$');

comment on column operation.forma_pago is
  'Cómo se liquidó el acto: bancarizado, mixto o efectivo. Alimenta la variable '
  'de forma de pago de la matriz y permite vigilar la prohibición del art. 32 '
  'LFPIORPI, cuyos umbrales están en parametro_regulatorio desde la 0030.';

comment on column operation.pais_origen_recursos is
  'ISO2 del país de donde provienen los recursos. NO se deriva de la residencia '
  'del compareciente: dónde vive alguien y de dónde salió el dinero son cosas '
  'distintas, y confundirlas es lo que la variable existe para detectar.';

-- Los actos pagados en efectivo, que es lo que se va a consultar de verdad.
create index if not exists idx_operation_efectivo
  on operation(organization_id, fecha)
  where forma_pago = 'efectivo';

-- ---------------------------------------------------------------------
-- Bitácora
-- ---------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org
                  and tipo = 'captura_forma_pago_y_origen_recursos') then
      continue;
    end if;

    perform public.registrar_evento(
      v_org,
      'captura_forma_pago_y_origen_recursos',
      'operation',
      null,
      jsonb_build_object(
        'motivo', 'La matriz de riesgo pedía dos datos que no existían en ninguna parte, '
               || 'así que el OC los contestaba de memoria o los dejaba en blanco.',
        'efecto_colateral', 'Los umbrales del art. 32 LFPIORPI (8,025 UMA en inmuebles y '
               || '3,210 en acciones) llevaban cargados desde la 0030 sin que nada los '
               || 'pudiera consultar: no había forma de saber si un acto se pagó en efectivo.',
        'alcance', 'Los actos ya registrados quedan con los dos campos en nulo. No se '
               || 'infieren: suponer que un acto viejo se pagó por transferencia sería '
               || 'inventar el dato que la migration existe para empezar a tener.'
      ),
      'sistema',
      null
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
-- Las escribe quien captura el acto, con las políticas de RLS que ya rigen
-- sobre `operation`. Esto sólo confirma que las columnas nuevas no abren una
-- puerta propia por el ALTER DEFAULT PRIVILEGES del proyecto.
revoke insert, update, delete on operation from anon;
