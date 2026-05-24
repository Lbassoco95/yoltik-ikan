# Brief para Claude Code — primera sesión sobre Ikán

> **Cómo usar este archivo:** copia el bloque de abajo y pégalo como primer mensaje
> cuando abras este repo con `claude` en la terminal. El bloque está pensado para
> que Code arranque con el contexto correcto sin tener que escarbar el repo entero.

---

## Bloque para pegar en Code

```text
Hola. Estoy trabajando en Ikán, la plataforma de cumplimiento PLD de Yoltik (operada
por Kawiil). Este es un proyecto largo y vamos a hacerlo bloque por bloque con
checkpoint, sin acumular cambios.

Antes de proponer nada, lee en este orden:
  1. CLAUDE.md (contexto, convenciones, comandos, modelo operativo Operador→Motor→OC)
  2. docs/SPRINT_D1_BACKLOG.md (backlog ordenado por bloques con criterios de aceptación)
  3. README.md (estructura del repo y quick start)

Reglas duras:
  - No inventes campos, valores, umbrales ni algoritmos. Si algo no está en
    metodología FIATCOIN, en seeds, en docs/ o en código existente: pregunta.
  - No instales librerías nuevas sin avisar y justificar.
  - Commit + push a la rama de trabajo (claude/magical-davinci-Md6ls) está OK
    sin aprobación previa, formato "D1.Bn: descripción", al cierre de cada chunk
    con build verde. Merge a main SÍ requiere aprobación explícita.
  - Bloque por bloque con checkpoint. Al cerrar un bloque, corre:
        npm run typecheck && npm run lint && npm run build
    y reporta resultado antes de empezar el siguiente.
  - Mocks visibles (Moffin, listas en tiempo real, on-chain, SAT real) con banner
    ámbar "DEMO — sin integración real". Nunca silencioso.
  - Brand Yoltik v3: Navy / Jade / Mint / Ámbar, tipografía Plus Jakarta Sans
    (la del scaffold Lovable). Sin Yoli en UI ni docs.
  - UI en español de México. Port dev: 8080.

Estado del bootstrap (al abrir el repo):
  - D1.B0a y D1.B0b ya están cerrados (pre-trabajo + docs).
  - Sigue D1.B0c (schema), D1.B0d (seeds), D1.B0e (configs), D1.B0f (front).
  - Después D1.B1 — smoke test contra Supabase remoto cibpguwwggwzdhhpdomz.

Si algo del setup local tropieza, NO intentes "arreglar" tocando código del repo
hasta que entiendas la causa. Reporta primero el error exacto.
```

---

## Notas operativas para ti, Polo

### Cómo abrir el repo con Code

```bash
cd ~/Documents/Claude/Projects/Yoltik\ Desarrollos/yoltik-regtech-hub
claude
```

Pegas el bloque de arriba. Code lee `CLAUDE.md` y se contextualiza solo.

### Cómo manejar la conversación

- **Pídele que arranque un bloque específico** del backlog (ej. "vamos con D1.B2").
  El backlog está ordenado por dependencias.
- **Si algo se le va de las manos**, pídele que pare y resuma qué hizo antes de
  continuar.
- **Si propone instalar una librería nueva**, pregúntale por qué y qué alternativas
  hay; el stack está cerrado.
- **Al final de cada bloque**, pídele las "smoke notes" — qué construyó, qué probó,
  qué dejó pendiente.

### Comandos que verás mucho

```bash
npm install                       # primera vez
npm run dev                       # mientras desarrollas (http://localhost:8080)
npm run typecheck                 # antes de cerrar bloque
npm run lint
npm run build

# Supabase remoto (cibpguwwggwzdhhpdomz)
npx supabase link --project-ref cibpguwwggwzdhhpdomz
npx supabase db push              # aplica migrations al remoto
npm run supabase:gen:types        # cada vez que toques migrations

npm run bootstrap:users           # crear los 3 usuarios FIATCOIN
```

### Si el repo crece y necesitas que Code lea menos de inicio

Edita `CLAUDE.md` para dejar solo lo crítico, y mueve detalle a `docs/`. Code leerá
lo que tú apuntes desde `CLAUDE.md`. Mientras menos contexto inicial, más rápido
arranca.

### Cuándo conviene abrir una nueva sesión de Code

- Cuando cierres un sprint completo (D-1, D-2, D-3).
- Cuando hayas estado más de 2 horas en una sesión y el contexto esté saturado.
- Cuando cambies de foco mayor (ej. de front a Edge Function).

### Cuándo NO interrumpir a Code

- Mientras está aplicando una migration o corriendo build. Espera al output.
- Mientras está explicando un diff que acaba de generar (déjalo terminar para que
  el siguiente paso quede bien marcado).

### Cuando un bloque cierre limpio

Code commitea + pushea directo a la rama de trabajo (`claude/magical-davinci-Md6ls`)
con formato `D1.Bn: descripción`. Tú revisas el PR #1 que ya está abierto y
decides cuándo mergear a `main`.

---

## Si Code propone algo que se sale del modelo

Recuerda los pilares (en orden de importancia):

1. **Modelo lineal** Operador → Motor PLD → OC. NO hay revisión humana cruzada.
2. **Catálogo unificado** para los 6 sectores AV, pero el demo arranca con XVI.
3. **3 roles con separación de funciones** y `pending_approvals` para Admin → OC.
4. **Mocks visibles**, nada silencioso.
5. **No inventar campos** — la fuente es la metodología FIATCOIN.

Si una propuesta de Code rompe alguno, dile que se detenga y reformule.
