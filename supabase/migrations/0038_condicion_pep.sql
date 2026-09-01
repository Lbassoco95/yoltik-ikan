-- =====================================================================
-- 0038 · Condición de persona políticamente expuesta, con su evidencia
-- =====================================================================
-- Fuente: Kawiil Mx · Célula de Cumplimiento, Adenda 1 del 31/08/2026,
-- apartado 6.1. Primera mitad de la instrucción 9.
--
-- La matriz pregunta si el compareciente es PPE y no había dónde capturarlo, así
-- que el Oficial de Cumplimiento lo contestaba de memoria. Cumplimiento es
-- terminante sobre por qué eso no sirve: «una casilla de sí o no sin evidencia
-- de consulta es exactamente lo que una visita de verificación desarma primero,
-- porque el sujeto obligado no puede acreditar cómo llegó a la respuesta».
--
-- De ahí salen las dos columnas. Una guarda la RESPUESTA y la otra CÓMO se
-- llegó a ella; sin la segunda, la primera es una afirmación sin respaldo.
--
-- ---------------------------------------------------------------------
-- La restricción de calendario, que cambia el diseño
-- ---------------------------------------------------------------------
-- Las RCG crean un listado nominativo oficial de PPE, y esa consulta no estará
-- disponible sino hasta aproximadamente agosto de 2027. Entre hoy y esa fecha
-- el campo NO puede resolverse contra la fuente oficial.
--
-- El control provisional que instruye Cumplimiento tiene tres piezas, y las
-- tres tienen que quedar registradas: declaración del cliente en el alta, más
-- screening del proveedor contra listas de PPE, más RESOLUCIÓN Y FIRMA de la
-- célula de cumplimiento cuando haya coincidencia.
--
-- La tercera es la que gobierna el diseño de esta migration: una coincidencia
-- de Didit NO se convierte por sí sola en «es PPE federal». Se convierte en
-- «hay coincidencia, pendiente de resolución», y el valor definitivo lo fija
-- una persona. Automatizar ese salto sería atribuirle a un proveedor una
-- determinación que las RCG reservan al sujeto obligado.
--
-- Por eso existe el estado `coincidencia_sin_resolver`, que no es un hueco:
-- es el estado real de un expediente cuyo screening encontró algo y todavía
-- nadie miró.
-- =====================================================================

alter table client
  add column if not exists condicion_pep text,
  add column if not exists pep_evidencia jsonb;

alter table client drop constraint if exists client_condicion_pep_valida;
alter table client
  add constraint client_condicion_pep_valida
  check (condicion_pep is null or condicion_pep in (
    'no_pep',
    'pep_nacional',              -- estatal o municipal
    'pep_extranjera',            -- también PPE federal: piso de banda alta
    'familiar_o_asociado',       -- cónyuge, familiar hasta segundo grado, asociado cercano
    'coincidencia_sin_resolver'  -- el screening encontró algo y nadie lo ha resuelto
  ));

comment on column client.condicion_pep is
  'Condición de persona políticamente expuesta. NO se resuelve por declaración: '
  'sale del screening del proveedor más la resolución de la célula de cumplimiento '
  '(control provisional hasta que exista la consulta oficial de las RCG, ~ago 2027). '
  'Nulo = no se ha consultado; distinto de no_pep, que sí es una determinación.';

comment on column client.pep_evidencia is
  'Cómo se llegó a la respuesta: fuente, fecha, versión de la lista, resultado y '
  'quién resolvió. Sin esto la condición es una afirmación sin respaldo, y es lo '
  'primero que una visita de verificación pide acreditar.';

-- Los que esperan resolución de la célula, que es la bandeja que hay que mirar.
create index if not exists idx_client_pep_sin_resolver
  on client(organization_id)
  where condicion_pep = 'coincidencia_sin_resolver';

