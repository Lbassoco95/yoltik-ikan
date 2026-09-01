-- =====================================================================
-- Ikán · Aplicar migration 0043 en el SQL Editor
-- =====================================================================
-- QUÉ ARREGLA
--
-- Dos defectos que salieron al revisar qué hay REALMENTE en la base después de
-- la 0041 y la 0042, y que dejaban la variable de riesgo país sin poder
-- responder casi nada:
--
--   1. La organización de la Notaría Demo GDL no tenía NINGUNA fila de lista
--      gris. Sólo Irán y Corea del Norte, las dos en lista negra. El nivel
--      «monitoreo intensificado» era inalcanzable para sus comparecientes:
--      cualquier país extranjero que no fuera esos dos volvía como «sin
--      observaciones». No se veía como una falla, se veía como una respuesta,
--      y con la misma seguridad para Suiza que para Panamá.
--
--   2. Las filas del GAFI no tenían plenario. Se sellan con `2025-02`, que es
--      el corte REAL de lo sembrado —el encabezado del seed 04 dice «corte
--      febrero 2025» y su lista gris tiene dieciséis jurisdicciones—.
--
-- POR QUÉ NO SE SELLA «2026-06»
--
-- La Adenda dice que el estado vigente es el plenario de junio de 2026, con
-- veintiuna jurisdicciones bajo monitoreo intensificado. Lo que está sembrado
-- NO es ése. Ponerle esa etiqueta haría justo el daño que el versionado existe
-- para evitar: calificar expedientes contra una lista de hace año y medio
-- afirmando que es la vigente. Un dato mal fechado es peor que uno sin fechar,
-- porque el sin fechar se nota.
--
-- LO QUE FALTA Y NO ESTÁ AQUÍ
--
-- El snapshot del plenario de junio de 2026 lo tiene que entregar
-- Kawiil-Cumplimiento: las tres jurisdicciones bajo llamado a la acción y las
-- veintiuna bajo monitoreo intensificado. Se cargará como versión nueva; las
-- filas de hoy se cerrarán con `vigente_hasta`, no se borrarán, porque los
-- expedientes calificados con ellas tienen que poder explicarse.
--
-- ORDEN: después de la 0041 y la 0042.
-- IDEMPOTENTE: se puede volver a correr sin duplicar nada.
-- =====================================================================

begin;

-- =====================================================================
-- 0043 · El snapshot del GAFI, fechado y completo en las dos organizaciones
-- =====================================================================
-- Esto NO estaba en la Adenda: salió de revisar qué hay realmente en la base
-- después de aplicar la 0041 y la 0042, y son dos defectos que dejaban la
-- variable de riesgo país sin poder responder casi nada.
--
-- ---------------------------------------------------------------------
-- 1. La notaría no tenía lista gris. Ninguna.
-- ---------------------------------------------------------------------
-- `country_risk_list` es por organización, y el seed 08 le dio a la Notaría
-- Demo GDL exactamente dos países: Irán y Corea del Norte, ambos en lista
-- negra. Sin lista gris, el nivel «monitoreo intensificado» era INALCANZABLE
-- para cualquier compareciente de la notaría: todo país extranjero que no fuera
-- esos dos volvía como «sin observaciones».
--
-- Eso no se veía como una falla. Se veía como una respuesta: la matriz
-- contestaba «jurisdicción extranjera sin observaciones del GAFI» con la misma
-- seguridad para Suiza que para Panamá. Es el peor modo de falla de todos,
-- porque produce falsos negativos que nadie va a ir a revisar.
--
-- Faltaba también Myanmar en la lista negra, que sí está en el seed 04.
--
-- Se COPIA el snapshot que ya existe en el repo para Ixim Pay. No se inventa
-- ninguna clasificación de país: son las mismas filas, con la misma fuente y la
-- misma fecha de vigencia, en la organización que no las tenía.
--
-- ---------------------------------------------------------------------
-- 2. El plenario que corresponde es el de FEBRERO DE 2025, no el de junio
-- ---------------------------------------------------------------------
-- La Adenda pide versionar el snapshot por plenario y dice que el estado de las
-- listas corresponde al plenario de junio de 2026. Pero lo que está sembrado en
-- este repo NO es ese: el encabezado del seed 04 dice «GAFI Lista Negra/Gris
-- (corte febrero 2025)», y su lista gris tiene DIECISÉIS jurisdicciones,
-- mientras que la Adenda cuenta VEINTIUNA bajo monitoreo intensificado.
--
-- Así que se sella con `2025-02`, que es el corte real. Sellarlo «2026-06»
-- porque es lo que dice la Adenda haría exactamente el daño que el versionado
-- existe para evitar: un expediente calificado contra una lista de hace año y
-- medio, con una etiqueta que afirma que es la vigente. Un dato mal fechado es
-- peor que un dato sin fechar, porque el sin fechar se nota.
--
-- QUEDA PENDIENTE de Kawiil-Cumplimiento: entregar el snapshot del plenario de
-- junio de 2026 —las tres de llamado a la acción y las veintiuna de monitoreo
-- intensificado— para cargarlo como versión nueva. Las filas de hoy se cierran
-- con `vigente_hasta` ese día; no se borran, porque los expedientes calificados
-- con ellas tienen que poder explicarse.
-- =====================================================================

