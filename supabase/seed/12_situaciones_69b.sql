-- =====================================================================
-- Seed · Situaciones del listado 69-B del SAT
-- =====================================================================
-- Requiere la migration 0014.
--
-- El SAT publica listados DIFERENCIADOS por situación jurídica. Las cuatro
-- se ingieren; sólo una genera hallazgo.
--
-- Fuente de los estados: portal de Datos Abiertos del SAT, artículo 69-B
-- (omawww.sat.gob.mx/tramitesyservicios/Paginas/datos_abiertos_articulo69b.htm).
-- Cifras de referencia a 2026, de fuentes secundarias, sólo para dimensionar:
-- ~5,539 RFC en total — 4,558 definitivos, 282 presuntos, 139 desvirtuados,
-- 560 con sentencia favorable. NO se siembra ningún RFC: los registros entran
-- por carga, nunca por seed.
--
-- Por qué sólo 'definitivo' bloquea:
--   · presunto            tiene plazo legal para desvirtuar. Presentarlo como
--                         EFOS confirmado sería falso. Se conserva como señal
--                         para debida diligencia reforzada.
--   · desvirtuado         demostró que sus operaciones eran reales. Es la
--   · sentencia_favorable prueba de que NO es EFOS, y por eso se guarda: sin
--                         ella no se podría explicar por qué alguien dejó de
--                         marcar.
--
-- PENDIENTE_CONFIRMAR con Kawiil-Cumplimiento: si un presunto debe además
-- disparar alguna medida, y no sólo mostrarse.
-- =====================================================================

update lista_fuente
   set situaciones = array['presunto', 'definitivo', 'desvirtuado', 'sentencia_favorable'],
       situaciones_bloqueantes = array['definitivo'],
       url_oficial = 'http://omawww.sat.gob.mx/tramitesyservicios/Paginas/datos_abiertos_articulo69b.htm',
       frecuencia_objetivo = 'PENDIENTE_CONFIRMAR (el SAT publica en general trimestral)',
       notas = 'Naturaleza FISCAL, no sanción de lavado: son contribuyentes con operaciones presuntamente simuladas. '
               'Se marca así a propósito para que el OC no trate un EFOS como si fuera un sancionado OFAC. '
               'Se ingieren las cuatro situaciones; sólo "definitivo" genera hallazgo. No hay API: el SAT publica CSV '
               'en su portal de Datos Abiertos.'
 where codigo = 'sat_69b';

-- La lista de la UIF no maneja situaciones: estar bloqueado es el único
-- estado. Se deja explícito para que el trigger rechace etiquetas inventadas.
update lista_fuente
   set situaciones = null,
       situaciones_bloqueantes = null
 where codigo in ('uif_bloqueadas', 'ofac_sdn', 'onu_consolidada', 'ue_sanciones');

-- =====================================================================
-- 69-B Bis · fuente SEPARADA, no una situación más del 69-B
-- =====================================================================
-- Son artículos DISTINTOS del Código Fiscal y mezclarlos sería un error de
-- fondo, no de forma:
--
--   69-B      operaciones inexistentes (EFOS). El contribuyente expidió
--             comprobantes sin activos, personal o infraestructura.
--   69-B Bis  transmisión indebida de pérdidas fiscales. Otro supuesto,
--             otro procedimiento y otras consecuencias.
--
-- El listado del Bis sólo contempla DOS situaciones —definitivo y sentencia
-- favorable—: su procedimiento no publica presuntos ni desvirtuados, como se
-- ve en las columnas del propio archivo del SAT.
--
-- Es una lista muy corta (unidades, no miles) pero eso no la hace menos
-- relevante: quien aparece ahí lo hace por transmitir pérdidas indebidamente.
insert into lista_fuente
  (codigo, nombre, autoridad, naturaleza, modo_actualizacion, url_oficial,
   frecuencia_objetivo, obligatoria, activa, situaciones, situaciones_bloqueantes, notas)
values
  ('sat_69b_bis', 'SAT · Listado 69-B Bis (transmisión indebida de pérdidas fiscales)',
   'Servicio de Administración Tributaria',
   'fiscal', 'snapshot',
   'http://omawww.sat.gob.mx/tramitesyservicios/Paginas/datos_abiertos_articulo69b.htm',
   'PENDIENTE_CONFIRMAR (el SAT publica sin periodicidad fija)',
   true, true,
   array['definitivo', 'sentencia_favorable'],
   array['definitivo'],
   'Artículo 69-B Bis del CFF: transmisión indebida de pérdidas fiscales. NO es lo mismo que el 69-B '
   '(operaciones inexistentes) y por eso es una fuente aparte. Su procedimiento sólo publica definitivos '
   'y sentencias favorables. Mismo formato de archivo que el 69-B: CSV en latin-1 con extensión .xls.')
on conflict (codigo) do update set
  nombre = excluded.nombre,
  naturaleza = excluded.naturaleza,
  modo_actualizacion = excluded.modo_actualizacion,
  url_oficial = excluded.url_oficial,
  situaciones = excluded.situaciones,
  situaciones_bloqueantes = excluded.situaciones_bloqueantes,
  notas = excluded.notas;
