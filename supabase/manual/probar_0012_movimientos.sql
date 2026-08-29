-- ============================================================
-- Prueba · Ciclo de altas y bajas (migration 0012)
-- ============================================================
-- Seguro de correr en el SQL Editor: TODO va dentro de una transacción que
-- termina en ROLLBACK. No deja ni una fila. Datos ficticios.
--
-- Comprueba lo que pediste: cargar personas con nombre, RFC y número de
-- oficio, y poder darlas de baja después.
-- ============================================================
begin;

-- --- Carga 1: oficio de bloqueo ---
insert into lista_carga (id, fuente_id, tipo, estado, fecha_publicacion_fuente, notas)
select 'aaaaaaaa-0000-0000-0000-000000000001', id, 'captura_manual', 'aplicada',
       date '2026-03-10', 'PRUEBA — oficio de bloqueo'
from lista_fuente where codigo = 'uif_bloqueadas';

insert into lista_movimiento (carga_id, accion, nombre, rfc, oficio_numero, oficio_fecha, motivo)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alta',
   'Juan Ramírez Peña (PRUEBA)', 'rapj800101ab1', '110-05/2026-0341', date '2026-03-10', 'Bloqueo'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alta',
   'María de la Cruz Sánchez (PRUEBA)', null, '110-05/2026-0342', date '2026-03-10', 'Bloqueo');

\echo '1. Dos altas · el RFC se normaliza a mayúsculas'
select nombre, rfc, activo, alta_oficio from lista_registro where nombre like '%(PRUEBA)%' order by nombre;

-- --- Carga 2: oficio de desbloqueo ---
-- El nombre va SIN acentos y el RFC en mayúsculas, a propósito: debe cotejar igual.
insert into lista_carga (id, fuente_id, tipo, estado, fecha_publicacion_fuente, notas)
select 'aaaaaaaa-0000-0000-0000-000000000002', id, 'captura_manual', 'aplicada',
       date '2026-06-20', 'PRUEBA — oficio de desbloqueo'
from lista_fuente where codigo = 'uif_bloqueadas';

insert into lista_movimiento (carga_id, accion, nombre, rfc, oficio_numero, oficio_fecha, motivo)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'baja',
        'Juan Ramirez Pena (PRUEBA)', 'RAPJ800101AB1', '110-05/2026-0899', date '2026-06-20', 'Desbloqueo');

\echo '2. Baja aplicada · la fila se conserva, sale de vigentes'
select nombre, activo, alta_oficio, baja_oficio, baja_fecha
from lista_registro where nombre like '%(PRUEBA)%' order by nombre;

\echo '3. La evidencia histórica: alta 10/mar, baja 20/jun'
select public.listado_en_fecha('uif_bloqueadas', date '2026-02-01', 'RAPJ800101AB1') as "01/feb (antes)",
       public.listado_en_fecha('uif_bloqueadas', date '2026-04-15', 'RAPJ800101AB1') as "15/abr (bloqueado)",
       public.listado_en_fecha('uif_bloqueadas', date '2026-07-01', 'RAPJ800101AB1') as "01/jul (liberado)";

\echo '4. Bitácora con los oficios que respaldan cada movimiento'
select m.accion, m.oficio_numero, m.oficio_fecha
from lista_movimiento m join lista_registro r on r.id = m.registro_id
where r.rfc = 'RAPJ800101AB1' order by m.oficio_fecha;

\echo '5. Una baja sin alta previa se rechaza (debe salir ERROR abajo)'
savepoint s1;
insert into lista_movimiento (carga_id, accion, nombre, oficio_numero)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'baja', 'Nadie Inexistente', 'X-1');
rollback to savepoint s1;

\echo '6. La bitácora no se puede alterar (debe salir ERROR abajo)'
savepoint s2;
update lista_movimiento set oficio_numero = 'ALTERADO' where oficio_numero = '110-05/2026-0341';
rollback to savepoint s2;

rollback;

\echo '=== ROLLBACK hecho · no quedó ninguna fila de prueba ==='
select count(*) as filas_de_prueba_restantes from lista_registro where nombre like '%(PRUEBA)%';
