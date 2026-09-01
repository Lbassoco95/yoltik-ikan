-- =====================================================================
-- 0048 · El OC no podía generar el aviso: faltaba la política de INSERT
-- =====================================================================
-- Se vio en producción: al pulsar «Generar y descargar» en el aviso mensual,
-- la pantalla devuelve
--
--   new row violates row-level security policy for table "aviso"
--
-- ---------------------------------------------------------------------
-- Por qué pasaba
-- ---------------------------------------------------------------------
-- `aviso` tiene RLS activo y sólo dos políticas, de la 0005:
--
--   aviso_select_oc_admin  · para leer
--   aviso_update_oc        · para actualizar
--
-- Ninguna de INSERT. La tabla se diseñó pensando en que el Motor PLD escribiera
-- los borradores, y el motor corre con service role, que salta RLS: por eso
-- nunca se notó.
--
-- Pero `guardarAviso` corre en el NAVEGADOR, como el Oficial de Cumplimiento,
-- y ahí RLS sí aplica. Es decir: generar el XML desde la pantalla no ha
-- funcionado nunca. La pantalla más importante del producto —la que arma lo que
-- se presenta al SAT— fallaba desde el día que se escribió.
--
-- Sin política de INSERT, Postgres no rechaza por permisos: rechaza porque
-- NINGUNA política permite la fila. El mensaje es correcto y opaco a la vez.
--
-- ---------------------------------------------------------------------
-- Quién debe poder generarlo, y por qué sólo el OC
-- ---------------------------------------------------------------------
-- Generar el aviso es un acto con consecuencia: produce el archivo que se sube
-- al portal y queda en la bitácora encadenada. `docs/ROLES.md` lo asigna al
-- Oficial de Cumplimiento —«confirma, marca inusual o preocupante, firma
-- avisos»— y el Administrador configura el motor, no reporta.
--
-- Se sigue la misma línea que `aviso_update_oc`, que ya era sólo del OC: si el
-- que actualiza el aviso es el OC, el que lo crea no puede ser cualquiera.
--
-- El `with check` amarra la organización. Sin él, un OC podría insertar un
-- aviso a nombre de otra notaría, que es la fuga que RLS existe para cerrar.
-- =====================================================================

drop policy if exists "aviso_insert_oc" on aviso;
create policy "aviso_insert_oc" on aviso
  for insert
  with check (
    organization_id = public.current_org_id() and public.has_rol('oc')
  );

comment on table aviso is
  'Avisos generados. Los borradores los escribe el Motor PLD con service role; el aviso '
  'mensual lo genera el OC desde la pantalla, y para eso hace falta la política de '
  'INSERT que la 0005 no incluyó: sin ella «Generar y descargar» fallaba con violación '
  'de RLS, porque ninguna política permitía la fila.';

-- ---------------------------------------------------------------------
-- Bitácora
-- ---------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  for v_org in select id from organizations loop
    if exists (select 1 from evento_auditoria
                where organization_id = v_org and tipo = 'aviso_insert_habilitado') then
      continue;
    end if;
    perform public.registrar_evento(
      v_org, 'aviso_insert_habilitado', 'aviso', null,
      jsonb_build_object(
        'defecto', 'La tabla aviso tenía RLS activo con políticas de SELECT y UPDATE pero '
                || 'ninguna de INSERT. El Motor PLD escribe con service role, que salta '
                || 'RLS, así que nunca se notó; pero el aviso mensual lo genera el OC desde '
                || 'el navegador y ahí RLS sí aplica.',
        'sintoma', '«new row violates row-level security policy for table aviso» al pulsar '
                || 'Generar y descargar. Generar el XML desde la pantalla no había '
                || 'funcionado nunca.',
        'alcance', 'Sólo el Oficial de Cumplimiento, como en aviso_update_oc: generar el '
                || 'aviso produce el archivo que se sube al portal y queda en la bitácora '
                || 'encadenada. El Administrador configura el motor, no reporta.',
        'with_check', 'Amarra organization_id: sin él un OC podría insertar un aviso a '
                   || 'nombre de otra notaría.'
      ),
      'sistema', null
    );
  end loop;
end $$;

revoke insert, update, delete on aviso from anon;
