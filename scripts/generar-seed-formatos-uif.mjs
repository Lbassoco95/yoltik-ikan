/**
 * Genera `supabase/seed/24_formatos_oficiales_uif.sql` desde
 * `docs/formatos-uif/`.
 *
 * Regla inviolable: no corrige ni interpreta el JSON. Si el total de campos
 * no es 4008 o el de fracciones no es 250, aborta sin escribir nada.
 *
 * Uso: node scripts/generar-seed-formatos-uif.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'docs/formatos-uif';
const DESTINO = 'supabase/seed/24_formatos_oficiales_uif.sql';
const TOTAL_ESPERADO = 4008;
const FRACCIONES_ESPERADAS = 250;

const q = (s) => {
  if (s === null || s === undefined) return 'null';
  return `'${String(s).replace(/'/g, "''")}'`;
};

const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'));
const vig = index.vigencias;

/** Régimen de entrada por tipo de anexo (según README / index). */
function regimenDe(codigo) {
  // 14-A = avisos 24 h de comercio exterior → régimen dic_2026 (26 Bis…)
  if (codigo === '14-A') return 'dic_2026';
  return 'jun_2027';
}

function vigenteDesde(codigo) {
  if (codigo === '14-A') return vig.avisos_26bis_26bis1_26bis2_27_de_las_Reglas;
  return vig.general;
}

const anexos = index.anexos.slice().sort((a, b) =>
  String(a.anexo).localeCompare(String(b.anexo), 'es'),
);

let totalCampos = 0;
const bloquesFormato = [];
const bloquesCampos = [];

for (const meta of anexos) {
  const raw = JSON.parse(readFileSync(join(DIR, meta.archivo), 'utf8'));
  if (raw.total_campos !== meta.total_campos) {
    console.error(
      `${meta.archivo}: index dice ${meta.total_campos}, archivo dice ${raw.total_campos}`,
    );
    process.exit(1);
  }
  if (raw.campos.length !== meta.total_campos) {
    console.error(
      `${meta.archivo}: total_campos=${meta.total_campos} pero campos.length=${raw.campos.length}`,
    );
    process.exit(1);
  }
  totalCampos += raw.campos.length;

  const codigo = String(raw.anexo);
  const regimen = regimenDe(codigo);
  const desde = vigenteDesde(codigo);

  bloquesFormato.push(`
insert into formato_oficial (
  codigo_anexo, ambito, version, estado, regimen_entrada,
  vigente_desde, total_campos, archivo_origen, fuente
) values (
  ${q(codigo)},
  ${q(raw.ambito)},
  'dof-2026-09-24',
  'activo',
  '${regimen}',
  date ${q(desde)},
  ${raw.total_campos},
  ${q(meta.archivo)},
  ${q(index.fuente)}
)
on conflict (codigo_anexo, version) do update set
  ambito = excluded.ambito,
  estado = 'activo',
  regimen_entrada = excluded.regimen_entrada,
  vigente_desde = excluded.vigente_desde,
  total_campos = excluded.total_campos,
  archivo_origen = excluded.archivo_origen,
  fuente = excluded.fuente;`);

  // Borrar campos previos de esta versión para recarga idempotente limpia
  bloquesCampos.push(`
delete from formato_oficial_campo
 where formato_id = (
   select id from formato_oficial
    where codigo_anexo = ${q(codigo)} and version = 'dof-2026-09-24'
 );`);

  const filas = raw.campos.map((c) => {
    return `    (${c.orden}, ${q(c.numero)}, ${q(c.padre)}, ${q(c.nombre)}, ${q(c.etiqueta_xml)}, ${q(c.obligatoriedad)}, ${q(c.tipo_dato)}, ${q(c.longitud)}, ${q(c.formato)}, ${c.pagina_dof == null ? 'null' : Number(c.pagina_dof)})`;
  });

  // Insertar en lotes de 200 para no reventar el parser
  const TAM = 200;
  for (let i = 0; i < filas.length; i += TAM) {
    const slice = filas.slice(i, i + TAM);
    bloquesCampos.push(`
insert into formato_oficial_campo (
  formato_id, orden, numero, padre, nombre, etiqueta_xml,
  obligatoriedad, tipo_dato, longitud, formato, pagina_dof
)
select f.id, v.orden, v.numero, v.padre, v.nombre, v.etiqueta_xml,
       v.obligatoriedad, v.tipo_dato, v.longitud, v.formato, v.pagina_dof
from formato_oficial f
cross join (values
${slice.join(',\n')}
) as v(orden, numero, padre, nombre, etiqueta_xml, obligatoriedad, tipo_dato, longitud, formato, pagina_dof)
where f.codigo_anexo = ${q(codigo)} and f.version = 'dof-2026-09-24';`);
  }
}

if (totalCampos !== TOTAL_ESPERADO) {
  console.error(
    `ABORTADO: total de campos = ${totalCampos}, se esperaban ${TOTAL_ESPERADO}. Carga parcial prohibida.`,
  );
  process.exit(1);
}

