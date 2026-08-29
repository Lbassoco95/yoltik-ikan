# Layouts de aviso · Fracción XII (fe pública)

> Fuente: plantillas y instructivo publicados por el SAT para el SPPLD.
> Archivos originales aportados por Polo el 2026-08-29.

## Qué hay aquí

| Archivo | Qué es |
|---|---|
| `instructivo_fep_campos.csv` | **518 campos** del layout, extraídos del `instructivo_fep.xlsx`. Es la fuente de verdad de la estructura del aviso, en CSV para que un cambio del SAT se vea en un diff. |
| `tipos_acto_fep.json` | Los **10 tipos de acto** con su etiqueta XML, extraídos de la rama `3.6.1.3` del instructivo. |

Los `.xlsm` originales no se versionan: pesan ~150 KB cada uno, llevan macros
(`vbaProject.bin`) y su contenido útil ya está extraído aquí. Se conservan
fuera del repo.

## Cómo se envía un aviso

XML validado contra el esquema de fe pública, subido al portal SPPLD **antes
del día 17** del mes siguiente. Estructura de primer nivel:

```
<archivo>
  <informe>
    <mes_reportado>            AAAAMM
    <sujeto_obligado>          clave de entidad colegiada, clave del SO,
                               clave de actividad, <exento>
    <aviso>
      <referencia_aviso>
      <modificatorio>          folio previo + descripción, si corrige otro
      <prioridad>
      <alerta>                 tipo (catálogo numérico del SAT) + descripción
      <persona_aviso>          quien solicita la formalización
      <detalle_operaciones>
        <datos_operacion>      instrumento público, fecha, tipo de actividad
```

## Los diez tipos de acto

El SAT publica **una plantilla por tipo**, y la etiqueta XML es la que decide
cómo se arma el `<tipo_actividad>`:

| Etiqueta XML | Acto | Plantilla |
|---|---|---|
| `otorgamiento_poder` | Poder irrevocable para actos de administración o dominio | `FedatarioPoder_v4_3` |
| `constitucion_personas_morales` | Constitución de personas morales | `FedatarioConstitucionPM_v4_4` |
| `modificacion_patrimonial` | Aumento o disminución de capital | `FedatarioModifPatrimonial_v4_4` |
| `fusion` | Fusión | `FedatarioFusion_v4_3` |
| `escision` | Escisión | `FedatarioEscision_v4_3` |
| `compra_venta_acciones` | Compraventa de acciones o partes sociales | `FedatarioCompraVenta_v4_3` |
| `constitucion_modificacion_fideicomiso` | Fideicomiso traslativo de dominio o garantía | `FedatarioConstitucionFid_v4_8` |
| `cesion_derechos_fideicomitente_fideicomisario` | Cesión de derechos de fideicomiso | `FedatarioCesion_v4_3` |
| `contrato_mutuo_credito` | Mutuo o crédito, con o sin garantía | `FedatarioMutuo_v4_4` |
| `avaluo` | Realización de avalúos | `FedatarioAvaluo_v4_3` |

Las versiones **no son uniformes** (v4_3, v4_4, v4_8), o sea que el SAT las
actualiza por separado. El generador tiene que saber con qué versión se armó
cada aviso.

### El error más fácil de cometer

**La transmisión de inmuebles no tiene etiqueta propia.** El artículo 17
fracción XII la menciona primero, y es natural buscarla como tipo de acto —
pero el layout no la tiene: se reporta a través del acto que la instrumenta
(compraventa, fideicomiso, mutuo con garantía).

El catálogo anterior del repo tenía cuatro actos inventados
(`compraventa_inmueble`, `fideicomiso`) que no existen en el layout. Un aviso
generado con ellos habría fallado la validación **en el portal, el día 17**.

### Notario y corredor no hacen lo mismo

El corredor público no otorga poderes irrevocables ni transmite inmuebles; el
notario no realiza avalúos como actividad vulnerable. `TIPOS_ACTO_NOTARIA`
marca cada acto con quién lo puede instrumentar.

## Los dos canales del notario

Un notario **no reporta por un solo sistema**. Confundirlos hace que crea que ya
cumplió cuando no lo hizo.

| | SPPLD · aviso PLD | DeclaraNOT |
|---|---|---|
| **Qué** | Los 10 actos del layout de fe pública | Transmisión o constitución de derechos reales sobre inmuebles |
| **Formato** | XML contra el layout `fep` | **TXT delimitado por pipe, UTF-8, CRLF** |
| **Plazo** | Día 17 del mes siguiente | **15 días naturales tras la firma** |
| **Periodicidad** | Mensual, agregado | **Por acto** |
| **Fundamento** | LFPIORPI art. 17 fr. XII | **CFF art. 27 fr. V** |
| **Tipos** | 10 etiquetas XML | 24 enajenación · 25 adquisición · 26 omisión PM · 27 socios |

La diferencia de plazo es la que muerde: DeclaraNOT corre **por acto y a 15
días**, así que un notario puede estar al corriente en el SPPLD y vencido en
DeclaraNOT sin enterarse. El aviso mensual del SPPLD **no** reporta esas
operaciones, y la plataforma tiene que decirlo cuando las haya.

`PENDIENTE`: el generador de DeclaraNOT necesita el «Manual para la creación de
archivos TXT» del SAT. Es otro formato y otro bloque.

## Informe en ceros

`0InformeEnCeros.xlsm` es una plantilla aparte: cuando el fedatario **no tuvo
operaciones reportables en el mes, igual debe presentar el informe**. En el XML
es el campo `<exento>`.

Es una obligación que el producto todavía no modela y que hay que cubrir antes
del demo: un notario sin actos en el mes sigue teniendo que presentar.

## Lo que viene en noviembre

Las RCG reformadas por el **Acuerdo 115/2026** (DOF 07/ago/2026) entran en
vigor el **30 de noviembre de 2026**. Los avisos por sospecha de los artículos
26 Bis y 26 Bis 1 —los de 24 horas— quedan **condicionados a que se publique la
Resolución de formatos oficiales** que los identifique. Esa resolución todavía
no sale, así que hoy nadie tiene ese layout.

**Consecuencia de diseño:** el layout tiene que ser dato versionado, no código.
Igual que la UMA en `parametro_regulatorio` y las fuentes en `lista_fuente`.
Cuando salga la Resolución se agrega una versión con su vigencia; no se
reescribe el generador. Y como cada aviso queda ligado a la versión con la que
se armó, en una revisión se puede demostrar que se usó el layout vigente en su
momento.
