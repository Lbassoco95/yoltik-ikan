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
   'No publica un archivo que se reemplace: emite oficios de alta y de baja. Se captura en la consola de Kawiil, un movimiento por oficio. Es la lista que el Art. 18 fr. V LFPIORPI obliga a consultar y la que NINGÚN proveedor internacional cubre.'),

  ('ofac_sdn', 'OFAC · Specially Designated Nationals',
   'Departamento del Tesoro de Estados Unidos',
   'sancion_aml', 'snapshot',
   'https://sanctionslistservice.ofac.treas.gov/', 'PENDIENTE_CONFIRMAR (propuesta: diaria)', true, true,
   'Archivo completo y gratuito, sin autenticación. La carga nueva reemplaza el estado: lo que ya no viene se desactiva.'),

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