-- ---------------------------------------------------------------------
-- Qué condición corresponde a un resumen de Didit
-- ---------------------------------------------------------------------
-- Devuelve la condición y la evidencia, o nulo cuando no hay con qué
-- determinarla. Lo que NUNCA hace es afirmar `no_pep` sobre una coincidencia
-- que nadie revisó: eso convertiría un hallazgo sin mirar en un «no es PPE»
-- silencioso, que es el resultado más peligroso posible de esta variable.
create or replace function public.pep_desde_resumen(p_resumen jsonb)
returns jsonb
language plpgsql immutable as $$
declare
  v_listas   jsonb := p_resumen -> 'listas';
  v_hits     int;
  v_cats     jsonb;
begin
  -- Sin módulo de listas en el workflow no hay consulta que registrar. Nulo, y
  -- que la pantalla lo diga: «no se ha consultado» no es «no es PPE».
  if v_listas is null then
    return null;
  end if;

  v_hits := coalesce((v_listas ->> 'coincidencias')::int, 0);
  v_cats := coalesce(v_listas -> 'categorias', '[]'::jsonb);

  if v_hits = 0 then
    return jsonb_build_object(
      'condicion', 'no_pep',
      'evidencia', jsonb_build_object(
        'fuente', 'Didit · screening de listas',
        'resultado', 'sin coincidencias',
        'resuelto_por', 'automatico'
      )
    );
  end if;

  -- Hay coincidencias. Si ninguna es de tipo PPE, la condición de PPE es
  -- no_pep —pero la coincidencia de sanción o nota adversa sigue ahí y la
  -- registra el resumen: son variables distintas y no se pisan.
  if not (v_cats @> '["pep"]'::jsonb) and not (v_cats @> '["sin_clasificar"]'::jsonb) then
    return jsonb_build_object(
      'condicion', 'no_pep',
      'evidencia', jsonb_build_object(
        'fuente', 'Didit · screening de listas',
        'resultado', 'coincidencias sin categoría de PPE',
        'categorias', v_cats,
        'resuelto_por', 'automatico'
      )
    );
  end if;

  -- Coincidencia de PPE, o coincidencia que el proveedor no clasificó. Las dos
  -- van a la célula: el nivel —nacional, extranjera, familiar o asociado— lo
  -- determina una persona, no el proveedor. Las RCG reservan esa determinación
  -- al sujeto obligado.
  return jsonb_build_object(
    'condicion', 'coincidencia_sin_resolver',
    'evidencia', jsonb_build_object(
      'fuente', 'Didit · screening de listas',
      'resultado', 'coincidencia que requiere resolución de la célula de cumplimiento',
      'coincidencias', v_hits,
      'categorias', v_cats,
      'resuelto_por', null,
      'nota', 'Control provisional hasta que exista la consulta oficial de las RCG. '
           || 'El nivel de PPE lo determina la célula, no el proveedor.'
    )
  );
end $$;

comment on function public.pep_desde_resumen(jsonb) is
  'Condición de PPE a partir del resumen de Didit. Nunca afirma no_pep sobre una '
  'coincidencia sin revisar: eso convertiría un hallazgo en un «no es PPE» silencioso.';

revoke all on function public.pep_desde_resumen(jsonb) from anon, authenticated, service_role;
grant execute on function public.pep_desde_resumen(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Bitácora
-- ---------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org and tipo = 'condicion_pep_con_evidencia') then
      continue;
    end if;
    perform public.registrar_evento(
      v_org, 'condicion_pep_con_evidencia', 'client', null,
      jsonb_build_object(
        'motivo', 'La matriz preguntaba si el compareciente es PPE y no había dónde '
               || 'capturarlo. Una casilla de sí o no sin evidencia de consulta es lo '
               || 'primero que una visita de verificación desarma.',
        'control_provisional', 'La consulta oficial de PPE de las RCG no estará hasta '
               || '~agosto de 2027. Hasta entonces: screening del proveedor más '
               || 'resolución y firma de la célula de cumplimiento cuando haya coincidencia.',
        'lo_que_no_se_automatiza', 'Una coincidencia de Didit no se convierte por sí sola '
               || 'en «es PPE»: el nivel lo determina la célula. Las RCG reservan esa '
               || 'determinación al sujeto obligado.'
      ),
      'sistema', null
    );
  end loop;
end $$;

revoke insert, update, delete on client from anon;
