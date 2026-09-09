-- =====================================================================
-- Seed · Catálogo de fuentes de listas
-- =====================================================================
-- Requiere la migration 0012.
--
-- Siembra SÓLO el catálogo de qué listas existen y cómo se actualizan.
-- NO siembra ni una persona: los registros entran por carga en la consola
-- de Kawiil, con su oficio o su archivo. Sembrar personas inventadas en una
-- lista restrictiva sería lo peor que podría hacer este repo.
--
-- `frecuencia_objetivo` es PROPUESTA TÉCNICA, no valor regulatorio. La
-- confirma Kawiil-Cumplimiento antes de fijar cualquier job.
-- =====================================================================

insert into lista_fuente
  (codigo, nombre, autoridad, naturaleza, modo_actualizacion, url_oficial,
   frecuencia_objetivo, obligatoria, activa, notas)
values
  ('uif_bloqueadas', 'Lista de Personas Bloqueadas',
   'UIF · Secretaría de Hacienda y Crédito Público',
   'sancion_aml', 'movimientos',
   null, 'Por oficio, sin periodicidad fija', true, true,
   -- OJO con lo que decía este renglón: afirmaba que «el Art. 18 fr. V LFPIORPI obliga
   -- a consultar» esta lista. No es cierto —esa fracción es sobre brindar facilidades
   -- para las visitas de verificación— y la Célula de Cumplimiento lo cazó (Nota 4).
   -- La fuente entra aquí para conservar el histórico del catálogo y la 0071 la retira
   -- con su determinación; no se corrige el hecho de que existió, se corrige la
   -- afirmación de derecho.
   'No publica un archivo que se reemplace: emite oficios de alta y de baja. RETIRADA del '
   'catálogo por la migration 0071: no obliga a Actividades Vulnerables, obliga a '
   'Entidades Financieras. Ver el fundamento en esa migration.'),

  -- OFAC son DOS listas y hasta la 0071 eran una sola fuente. Se declaran las dos
  -- aquí para que un proyecto nuevo nazca ya partido: con una sola fuente ninguna
  -- carga podía declararse completa sin dar de baja los registros de la otra.
  ('ofac_sdn', 'OFAC · Lista SDN (Specially Designated Nationals)',
   'Departamento del Tesoro de Estados Unidos',
   'sancion_aml', 'snapshot',
   'https://sanctionslist.ofac.treas.gov/Home/SdnList',
   'Al cambio que publique el Tesoro. Archivo SDN_ENHANCED.XML.', true, true,
   'Archivo completo y gratuito, sin autenticación. La carga nueva reemplaza el estado: lo que ya no viene se desactiva. El SDN_ENHANCED.XML pesa 104 MB y no cabe por el navegador.'),

  ('ofac_consolidada', 'OFAC · Lista Consolidada (programas no-SDN)',
   'Departamento del Tesoro de Estados Unidos',
   'sancion_aml', 'snapshot',
   'https://sanctionslist.ofac.treas.gov/Home/ConsolidatedList',
   'Al cambio que publique el Tesoro. Archivo CONS_ENHANCED.XML.', true, true,
   'La segunda publicación de OFAC: los programas de sanciones que NO son SDN. 481 registros contra 19,365 de la SDN, así que sirve para probar el camino completo de carga antes de meter la grande. Instrucción 292.'),

  ('onu_consolidada', 'ONU · Lista consolidada',
   'Consejo de Seguridad de las Naciones Unidas',
   'sancion_aml', 'snapshot',
   'https://scsanctions.un.org/', 'PENDIENTE_CONFIRMAR', true, true,
   'Documentada como próxima fuente a automatizar. Activa en el catálogo para que exista el contrato; sin registros hasta que se implemente su ingesta.'),

  ('ue_sanciones', 'Unión Europea · Lista consolidada de sanciones',
   'Servicio Europeo de Acción Exterior',
   'sancion_aml', 'snapshot',
   null, 'PENDIENTE_CONFIRMAR', false, true,
   'Documentada como próxima fuente. No obligatoria mientras Kawiil-Cumplimiento no determine lo contrario.'),

  ('sat_69b', 'SAT · Listado 69-B (EFOS y EDOS)',
   'Servicio de Administración Tributaria',
   'fiscal', 'snapshot',
   'http://omawww.sat.gob.mx/cifras_sat/Paginas/datos/vinculo.html?page=ListCompleta69B.html',
   'PENDIENTE_CONFIRMAR', true, true,
   'Naturaleza FISCAL, no sanción de lavado: son contribuyentes con operaciones presuntamente simuladas. Se marca así a propósito para que el OC no trate un EFOS como si fuera un sancionado OFAC.'),

  ('interna', 'Lista interna del sujeto obligado',
   'La propia organización',
   'interna', 'movimientos',
   null, 'Cuando la organización lo determine', false, true,
   'Reservada para que cada organización registre a quien haya rechazado por su cuenta. Pendiente de habilitar: hoy sólo Kawiil escribe, y esta fuente necesita alcance por organización.')
on conflict (codigo) do update set
  nombre = excluded.nombre,
  autoridad = excluded.autoridad,
  naturaleza = excluded.naturaleza,
  modo_actualizacion = excluded.modo_actualizacion,
  url_oficial = excluded.url_oficial,
  frecuencia_objetivo = excluded.frecuencia_objetivo,
  obligatoria = excluded.obligatoria,
  notas = excluded.notas;
