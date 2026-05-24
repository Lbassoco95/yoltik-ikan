# Configuración recomendada de Claude Code para este repo

El repo trae `.claude/settings.json` con permisos preconfigurados para reducir
fricción del día a día. Este documento explica el por qué de cada bloque.

La regla viva, ratificada por Polo en D1.B0a:
- **Commit + push a la rama de trabajo (`claude/magical-davinci-Md6ls`) está OK**
  sin esperar aprobación manual, siempre que el mensaje siga formato `D1.Bn: descripción`,
  Code reporte antes qué va a hacer, y sea cierre de bloque con build verde
  (o explícitamente marcado como pre-trabajo no validado).
- **Merge a `main` SÍ requiere aprobación explícita** del usuario.

## Contenido de `.claude/settings.json`

```json
{
  "permissions": {
    "allow": [
      "Bash(npm install)",
      "Bash(npm install --save-dev:*)",
      "Bash(npm run dev)",
      "Bash(npm run build)",
      "Bash(npm run typecheck)",
      "Bash(npm run lint)",
      "Bash(npm run format)",
      "Bash(npm run bootstrap:users)",
      "Bash(npm run supabase:*)",
      "Bash(npx tsx:*)",
      "Bash(npx supabase:*)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git branch:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git push origin claude/*)"
    ],
    "deny": [
      "Bash(git push origin main:*)",
      "Bash(git push:* --force:*)",
      "Bash(rm -rf:*)",
      "Bash(npx supabase db reset --linked:*)"
    ]
  }
}
```

## Por qué cada bloque

**`allow`**: comandos seguros del día a día. Code podrá ejecutarlos sin pedir
permiso cada vez.

- `npm run *` y `npx tsx:*` — operación normal del proyecto.
- `npx supabase:*` — vincular, push migrations, generar types contra remoto.
- `git status / diff / log / branch / add / commit` — flujo normal.
- `git push origin claude/*` — push a ramas de trabajo (PR #1 se actualiza solo).

**`deny`**:
- `git push origin main` — el merge a `main` lo decide el usuario, no Code.
- `git push --force` (cualquier rama) — riesgo de pisar trabajo upstream.
- `rm -rf` — evita borrados accidentales recursivos.
- `npx supabase db reset --linked` — `--linked` aplica al proyecto remoto
  `cibpguwwggwzdhhpdomz` y borraría datos en producción. El reset local
  (`supabase db reset` sin `--linked`) sí está permitido por el patrón
  `Bash(npx supabase:*)` de allow.

## Cuándo conviene relajar `deny`

Si en algún momento el usuario quiere que Code mergee a `main` por su cuenta
(no recomendado durante Sprint D-1 mientras el modelo siga en construcción), mueve
`"Bash(git push origin main:*)"` a `allow`. Mientras tanto, el push a `main` se
hace desde la UI de GitHub aprobando el PR #1.

---

## Extensiones recomendadas de VS Code / Cursor / Code

Si trabajas el repo desde VS Code o Cursor en paralelo, crea `.vscode/extensions.json`
en tu Mac (no se commitea por ahora; queda decisión del equipo):

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-azuretools.vscode-docker",
    "supabase.vscode-supabase-extension",
    "denoland.vscode-deno",
    "anthropic.claude-code"
  ]
}
```
