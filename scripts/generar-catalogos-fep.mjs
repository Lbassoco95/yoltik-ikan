/**
 * Genera `supabase/seed/13_catalogos_fep.sql`: el REGISTRO de los catálogos que
 * el layout de fe pública referencia.
 *
 * Registra, no carga. Los catálogos de la UIF son archivos aparte que el
 * instructivo cita pero no incluye, así que aquí sólo queda constancia de que
 * existen, qué campos los usan y qué forma tiene su clave — todo eso sí sale
 * del instructivo. Los valores los carga Kawiil desde la consola.
 *
 * Uso:  node scripts/generar-catalogos-fep.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const DESTINO = 'supabase/seed/13_catalogos_fep.sql';

// El diccionario ya generado es la fuente: así el registro no se desincroniza
// del instructivo cuando el SAT publique una versión nueva del layout.
const dicc = readFileSync('src/lib/aviso/campos-fep.generated.ts', 'utf8');
const filas = [
  ...dicc.matchAll(
    /\{ no: "(.*?)", etiqueta: "(.*?)", nombre: "(.*?)", obligatorio: (?:true|false), tipo: "(.*?)", longitud: "(.*?)", formato: ".*?", catalogo: (null|".*?") \}/g,
  ),
].map((m) => ({
  no: m[1],
  etiqueta: m[2],
  nombre: m[3],
  tipo: m[4],
  longitud: m[5],
  catalogo: m[6] === 'null' ? null : m[6].slice(1, -1),
}));

const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const slug = (s) =>
  sinAcentos(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** El patrón de la clave sale del par (tipo de dato, longitud) del instructivo. */
function patronClave(tipo, longitudes) {
  const clase = /Numérico/i.test(tipo)
    ? '0-9'
    : /Alfabético/i.test(tipo)
      ? 'A-Z'
      : 'A-Z0-9';
  let min = Infinity;
  let max = 0;
  for (const l of longitudes) {
    const m = String(l).match(/(\d+)(?:\s*-\s*(\d+))?/);
    if (!m) continue;
    min = Math.min(min, Number(m[1]));
    max = Math.max(max, Number(m[2] ?? m[1]));
  }
  if (!Number.isFinite(min) || max === 0) return null;
  return min === max ? `^[${clase}]{${min}}$` : `^[${clase}]{${min},${max}}$`;
}

const CENTINELA = 'catálogo de la UIF (sin nombre en el instructivo)';

// Agrupa por catálogo. El nombre se normaliza sin acentos para que las dos
// grafías de "MOTIVO COSNTITUCION MODIFICACION" del original —una acentuada y
// otra no, ambas con la misma errata— caigan en el mismo catálogo.
const porCatalogo = new Map();
for (const f of filas) {
  if (!f.catalogo || f.tipo === 'Etiqueta') continue;
  // El centinela no nombra un catálogo: agrupa campos que citan "el catálogo de
  // la UIF" sin decir cuál. Se registra uno por campo, con nota, en vez de
  // fundirlos: suponer que comparten catálogo sería inventar.
  const claveGrupo =
    f.catalogo === CENTINELA ? `__sin_nombre__${f.etiqueta}` : slug(f.catalogo).toUpperCase();
  if (!porCatalogo.has(claveGrupo)) {
    porCatalogo.set(claveGrupo, {
      codigo: f.catalogo === CENTINELA ? slug(f.etiqueta) : slug(f.catalogo),
      nombre: f.catalogo === CENTINELA ? `Catálogo de <${f.etiqueta}>` : f.catalogo,
      sinNombre: f.catalogo === CENTINELA,
      etiquetas: new Set(),
      longitudes: new Set(),
      tipo: f.tipo,
      campos: new Set(),
    });
  }
  const g = porCatalogo.get(claveGrupo);
  g.etiquetas.add(f.etiqueta);
  g.longitudes.add(f.longitud);
  g.campos.add(f.no);
}

const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const arr = (xs) => `array[${[...xs].sort().map(q).join(', ')}]::text[]`;

const filasSql = [...porCatalogo.values()]
  .sort((a, b) => a.codigo.localeCompare(b.codigo))
  .map((g) => {
    const patron = patronClave(g.tipo, g.longitudes);
    const notas = g.sinNombre
      ? 'El instructivo cita "el catálogo provisto por la UIF" sin nombrarlo. Al cargarlo, verificar si coincide con otro ya registrado.'
      : `Referenciado por ${g.campos.size} campo(s) del instructivo.`;
    return `  (${q(g.codigo)}, ${q(g.nombre)}, 'fep', ${arr(g.etiquetas)}, ${q(patron)}, 'uif', ${q(notas)})`;
  });

// Único catálogo con valores en el propio instructivo: el resto son archivos
// externos que no tenemos y que no se inventan.
const salida = `-- =====================================================================
-- Seed 13 · Registro de los catálogos del layout de fe pública
-- =====================================================================
-- ARCHIVO GENERADO — no editar a mano.
-- Regenerar con: node scripts/generar-catalogos-fep.mjs
--
-- REGISTRA los catálogos, no los CARGA. Los archivos de catálogo de la UIF no
-- vienen en el instructivo; aquí sólo queda constancia de cuáles existen, qué
-- campos los usan y qué forma tiene su clave. Quedan en version = 0 (sin
-- valores) hasta que Kawiil los cargue desde la consola de plataforma.
--
-- La única excepción es 'prioridad': el instructivo sí enumera sus dos valores
-- (campo 3.3), así que se siembra.
-- =====================================================================

insert into catalogo_sat (codigo, nombre, layout, etiquetas_layout, clave_patron, fuente, notas)
values
${filasSql.join(',\n')}
on conflict (codigo) do update set
  nombre = excluded.nombre,
  etiquetas_layout = excluded.etiquetas_layout,
  clave_patron = excluded.clave_patron,
  notas = excluded.notas;

-- Prioridad del aviso — campo 3.3. Valores tomados literalmente del
-- instructivo: "1 - Normal. 2 - 24 hrs. con operaciones".
insert into catalogo_sat (codigo, nombre, layout, etiquetas_layout, clave_patron, fuente, notas)
values ('prioridad', 'Prioridad de aviso', 'fep', array['prioridad']::text[], '^[0-9]$',
        'instructivo_fep', 'Único catálogo cuyos valores enumera el propio instructivo (campo 3.3).')
on conflict (codigo) do nothing;

insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values ('1', 'Normal', 1), ('2', '24 hrs. con operaciones', 2))
     as v(clave, descripcion, orden)
where c.codigo = 'prioridad'
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );

update catalogo_sat
   set version = greatest(version, 1), actualizado_en = coalesce(actualizado_en, now())
 where codigo = 'prioridad' and version = 0;
`;

writeFileSync(DESTINO, salida);
console.log(`${DESTINO}: ${porCatalogo.size} catálogos registrados + prioridad sembrado`);