const catalogo = JSON.parse(
  readFileSync(join(DIR, 'catalogo-anexo-A-fracciones-arancelarias.json'), 'utf8'),
);
if (catalogo.total !== FRACCIONES_ESPERADAS || catalogo.valores.length !== FRACCIONES_ESPERADAS) {
  console.error(
    `ABORTADO: fracciones = ${catalogo.valores.length} (total declarado ${catalogo.total}), se esperaban ${FRACCIONES_ESPERADAS}.`,
  );
  process.exit(1);
}

const fraccionesFilas = catalogo.valores.map((v, i) => {
  const clave = v.fraccion_arancelaria;
  const desc = v.descripcion;
  const orden = Number(v.no) || i + 1;
  return `    (${q(clave)}, ${q(desc)}, ${orden})`;
});

const bloquesFracciones = [];
bloquesFracciones.push(`
update catalogo_formato
   set version = catalogo_formato.version + 1,
       nombre = ${q(catalogo.catalogo || 'Anexo A — Fracciones arancelarias')},
       descripcion = ${q(catalogo.ambito || '')},
       fuente = 'dof'
 where codigo = 'anexo_a_fracciones_arancelarias';

-- Cierra vigencia anterior y recarga (idempotente por clave vigente)
update catalogo_formato_valor cv
   set vigente_hasta = current_date
  from catalogo_formato c
 where cv.catalogo_id = c.id
   and c.codigo = 'anexo_a_fracciones_arancelarias'
   and cv.vigente_hasta is null;
`);

const TAM_F = 100;
for (let i = 0; i < fraccionesFilas.length; i += TAM_F) {
  const slice = fraccionesFilas.slice(i, i + TAM_F);
  bloquesFracciones.push(`
insert into catalogo_formato_valor (catalogo_id, clave, descripcion, orden, version_carga, vigente_desde)
select c.id, v.clave, v.descripcion, v.orden, c.version, date '2026-09-24'
from catalogo_formato c
cross join (values
${slice.join(',\n')}
) as v(clave, descripcion, orden)
where c.codigo = 'anexo_a_fracciones_arancelarias';`);
}

// Verificar conteos al final del seed
const verificacion = `
-- Verificación dura: si no cuadra, falla la transacción del seed
do $verif$
declare
  v_campos int;
  v_frac int;
  v_anexos int;
begin
  select count(*) into v_campos
    from formato_oficial_campo c
    join formato_oficial f on f.id = c.formato_id
   where f.version = 'dof-2026-09-24' and f.estado = 'activo';

  select count(*) into v_anexos
    from formato_oficial
   where version = 'dof-2026-09-24' and estado = 'activo';

  select count(*) into v_frac
    from catalogo_formato_valor v
    join catalogo_formato c on c.id = v.catalogo_id
   where c.codigo = 'anexo_a_fracciones_arancelarias'
     and v.vigente_hasta is null;

  if v_campos <> ${TOTAL_ESPERADO} then
    raise exception 'Seed formatos UIF: campos=% (esperados ${TOTAL_ESPERADO}). Carga parcial prohibida.', v_campos;
  end if;
  if v_anexos <> ${anexos.length} then
    raise exception 'Seed formatos UIF: anexos activos=% (esperados ${anexos.length}).', v_anexos;
  end if;
  if v_frac <> ${FRACCIONES_ESPERADAS} then
    raise exception 'Seed formatos UIF: fracciones=% (esperadas ${FRACCIONES_ESPERADAS}).', v_frac;
  end if;

  raise notice 'Formatos UIF OK: % campos, % anexos, % fracciones Anexo A', v_campos, v_anexos, v_frac;
end
$verif$;
`;

// Ligar formato_id en perfiles demo cuando ya existan los formatos
const ligarPerfiles = `
update organizacion_actividad_vulnerable av
   set formato_id = f.id
  from formato_oficial f
 where av.codigo_anexo = f.codigo_anexo
   and f.version = 'dof-2026-09-24'
   and av.formato_id is distinct from f.id;
`;

const archivosPresentes = readdirSync(DIR)
  .filter((f) => f.startsWith('anexo-') && f.endsWith('.json'))
  .sort();

const salida = `-- =====================================================================
-- Seed 24 · Formatos oficiales UIF (DOF 24/09/2026)
-- =====================================================================
-- ARCHIVO GENERADO por scripts/generar-seed-formatos-uif.mjs — no editar a mano.
-- Fuente: docs/formatos-uif/ (${archivosPresentes.length} anexos JSON + Anexo A).
-- Extraído: ${index.extraido}. Método: ${index.metodo}.
-- Totales verificados al generar: ${totalCampos} campos, ${FRACCIONES_ESPERADAS} fracciones.
-- =====================================================================

begin;

${bloquesFormato.join('\n')}

${bloquesCampos.join('\n')}

${bloquesFracciones.join('\n')}

${ligarPerfiles}

${verificacion}

commit;
`;

writeFileSync(DESTINO, salida);
console.log(
  `OK → ${DESTINO}\n  anexos: ${anexos.length}\n  campos: ${totalCampos}\n  fracciones: ${FRACCIONES_ESPERADAS}`,
);
