-- =====================================================================
-- 0068 · Se retira workflow_version: el proveedor no la da
-- =====================================================================
-- La 0063 añadió `workflow_version` con un propósito correcto —poder
-- reconstruir QUÉ se le practicó a una persona, porque el mismo workflow con
-- AML apagado y encendido produce expedientes distintos— pero con un supuesto
-- que no se comprobó contra el proveedor: que Didit dijera en qué versión del
-- flujo corrió cada sesión.
--
-- No la dice. Comprobado hoy contra las respuestas reales de producción, no
-- contra lo que suponíamos:
--   · la decisión (`/v3/session/{id}/decision/`) devuelve `workflow_id`, el
--     identificador ESTABLE, y ningún campo de versión;
--   · el objeto de sesión del listado tampoco: `workflow_label` y
--     `workflow_type` vienen en null y no hay versión en ninguna parte.
--
-- La aplicación crea las sesiones con el `workflow_id` estable a propósito
-- —así toma sola la última versión publicada, sin desplegar nada— y ese id no
-- identifica una versión. Así que la columna sólo se podía llenar de tres
-- maneras, y las tres son peores que no tenerla:
--   1. consultando el workflow a Didit en cada alta, metiendo una segunda
--      llamada de red en el camino que le da la liga al compareciente;
--   2. con una cifra en configuración, que se queda vieja en silencio la
--      primera vez que alguien publique una versión desde la consola;
--   3. dejándola en null para siempre, que es lo que estaba pasando: null en
--      las dos verificaciones existentes, y una trampa para el siguiente que
--      consulte esta tabla y lea el hueco como «se perdió el dato».
--
-- Y no hace falta, porque la pregunta que la 0063 quería contestar ya la
-- contesta `features_aplicadas`, que sí se llena desde la decisión y lo hace
-- mejor: dice los módulos por su nombre —ID_VERIFICATION, LIVENESS,
-- FACE_MATCH, AML, DATABASE_VALIDATION, IP_ANALYSIS— en vez de un número que
-- obligaría a entrar a la consola del proveedor a averiguar qué contenía la
-- «versión 2». Para un expediente que hay que poder enseñar en una visita de
-- verificación, la lista de módulos es la evidencia; el número de versión es
-- una referencia a algo que vive fuera.
--
-- Nadie la leía: no aparece en el front más que en los tipos generados.
-- =====================================================================

alter table verificacion_identidad
  drop column if exists workflow_version;

comment on column verificacion_identidad.features_aplicadas is
  'Qué módulos corrieron REALMENTE en esta sesión, según la decisión del '
  'proveedor. No los que el workflow tiene hoy: un módulo encendido después no '
  'se le practicó a quien se verificó antes. Es también la única forma que '
  'tenemos de saber en qué versión del flujo corrió una sesión, porque Didit '
  'no devuelve la versión en ninguna de sus respuestas (ver 0067).';
