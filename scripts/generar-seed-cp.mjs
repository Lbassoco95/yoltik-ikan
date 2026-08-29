/**
 * Parte `docs/catalogos-uif/codigos_postales.csv` en varios archivos SQL que sí
 * caben en el SQL Editor de Supabase.
 *
 * Existe porque el catálogo de códigos postales trae 32,353 valores: como un
 * solo archivo son más de un megabyte y medio de SQL, que el editor del
 * navegador no traga cómodo. La alternativa —cargarlo desde la consola de
 * plataforma— es mejor, pero requiere que la consola esté desplegada; esto
 * funciona con nada más que el SQL Editor.
 *
 * Uso:  node scripts/generar-seed-cp.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ORIGEN = 'docs/catalogos-uif/codigos_postales.csv';
const POR_ARCHIVO = 8500;
const CODIGO = 'codigos_postales_de_sepomex';

const lineas = readFileSync(ORIGEN, 'utf8').split('\n').slice(1).filter((l) => l.trim());
const valores = lineas.map((l) => {
  // El CSV lo generamos nosotros: clave sin comas, descripción entrecomillada
  // sólo si la trae. Se parte por la PRIMERA coma.
  const i = l.indexOf(',');
  const clave = l.slice(0, i).trim();
  let desc = l.slice(i + 1).trim();
  if (desc.startsWith('"') && desc.endsWith('"')) desc = desc.slice(1, -1).replace(/""/g, '"');
  return { clave, desc };
});

if (!valores.every((v) => /^\d{5}$/.test(v.clave))) {
  console.error('Hay claves que no son de cinco dígitos: no se genera nada.');
  process.exit(1);
}

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const partes = Math.ceil(valores.length / POR_ARCHIVO);

for (let p = 0; p < partes; p++) {
  const lote = valores.slice(p * POR_ARCHIVO, (p + 1) * POR_ARCHIVO);
  const filas = lote
    .map((v, i) => `  (${q(v.clave)}, ${q(v.desc)}, ${p * POR_ARCHIVO + i + 1})`)
    .join(',\n');

  const ultima = p === partes - 1;
  const sql = `-- =====================================================================
-- Ikán · Códigos postales SEPOMEX — parte ${p + 1} de ${partes}
-- =====================================================================
-- ARCHIVO GENERADO — no editar a mano.
-- Regenerar con: node scripts/generar-seed-cp.mjs
--
-- Corre las ${partes} partes EN ORDEN, cada una en un envío. Son idempotentes:
-- volver a correr una no duplica nada.
--
-- Requiere el bundle apply_0020_catalogos.sql ya aplicado.
--
-- Fuente: catálogo SEPOMEX (archivo Cata_logo_CP.xls). Se usa éste y no la
-- columna de la plantilla del SAT porque a esa Excel le comió los ceros a la
-- izquierda: trae "1000" donde debe decir "01000".
-- =====================================================================

insert into catalogo_valor (catalogo_id, clave, descripcion, orden, version_carga)
select c.id, v.clave, v.descripcion, v.orden, 1
from catalogo_sat c
cross join (values
${filas}
) as v(clave, descripcion, orden)
where c.codigo = ${q(CODIGO)}
  and not exists (
    select 1 from catalogo_valor cv
    where cv.catalogo_id = c.id and cv.clave = v.clave and cv.vigente_hasta is null
  );
${
  ultima
    ? `
-- Última parte: marca el catálogo como cargado y comprueba la cuenta.
update catalogo_sat
   set version = greatest(version, 1), actualizado_en = coalesce(actualizado_en, now()),
       notas = 'Catálogo SEPOMEX cargado por partes desde el SQL Editor.'
 where codigo = ${q(CODIGO)};

do $$
declare v_n int;
begin
  select valores_vigentes into v_n from v_catalogos_estado where codigo = ${q(CODIGO)};
  if v_n <> ${valores.length} then
    raise exception 'Quedaron % códigos postales de ${valores.length}: falta correr alguna parte', v_n;
  end if;
  if not public.clave_valida_en_catalogo(${q(CODIGO)}, '01000') then
    raise exception 'El 01000 perdió el cero de la izquierda';
  end if;
  raise notice 'OK · % códigos postales cargados', v_n;
end $$;
`
    : ''
}`;

  writeFileSync(`supabase/manual/cargar_cp_${p + 1}.sql`, sql);
}

console.log(`${valores.length} códigos postales en ${partes} archivos`);