-- ---------------------------------------------------------------------
-- El plenario de las filas que ya existen
-- ---------------------------------------------------------------------
-- Sólo las de fuente GAFI: OFAC y paraísos fiscales no se publican por plenario
-- y ponerles uno sería afirmar algo falso sobre su origen.
update country_risk_list
   set plenario = '2025-02'
 where fuente in ('gafi_gris', 'gafi_negra')
   and plenario is null;

-- ---------------------------------------------------------------------
-- El mismo snapshot para la organización que no lo tenía
-- ---------------------------------------------------------------------
-- Insert-select, no una lista escrita a mano: una segunda copia literal de
-- diecinueve países se desincroniza de la primera en cuanto alguien actualiza
-- una sola. Aquí sale de la misma fuente, por construcción.
insert into country_risk_list
  (organization_id, iso2, nombre, nivel, fuente, vigente_desde, vigente_hasta, notas, plenario)
select '12121212-1212-1212-1212-121212121212',
       o.iso2, o.nombre, o.nivel, o.fuente, o.vigente_desde, o.vigente_hasta, o.notas, o.plenario
  from country_risk_list o
 where o.organization_id = '11111111-1111-1111-1111-111111111111'
   and o.fuente in ('gafi_gris', 'gafi_negra')
   and exists (select 1 from organizations
                where id = '12121212-1212-1212-1212-121212121212')
on conflict (organization_id, iso2, fuente, vigente_desde) do nothing;

-- ---------------------------------------------------------------------
-- Bitácora
-- ---------------------------------------------------------------------
do $$
declare
  v_notaria uuid := '12121212-1212-1212-1212-121212121212';
  v_gris    int;
  v_negra   int;
begin
  if not exists (select 1 from organizations where id = v_notaria) then
    return;
  end if;
  if exists (select 1 from evento_auditoria
              where organization_id = v_notaria and tipo = 'snapshot_gafi_fechado') then
    return;
  end if;

  select count(*) filter (where fuente = 'gafi_gris'),
         count(*) filter (where fuente = 'gafi_negra')
    into v_gris, v_negra
    from country_risk_list
   where organization_id = v_notaria and vigente_hasta is null;

  perform public.registrar_evento(
    v_notaria, 'snapshot_gafi_fechado', 'country_risk_list', null,
    jsonb_build_object(
      'defecto', 'La organización de la notaría no tenía NINGUNA fila de lista gris. El '
              || 'nivel «monitoreo intensificado» era inalcanzable para sus comparecientes: '
              || 'todo país extranjero que no fuera Irán o Corea del Norte volvía como «sin '
              || 'observaciones». No se veía como una falla, se veía como una respuesta.',
      'correccion', 'Se copió el snapshot que ya existe para Ixim Pay. No se inventó '
                 || 'ninguna clasificación de país: son las mismas filas, misma fuente y '
                 || 'misma vigencia.',
      'plenario', '2025-02, que es el corte REAL de lo sembrado (seed 04: «corte febrero '
               || '2025», dieciséis jurisdicciones en lista gris).',
      'por_que_no_2026_06', 'La Adenda dice que el estado vigente es el plenario de junio '
                         || 'de 2026, con veintiuna jurisdicciones bajo monitoreo. Lo '
                         || 'sembrado no es ése. Sellarlo con esa etiqueta haría el daño '
                         || 'que el versionado existe para evitar: calificar contra una '
                         || 'lista de hace año y medio afirmando que es la vigente.',
      'pendiente', 'Kawiil-Cumplimiento debe entregar el snapshot del plenario de junio de '
                || '2026 para cargarlo como versión nueva. Las filas de hoy se cerrarán con '
                || 'vigente_hasta, no se borrarán.',
      'gris_vigentes', v_gris,
      'negra_vigentes', v_negra
    ),
    'sistema', null
  );
end $$;

revoke insert, update, delete on country_risk_list from anon;

-- ---------------------------------------------------------------------
-- Comprobación antes de confirmar
-- ---------------------------------------------------------------------

-- 1. Las dos organizaciones tienen el mismo snapshot, y está fechado.
select organization_id, fuente, plenario, count(*)
  from country_risk_list
 where fuente in ('gafi_gris', 'gafi_negra') and vigente_hasta is null
 group by 1, 2, 3
 order by 1, 2;
-- Cada organización con lista negra Y lista gris, todas con plenario 2025-02.

-- 2. Ninguna fila del GAFI vigente sin plenario: una respuesta que no se puede
--    reconstruir es indefendible ante una verificación.
select count(*) as gafi_sin_plenario
  from country_risk_list
 where fuente in ('gafi_gris', 'gafi_negra') and vigente_hasta is null
   and plenario is null;
-- Debe ser 0.

-- 3. OFAC y paraísos fiscales NO llevan plenario: no se publican así, y
--    ponerles uno afirmaría algo falso sobre su origen.
select count(*) as no_gafi_con_plenario
  from country_risk_list
 where fuente not in ('gafi_gris', 'gafi_negra') and plenario is not null;
-- Debe ser 0.

commit;
