# Roles y permisos · Ikán

Tres roles operativos. Un usuario puede acumular roles (típicamente OC + Admin).

## Segundo factor: obligatorio

Ninguna sesión llega a una pantalla con datos sin TOTP activo. Quien no lo tenga
va a `/seguridad/2fa` antes que a cualquier otra ruta. El secreto lo guarda
Supabase Auth; Ikán no lo ve ni lo almacena.

Con una excepción deliberada: si **no se pudo preguntarle a Auth** por el
factor, no se bloquea. Eso no es «este usuario no tiene 2FA», es «la plataforma
no contestó», y dejar al Oficial de Cumplimiento fuera de su propio sistema el
día 17 por una falla que no es suya sería peor que un día sin segundo factor.
La cabecera lo enseña en rojo mientras dure.

Reponer un factor perdido (teléfono robado) es operación de Kawiil, no una
preferencia del usuario: por eso la pantalla no ofrece quitarlo. Se hace
borrando el factor de la cuenta:

```sql
-- Recuperación de un usuario que perdió su segundo factor. Al volver a entrar
-- se le pedirá darlo de alta otra vez. Comprobado el 30/08/2026 sobre un
-- usuario de prueba.
delete from auth.mfa_factors
 where user_id = (select id from auth.users where email = 'CORREO@EJEMPLO.MX');
```

`/seguridad/2fa` existe en las DOS aplicaciones —la de clientes y la consola de
plataforma—. Sin la ruta en la consola, su comodín devolvía a `/` y de ahí otra
vez al alta: un bucle que la dejaba inservible.

## Operador

- Vende u opera. Captura clientes y operaciones. **Su flujo termina con el acuse.**
- Ve solo lo que él capturó.
- No ve alertas/hallazgos/avisos. No es notificado por el OC.

## Oficial de Cumplimiento (OC)

- Consume las bandejas del Motor PLD: operaciones identificadas, hallazgos por tipología,
  avisos por firmar, clientes Alto pendientes DDR.
- Marca Inusual/Preocupante. Firma avisos.
- Aprueba (no edita) cambios técnicos propuestos por el Admin (metodología, tipologías,
  catálogos, reglas).

## Administrador

- Configura el motor: gestiona usuarios y roles, edita metodología EBR, edita tipologías
  por AV, edita catálogos y reglas.
- Sus cambios pasan por **aprobación del OC** en `pending_approvals` antes de quedar
  vigentes.
- Si OC = Admin, auto-firma pero queda registrado en bitácora.

## Matriz de permisos resumida

| Acción                                              | Operador | OC  | Admin |
| --------------------------------------------------- | -------- | --- | ----- |
| Dar de alta cliente / capturar operación            | Sí       | Sí  | Sí    |
| Ver lista completa de operaciones de la org         | Solo suyas | Sí | Sí  |
| Ver y resolver hallazgos                            | No       | Sí  | Si=OC |
| Marcar Inusual / Preocupante                        | No       | Sí  | Si=OC |
| Generar y descargar Aviso 24h / mensual             | No       | Sí  | Si=OC |
| Aprobar DDR de cliente Alto                         | No       | Sí  | Si=OC |
| Crear / desactivar usuarios                         | No       | Si=Admin | Sí |
| Editar metodología EBR                              | No       | Aprobar | Editar |
| Editar tipologías por AV                            | No       | Aprobar | Editar |
| Editar catálogos                                    | No       | Aprobar | Editar |
| Editar reglas y umbrales                            | No       | Aprobar | Editar |
| Ver bitácora completa de la organización            | Solo suyas | Sí | Sí |

## Mapeo de páginas Lovable → roles

| Ruta | Página | Roles con acceso | Justificación |
|------|--------|------------------|---------------|
| `/` | `DashboardPage` | operador, oc, admin | KPIs + kanban; contenido se filtra por rol activo en Sprint D-3 |
| `/clientes` | `ClientsPage` | operador, oc, admin | Operador alta + ve los suyos (RLS); OC/Admin ven todos |
| `/clientes/:id` | `ClientDetailPage` | operador, oc, admin | Misma lógica RLS |
| `/operaciones` | `OperationsPage` | operador, oc, admin | Operador captura; OC/Admin consultan |
| `/verificacion` | `VerificationPage` | operador, oc | KYC mock Moffin. Admin no opera KYC directamente |
| `/alertas` | `AlertsPage` | oc, admin | Bandeja futura de hallazgos del Motor PLD. Operador NO ve |
| `/reportes` | `ReportsPage` | oc, admin | Avisos 24h y mensual |
| `/auditoria` | `AuditPage` | oc, admin | Bitácora completa |
| `/listas` | `ListsPage` | admin | Catálogos GAFI/OFAC. OC aprueba via pending_approvals |
| `/motor-reglas` | `RulesEnginePage` | admin | Configura tipologías + umbrales. OC aprueba via pending_approvals |
| `/configuracion` | `ConfigPage` | admin | Usuarios, metodología EBR |

## RLS — cómo se aplica

- Todas las tablas core usan `current_org_id()` (lee de `user_profile.organization_id`)
  + `has_rol('rol')` (lee de `user_roles`) para discriminar acceso.
- El Operador solo ve filas con `capturado_por = auth.uid()` en `client`, `operation` y
  vistas relacionadas.
- El OC y el Admin ven toda la org.
- Solo el Admin escribe en tablas de configuración (metodología, tipologías, catálogos).
- Solo el OC actualiza estado de hallazgos y avisos.
- Solo el OC resuelve `pending_approvals`.

## Selector de rol activo

Cuando un usuario tiene varios roles, el `AppHeader` muestra un selector "Operando como".
La elección persiste en `localStorage`. La bitácora registra el rol activo en cada
acción para que la auditoría pueda diferenciar.
