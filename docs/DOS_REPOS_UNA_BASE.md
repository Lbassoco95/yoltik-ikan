# Dos repos, una sola base — constancia para decidir

> Nota de constancia, **no** una propuesta ejecutada. Aquí no se migró nada.
> Levantada el 30 de agosto de 2026 desde `yoltik-ikan`, rama
> `claude/happy-wright-91iz1v`.

## El hecho

`yoltik-ikan` y `yoltik-regtech-hub` apuntan al **mismo** proyecto de Supabase
(`cibpguwwggwzdhhpdomz`) y cada uno lleva su propia numeración de migrations.

| | `yoltik-ikan` | `yoltik-regtech-hub` |
|---|---|---|
| Última migration en el repo | `0022` | `0010` |
| Aplicado en producción | `0001`–`0016` | (las 0001–0010 son las mismas 0001–0010) |

## Por qué importa

Las numeraciones son independientes, así que **nada impide que los dos creen un
`0011` distinto**. Si eso pasa:

- El repo que se aplique segundo choca contra objetos que no espera.
- `supabase db push` o cualquier reconstrucción desde cero produce esquemas
  distintos según el repo desde el que se corra.
- Deja de haber una respuesta a "qué hay en producción": depende de a cuál le
  preguntes.

Hoy no ha explotado porque `yoltik-regtech-hub` se quedó en `0010` y todo lo
posterior salió de `yoltik-ikan`. Es una coincidencia afortunada, no un diseño.

## Qué haría falta para consolidar

No se hace ninguna de estas sin que Polo elija. Se listan con su costo real:

**A · Un repo manda, el otro deja de tocar migrations.**
Se declara `yoltik-ikan` como dueño del esquema y en `yoltik-regtech-hub` se
borra —o se congela con un README— la carpeta `supabase/migrations/`. Es lo más
barato y lo que menos cambia hoy. Deja al otro repo sin poder reconstruir la
base por su cuenta, lo cual es exactamente el punto.

**B · Fusionar los dos historiales.**
Traer a `yoltik-ikan` lo que `yoltik-regtech-hub` tenga y no esté aquí. Antes
hay que saber si existe algo así: hasta donde se revisó, las `0001`–`0010` son
las mismas, pero eso se confirma comparando los archivos, no de memoria.

**C · Prefijos por repo** (`ikan_0023`, `hub_0011`).
Evita el choque de nombres pero no el de contenido: dos repos pueden seguir
creando la misma tabla. Resuelve el síntoma barato y deja el problema.

**D · Dejarlo como está, con la regla escrita.**
Sostenible mientras un solo repo toque el esquema y alguien lo recuerde. Es
donde estamos hoy, sin la parte de que esté escrito — esta nota cierra esa
mitad.

## Lo que hay que verificar antes de decidir

No se pudo comprobar desde esta sesión (sin acceso al remoto ni al otro repo):

1. Si las `0001`–`0010` de los dos repos son **byte por byte** las mismas o
   sólo se parecen.
2. Si `yoltik-regtech-hub` tiene algo posterior a `0010` sin commitear, en otra
   rama, o aplicado a mano.
3. Cuál de los dos despliega hoy la aplicación que usan los clientes.

Las tres se responden mirando, no razonando, y ninguna se puede contestar desde
aquí.

## Relacionado

`prospect_intake` es el único objeto en producción sin migration en **ningún**
repo. Entra como `0023` en `yoltik-ikan` en cuanto se tenga su DDL real; ver
`docs/APLICAR_ESQUEMA_REMOTO.md`.
