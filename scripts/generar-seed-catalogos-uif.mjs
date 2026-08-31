/**
 * Genera `supabase/seed/14_catalogos_uif.sql`: los VALORES de los catálogos de
 * la UIF.
 *
 * De dónde salen: el SAT publica sus plantillas de captura de fe pública
 * (`Fedatario*.xlsm`) con una hoja oculta llamada `Combos` que contiene, tal
 * cual, los catálogos que el portal valida. Ahí estaban todo el tiempo. Se
 * extrajeron a `docs/catalogos-uif/catalogos_fep.json`, que guarda para cada
 * catálogo de qué archivo y de qué columna salió — sin esa procedencia, dentro
 * de un año nadie podría decir si una clave es del SAT o inventada.
 *
 * Este script sólo transforma ese JSON a SQL y valida que cada clave cumpla el
 * patrón declarado en el registro (seed 13). Si algo no cuadra, revienta: más
 * vale no generar el seed que generar uno con una clave que el portal rechaza.
 *
 * Uso:  node scripts/generar-seed-catalogos-uif.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ORIGEN = 'docs/catalogos-uif/catalogos_fep.json';
const REGISTRO = 'supabase/seed/13_catalogos_fep.sql';
const DESTINO = 'supabase/seed/14_catalogos_uif.sql';

const datos = JSON.parse(readFileSync(ORIGEN, 'utf8'));

// Patrones declarados en el registro, para validar antes de escribir.
const registro = readFileSync(REGISTRO, 'utf8');
const patrones = new Map(
  [...registro.matchAll(/\('([a-z0-9_]+)', '(?:[^']|'')*', 'fep', array\[[^\]]*\]::text\[\], (null|'[^']*'),/g)].map(
    (m) => [m[1], m[2] === 'null' ? null : m[2].slice(1, -1)],
  ),
);

const problemas = [];
for (const [codigo, info] of Object.entries(datos)) {
  if (!patrones.has(codigo)) {
    problemas.push(`${codigo}: no está registrado en el seed 13`);
    continue;
  }
  const patron = patrones.get(codigo);
  if (!patron) continue;
  const re = new RegExp(patron);
  for (const v of info.valores) {
    if (!re.test(v.clave)) problemas.push(`${codigo}: la clave "${v.clave}" no cumple ${patron}`);
  }
}
if (problemas.length) {
  console.error('No se generó el seed:\n  ' + problemas.join('\n  '));
  process.exit(1);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const bloques = Object.entries(datos)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([codigo, info]) => {
    const filas = info.valores
      .map((v, i) => `    (${q(v.clave)}, ${q(v.descripcion)}, ${i + 1})`)
      .join(',\n');
    return `-- ${codigo} · ${info.valores.length} valores · ${info.origen}, hoja ${info.hoja}, columna ${info.columna}
insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
${filas}
) as v(clave, descripcion, orden)
where c.codigo = ${q(codigo)}
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );`;
  });

const codigos = Object.keys(datos).sort();
const total = Object.values(datos).reduce((n, i) => n + i.valores.length, 0);

const salida = `-- =====================================================================
-- Seed 14 · Valores de los catálogos de la UIF (layout de fe pública)
-- =====================================================================
-- ARCHIVO GENERADO — no editar a mano.
-- Regenerar con: node scripts/generar-seed-catalogos-uif.mjs
-- Datos y procedencia: docs/catalogos-uif/catalogos_fep.json
--
-- ${codigos.length} catálogos, ${total} valores. Ninguno inventado: todos salen de la
-- hoja oculta \`Combos\` de las plantillas de captura que publica el SAT
-- (Fedatario*.xlsm), que es la lista contra la que valida el portal. Cada
-- bloque dice de qué archivo y de qué columna salió.
--
-- Requiere el seed 13 aplicado (registro de los catálogos).
-- Es idempotente: no duplica valores ya vigentes.
-- =====================================================================

${bloques.join('\n\n')}

-- Marca como cargados los catálogos que quedaron con valores.
update catalogo_sat c
   set version = greatest(c.version, 1),
       actualizado_en = coalesce(c.actualizado_en, now())
 where c.codigo in (${codigos.map(q).join(', ')})
   and exists (select 1 from catalogo_valor v where v.catalogo_id = c.id and v.vigente_hasta is null);
`;

writeFileSync(DESTINO, salida);
console.log(`${DESTINO}: ${codigos.length} catálogos, ${total} valores`);
