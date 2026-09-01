-- =====================================================================
-- 0047 · La respuesta de la matriz guarda la CLAVE, no sólo el número
-- =====================================================================
-- Origen: se vio en pantalla. El select del tipo de acto mostraba dos
-- etiquetas pegadas —«Otorgamiento de poder irrevocableConstitución o
-- modificación de fideicomiso…»— y el pie decía «alto de oficio por
-- PODER_IRREVOCABLE» sobre un acto que podía ser otro.
--
-- ---------------------------------------------------------------------
-- El defecto
-- ---------------------------------------------------------------------
-- `XII-ACT-01` tiene ONCE actos y sólo CUATRO valores de riesgo distintos,
-- porque el riesgo base se comparte a propósito (Adenda 1, apartado 2.2):
--
--   valor 2 · avalúo
--   valor 3 · transmisión de inmuebles, constitución de personas morales,
--             modificación patrimonial, fusión, escisión, compraventa de acciones
--   valor 4 · poder irrevocable, fideicomiso, cesión de derechos de fideicomiso,
--             mutuo o crédito
--
-- Y `client_risk_assessment.respuestas` guardaba sólo el NÚMERO. Con eso, seis
-- actos distintos son indistinguibles entre sí, y cuatro más también.
--
-- Consecuencias, las dos reales:
--
--   · En la pantalla, un `<Select>` con valor 4 empataba con cuatro opciones y
--     pintaba las cuatro etiquetas concatenadas.
--
--   · En el motor de disparadores, `opciones.find(o => o.valor === respuesta)`
--     devuelve SIEMPRE la primera con ese valor. Un fideicomiso o un mutuo se
--     registraban como PODER_IRREVOCABLE.
--
-- La banda salía bien —los cuatro son alto de oficio— pero
-- `motivo_alto_de_oficio` nombraba el FUNDAMENTO LEGAL EQUIVOCADO, y eso es lo
-- que el OC firma y lo que un verificador lee. Es el mismo modo de falla que
-- Cumplimiento señaló en la v1 con el anclaje por posición: no truena,
-- responde mal. Las claves se introdujeron justo para cerrarlo, y quedó
-- abierto porque la respuesta siguió siendo un número.
--
-- ---------------------------------------------------------------------
-- Por qué una columna nueva y no cambiar `respuestas`
-- ---------------------------------------------------------------------
-- Reinterpretar `respuestas` para que guarde claves en vez de números dejaría
-- ilegibles las evaluaciones ya guardadas: su contenido no se podría distinguir
-- del nuevo, y una evaluación que no se puede leer con la forma que la produjo
-- es exactamente lo que hemos evitado en toda la matriz.
--
-- Así que la clave viaja APARTE. `respuestas` sigue siendo el puntaje —que es
-- lo que suma— y `respuestas_clave` dice cuál opción se eligió cuando el número
-- no alcanza para saberlo. Las evaluaciones anteriores quedan con el objeto
-- vacío, que es la verdad: se guardaron sin esa información.
-- =====================================================================

alter table client_risk_assessment
  add column if not exists respuestas_clave jsonb not null default '{}'::jsonb;

comment on column client_risk_assessment.respuestas_clave is
  'Clave estable de la opción elegida, por código de variable. Existe porque el riesgo '
  'base se comparte entre actos —cuatro actos valen 4 y seis valen 3— y el número solo '
  'no dice cuál se eligió: el disparador de alto de oficio resolvía a la primera opción '
  'con ese valor y un fideicomiso se registraba como poder irrevocable. Vacío en las '
  'evaluaciones anteriores a esta migration, que es la verdad: se guardaron sin ella.';

-- ---------------------------------------------------------------------
-- Bitácora
-- ---------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org and tipo = 'respuesta_matriz_por_clave') then
      continue;
    end if;
    perform public.registrar_evento(
      v_org, 'respuesta_matriz_por_clave', 'client_risk_assessment', null,
      jsonb_build_object(
        'defecto', 'La respuesta de la matriz guardaba sólo el número. XII-ACT-01 tiene '
                || 'once actos y cuatro valores: seis comparten el 3 y cuatro comparten el '
                || '4, a propósito, porque el riesgo base se comparte. Con el número solo, '
                || 'esos actos eran indistinguibles.',
        'sintomas', 'El select mostraba las cuatro etiquetas del valor 4 concatenadas, y el '
                 || 'disparador resolvía a la primera opción con ese valor: un fideicomiso o '
                 || 'un mutuo se registraban como PODER_IRREVOCABLE.',
        'gravedad', 'La banda salía correcta —los cuatro son alto de oficio— pero '
                 || 'motivo_alto_de_oficio nombraba el fundamento legal equivocado, y es lo '
                 || 'que el OC firma y lo que un verificador lee.',
        'linaje', 'Mismo modo de falla que el anclaje por posición de la v1 que la Adenda '
               || 'mandó eliminar. Las claves se introdujeron para cerrarlo y quedó abierto '
               || 'porque la respuesta siguió siendo un número.',
        'correccion', 'Columna respuestas_clave, aparte de respuestas. Reinterpretar '
                   || 'respuestas dejaría ilegibles las evaluaciones ya guardadas.'
      ),
      'sistema', null
    );
  end loop;
end $$;

revoke insert, update, delete on client_risk_assessment from anon;
