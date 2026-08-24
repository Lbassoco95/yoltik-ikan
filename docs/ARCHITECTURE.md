# Arquitectura · Ikán

## Vista lógica — Fase 1 (Sprint D-1 a D-3)

```
[Usuario]
   ↓
[Front Vercel (Vite + React + TS)]
   ↓                  ↓
[Supabase Auth   ][Supabase Postgres]
[(2FA TOTP)      ][(RLS por org y rol)]
                       ↓
                  [Edge Functions]
                       ↓
                  [motor-pld]  →  evalúa tipologías, crea hallazgos, genera avisos
```

## Decisiones clave

1. **Sector piloto**: XVI (Activos Virtuales). Seed = Ixim Pay.
2. **Catálogo unificado**: el motor es uno solo; cada AV trae su set de tipologías.
3. **Fase 1 monolito-funcional**: el front consume Supabase directo. Fase 2 (post-demo) introducirá API REST propia.
4. **3 roles**: Operador, OC, Admin. Un usuario puede acumular roles. RLS discrimina por rol.
5. **Motor PLD nombrado**: módulo con identidad propia, panel propio y ciclo configurar → aprobar → ejecutar → entregar.
6. **Tipologías por AV** como entidad de primer orden (regla_dsl en JSONB, versionadas, aprobadas por OC).
7. **Scaffold Lovable preservado**: las 12 páginas existentes (Clientes, Operaciones, Alertas, Reportes, Listas, RulesEngine, Verificacion, Auditoria, Configuracion) se reaprovechan envueltas con `<ProtectedRoute>` por rol. La conexión a queries reales en Supabase entra en Sprint D-2/D-3.

## Multi-tenancy

- 1 organización = 1 sujeto obligado.
- Una organización puede tener varios sectores (en BD el sector vive a nivel de operación y metodología, no de organización).
- Todas las tablas core llevan `organization_id` y se protegen con RLS via `current_org_id()`.

## Separación de funciones

| Acción técnica                      | Quién la hace               | Aprobación                  |
| ----------------------------------- | --------------------------- | --------------------------- |
| Editar metodología EBR              | Admin                       | OC firma vía pending_approvals |
| Editar tipologías por AV            | Admin                       | OC firma vía pending_approvals |
| Editar catálogos                    | Admin                       | OC firma vía pending_approvals |
| Marcar Inusual / Preocupante        | OC                          | —                           |
| Generar y firmar Aviso              | OC                          | —                           |
| Capturar cliente y operación        | Operador (o cualquier rol)  | —                           |

Cuando OC = Admin, la aprobación es auto-firma pero queda registrada en bitácora.

## Mocks visibles (no romper)

- Moffin (KYC): modal con banner ámbar "DEMO".
- Listas en tiempo real OFAC/ONU: snapshot en BD versionado.
- Análisis on-chain: tipología XVI-03 lee mock `blockchain_analytics_mock`.
- Envío real al SAT: solo descarga JSON, no envía.
