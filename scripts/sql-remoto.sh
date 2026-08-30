#!/usr/bin/env bash
# =====================================================================
# Ikán · Correr SQL contra el Supabase de producción
# =====================================================================
# Usa la API de gestión de Supabase, que va por HTTPS. No usa psql: el entorno
# de Claude Code sólo deja salir HTTP(S), no TCP crudo al puerto 5432.
#
#   ./scripts/sql-remoto.sh "select count(*) from client;"
#   ./scripts/sql-remoto.sh -f supabase/manual/00_estado_migraciones.sql
#
# El token sale, en este orden, de:
#   1. la variable de entorno SUPABASE_ACCESS_TOKEN
#   2. el archivo ~/.config/supabase/pat
# Nunca se escribe en el repo ni se imprime.
#
# OJO — es la base de PRODUCCIÓN, con datos de clientes. Este script no impide
# nada por sí solo; la regla es de quien lo usa: nada de drop, truncate ni
# delete sin respaldo, y todo cambio de esquema entra como migration.
# =====================================================================
set -euo pipefail

PROYECTO="${SUPABASE_PROJECT_REF:-cibpguwwggwzdhhpdomz}"
API="https://api.supabase.com/v1/projects/${PROYECTO}/database/query"

leer_token() {
  if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
    printf '%s' "$SUPABASE_ACCESS_TOKEN"
  elif [[ -r "$HOME/.config/supabase/pat" ]]; then
    tr -d '[:space:]' < "$HOME/.config/supabase/pat"
  else
    echo "Falta el token. Ponlo en SUPABASE_ACCESS_TOKEN o en ~/.config/supabase/pat." >&2
    echo "Se crea en https://supabase.com/dashboard/account/tokens" >&2
    exit 2
  fi
}

# El token se lee aquí y no dentro de la llamada: un `exit` dentro de una
# sustitución de comandos $( ) no termina el script, sólo la subshell, y el
# script seguía hasta hacer la petición sin credencial.
TOKEN="$(leer_token)"

if [[ "${1:-}" == "-f" ]]; then
  [[ -r "${2:-}" ]] || { echo "No puedo leer el archivo: ${2:-<falta>}" >&2; exit 2; }
  CONSULTA="$(cat "$2")"
elif [[ -n "${1:-}" ]]; then
  CONSULTA="$1"
else
  echo "Uso: $0 \"<sql>\"   |   $0 -f <archivo.sql>" >&2
  exit 2
fi

CUERPO="$(CONSULTA="$CONSULTA" python3 -c 'import json,os;print(json.dumps({"query":os.environ["CONSULTA"]}))')"

RESPUESTA="$(mktemp)"
trap 'rm -f "$RESPUESTA"' EXIT

# `set -e` está activo y curl devuelve distinto de cero cuando el proxy corta,
# así que la llamada va con `|| true` y el veredicto sale del código HTTP.
CODIGO="$(curl -sS -o "$RESPUESTA" -w '%{http_code}' -X POST "$API" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "$CUERPO" 2>>"$RESPUESTA")" || CODIGO="000"

# La API de gestión responde 201 en las consultas que ejecutan SQL, no 200. La
# primera versión sólo aceptaba 200 y salía con código 5 sin enseñar el cuerpo:
# el resultado estaba ahí y se tiraba. Se aceptan los 2xx.
case "$CODIGO" in
  2*) python3 -c 'import json,sys;d=json.load(sys.stdin);print(json.dumps(d,ensure_ascii=False,indent=1))' < "$RESPUESTA" ;;
  000)
    echo "No hubo respuesta de api.supabase.com." >&2
    echo "Casi seguro es la política de red del entorno, no el token: el proxy" >&2
    echo "contesta 403 al CONNECT. Compruébalo con:" >&2
    echo "  curl -sS \"\$HTTPS_PROXY/__agentproxy/status\" | grep -A3 recentRelayFailures" >&2
    echo "Se arregla permitiendo api.supabase.com en la configuración del entorno." >&2
    exit 3 ;;
  401|403)
    echo "El token fue rechazado (HTTP $CODIGO). Revísalo o genera uno nuevo en" >&2
    echo "https://supabase.com/dashboard/account/tokens" >&2
    exit 4 ;;
  *)
    echo "HTTP $CODIGO" >&2
    cat "$RESPUESTA" >&2
    exit 5 ;;
esac
