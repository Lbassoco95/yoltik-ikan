// TODO[Sprint D-2]: este archivo es un shim temporal sobre _legacy_mock.ts
// (datos demo heredados del scaffold Lovable). Las páginas que aún consumen
// estos mocks (Clientes, Operaciones, Alertas, Reportes, Auditoría, Dashboard)
// se conectarán a Supabase en D-2/D-3. Cuando todas migren, eliminar tanto
// este archivo como src/data/_legacy_mock.ts.
export * from "./_legacy_mock";
