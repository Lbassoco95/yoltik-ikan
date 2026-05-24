// Mock data for the Yoltik RegTech platform

export const UMA_VALUE = 132.59;

export interface Client {
  id: string;
  name: string;
  type: "PF" | "PM";
  rfc: string;
  curp?: string;
  riskLevel: "Bajo" | "Medio" | "Alto";
  status: "Activo" | "Pendiente" | "Suspendido" | "En revisión";
  lastUpdate: string;
  nationality: string;
  activity: string;
  email?: string;
  phone?: string;
}

export interface Operation {
  id: string;
  date: string;
  clientId: string;
  clientName: string;
  amount: number;
  type: string;
  instrument?: string;
  status: "Normal" | "Alertada" | "Reportada";
  asset?: string;
  quantity?: number;
  hash?: string;
  exchangeRate?: number;
}

export interface Alert {
  id: string;
  clientName: string;
  amount: number;
  rule: string;
  priority: "Alta" | "Media" | "Baja";
  status: "Nueva" | "En análisis" | "Escalada" | "Reportada" | "Descartada";
  daysInQueue: number;
  date: string;
}

export interface Report {
  id: string;
  folio: string;
  type: "OR" | "OI" | "OP" | "Aviso";
  detectionDate: string;
  sendDate?: string;
  clientName: string;
  amount: number;
  status: "Borrador" | "Enviado" | "Acusado";
  priority?: "Normal" | "24hrs";
  asset?: string;
  alertCode?: string;
  month?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  ip: string;
  action: string;
  module: string;
  object: string;
  detail: string;
}

export const mockClients: Client[] = [
  { id: "CLI-001", name: "María González López", type: "PF", rfc: "GOLM850315XX1", curp: "GOLM850315MDFRPN01", riskLevel: "Bajo", status: "Activo", lastUpdate: "2026-03-15", nationality: "Mexicana", activity: "Comercio al por menor", email: "maria.gonzalez@email.com", phone: "55 1234 5678" },
  { id: "CLI-002", name: "Distribuidora Digital S.A. de C.V.", type: "PM", rfc: "DDI200101XX2", riskLevel: "Medio", status: "Activo", lastUpdate: "2026-03-10", nationality: "Mexicana", activity: "Servicios tecnológicos", email: "contacto@distdigital.com", phone: "55 9876 5432" },
  { id: "CLI-003", name: "Carlos Mendoza Ruiz", type: "PF", rfc: "MERC900722XX3", curp: "MERC900722HDFRNS09", riskLevel: "Alto", status: "En revisión", lastUpdate: "2026-03-28", nationality: "Mexicana", activity: "Inversiones", email: "cmendoza@mail.com", phone: "33 4567 8901" },
  { id: "CLI-004", name: "Grupo Financiero Norte S.A.", type: "PM", rfc: "GFN180605XX4", riskLevel: "Bajo", status: "Activo", lastUpdate: "2026-02-20", nationality: "Mexicana", activity: "Servicios financieros", email: "legal@gfnorte.mx", phone: "81 2345 6789" },
  { id: "CLI-005", name: "Ana Sofía Ramírez Torres", type: "PF", rfc: "RATA920110XX5", curp: "RATA920110MDFMRN08", riskLevel: "Medio", status: "Pendiente", lastUpdate: "2026-03-25", nationality: "Mexicana", activity: "Consultoría", email: "ana.ramirez@corp.com", phone: "55 3456 7890" },
  { id: "CLI-006", name: "Tech Solutions México S. de R.L.", type: "PM", rfc: "TSM210301XX6", riskLevel: "Bajo", status: "Activo", lastUpdate: "2026-03-01", nationality: "Mexicana", activity: "Desarrollo de software", email: "admin@techsol.mx", phone: "55 6789 0123" },
  { id: "CLI-007", name: "Roberto Juárez Pineda", type: "PF", rfc: "JUPR880415XX7", curp: "JUPR880415HDFRBN07", riskLevel: "Alto", status: "Suspendido", lastUpdate: "2026-03-20", nationality: "Mexicana", activity: "Comercio de criptoactivos", email: "rjuarez@mail.com", phone: "442 123 4567" },
];

export const mockOperations: Operation[] = [
  { id: "OP-001", date: "2026-03-28 14:30", clientId: "CLI-003", clientName: "Carlos Mendoza Ruiz", amount: 450000, type: "Compra", status: "Alertada", asset: "BTC", quantity: 0.5, hash: "0x7a3f8b2c…d4e1", exchangeRate: 900000 },
  { id: "OP-002", date: "2026-03-27 10:15", clientId: "CLI-001", clientName: "María González López", amount: 85000, type: "Venta", status: "Normal", asset: "ETH", quantity: 2.3, hash: "0x9b2c4d5e…f6a7", exchangeRate: 36956 },
  { id: "OP-003", date: "2026-03-27 09:00", clientId: "CLI-002", clientName: "Distribuidora Digital S.A. de C.V.", amount: 180000, type: "Compra", status: "Alertada", asset: "USDT", quantity: 10000, hash: "0x1c3d5e7f…8b9a", exchangeRate: 18 },
  { id: "OP-004", date: "2026-03-26 16:45", clientId: "CLI-005", clientName: "Ana Sofía Ramírez Torres", amount: 45000, type: "Compra", status: "Normal", asset: "BTC", quantity: 0.05, hash: "0x2d4e6f8a…0b1c", exchangeRate: 900000 },
  { id: "OP-005", date: "2026-03-26 11:20", clientId: "CLI-003", clientName: "Carlos Mendoza Ruiz", amount: 92000, type: "Venta", status: "Alertada", asset: "ETH", quantity: 2.5, hash: "0x3e5f7a9b…2c3d", exchangeRate: 36800 },
  { id: "OP-006", date: "2026-03-25 15:00", clientId: "CLI-007", clientName: "Roberto Juárez Pineda", amount: 520000, type: "Compra", status: "Reportada", asset: "BTC", quantity: 0.58, hash: "0x4f6a8b0c…d4e5", exchangeRate: 896552 },
  { id: "OP-007", date: "2026-03-25 08:30", clientId: "CLI-004", clientName: "Grupo Financiero Norte S.A.", amount: 35000, type: "Venta", status: "Normal", asset: "XRP", quantity: 45000, hash: "0x5a7b9c1d…e6f7", exchangeRate: 0.78 },
  { id: "OP-008", date: "2026-03-24 13:10", clientId: "CLI-006", clientName: "Tech Solutions México S. de R.L.", amount: 125000, type: "Compra", status: "Normal", asset: "ETH", quantity: 3.4, hash: "0x6b8c0d2e…f8a9", exchangeRate: 36765 },
];

export const mockAlerts: Alert[] = [
  { id: "ALT-001", clientName: "Carlos Mendoza Ruiz", amount: 92000, rule: "Umbral 645 UMA superado", priority: "Alta", status: "Nueva", daysInQueue: 1, date: "2026-03-28" },
  { id: "ALT-002", clientName: "Distribuidora Digital S.A. de C.V.", amount: 180000, rule: "Fragmentación detectada — 5 operaciones en 48hrs", priority: "Alta", status: "En análisis", daysInQueue: 3, date: "2026-03-25" },
  { id: "ALT-003", clientName: "María González López", amount: 85000, rule: "Coincidencia parcial en listas PEP", priority: "Media", status: "Escalada", daysInQueue: 5, date: "2026-03-23" },
  { id: "ALT-004", clientName: "Roberto Juárez Pineda", amount: 520000, rule: "Umbral 3,210 UMA superado", priority: "Alta", status: "Reportada", daysInQueue: 8, date: "2026-03-20" },
  { id: "ALT-005", clientName: "Ana Sofía Ramírez Torres", amount: 45000, rule: "Desviación del perfil transaccional", priority: "Baja", status: "Nueva", daysInQueue: 0, date: "2026-03-29" },
  { id: "ALT-006", clientName: "Carlos Mendoza Ruiz", amount: 450000, rule: "Operación individual > 3,210 UMA", priority: "Alta", status: "Nueva", daysInQueue: 0, date: "2026-03-28" },
  { id: "ALT-007", clientName: "Tech Solutions México S. de R.L.", amount: 125000, rule: "Recursos de personas diferentes al titular", priority: "Media", status: "Descartada", daysInQueue: 12, date: "2026-03-16" },
];

export const mockReports: Report[] = [
  { id: "RPT-001", folio: "OR-2026-001", type: "OR", detectionDate: "2026-03-20", sendDate: "2026-03-22", clientName: "Roberto Juárez Pineda", amount: 520000, status: "Enviado" },
  { id: "RPT-002", folio: "OI-2026-003", type: "OI", detectionDate: "2026-03-15", clientName: "Carlos Mendoza Ruiz", amount: 92000, status: "Borrador" },
  { id: "RPT-003", folio: "AV-2026-012", type: "Aviso", detectionDate: "2026-03-10", sendDate: "2026-03-17", clientName: "Distribuidora Digital S.A. de C.V.", amount: 180000, status: "Acusado", priority: "Normal", asset: "USDT", alertCode: "A-16", month: "Febrero 2026" },
  { id: "RPT-004", folio: "AV-2026-015", type: "Aviso", detectionDate: "2026-03-25", clientName: "Carlos Mendoza Ruiz", amount: 450000, status: "Borrador", priority: "24hrs", asset: "BTC", alertCode: "A-03", month: "Marzo 2026" },
];

export const mockAudit: AuditEntry[] = [
  { id: "AUD-001", timestamp: "2026-03-28 14:35:22", user: "Lic. Patricia Vega", ip: "192.168.1.45", action: "Crear", module: "Operaciones", object: "OP-001", detail: "Alta de operación de compra BTC por $450,000 MXN" },
  { id: "AUD-002", timestamp: "2026-03-28 14:36:01", user: "Sistema", ip: "10.0.0.1", action: "Crear", module: "Alertas", object: "ALT-006", detail: "Alerta automática: Umbral 3,210 UMA superado" },
  { id: "AUD-003", timestamp: "2026-03-27 16:20:10", user: "Lic. Patricia Vega", ip: "192.168.1.45", action: "Editar", module: "Clientes", object: "CLI-003", detail: "Actualización nivel de riesgo: Medio → Alto" },
  { id: "AUD-004", timestamp: "2026-03-27 11:05:30", user: "Ing. Marco Reyes", ip: "192.168.1.52", action: "Enviar", module: "Reportes", object: "RPT-001", detail: "Envío de Reporte de Operaciones Relevantes a CNBV" },
  { id: "AUD-005", timestamp: "2026-03-26 09:15:00", user: "Sistema", ip: "10.0.0.1", action: "Consultar", module: "Listas", object: "OFAC/ONU/UIF", detail: "Consulta periódica automática de listas restrictivas" },
  { id: "AUD-006", timestamp: "2026-03-25 14:40:55", user: "Lic. Patricia Vega", ip: "192.168.1.45", action: "Aprobar", module: "Clientes", object: "CLI-006", detail: "Expediente KYC aprobado — Tech Solutions México" },
];

export const mockDailyOperations = [
  { day: "01 Mar", count: 12, amount: 850000 },
  { day: "02 Mar", count: 8, amount: 420000 },
  { day: "03 Mar", count: 15, amount: 1200000 },
  { day: "04 Mar", count: 6, amount: 310000 },
  { day: "05 Mar", count: 22, amount: 1800000 },
  { day: "06 Mar", count: 18, amount: 1450000 },
  { day: "07 Mar", count: 9, amount: 520000 },
  { day: "08 Mar", count: 14, amount: 980000 },
  { day: "09 Mar", count: 11, amount: 670000 },
  { day: "10 Mar", count: 20, amount: 1650000 },
  { day: "11 Mar", count: 16, amount: 1100000 },
  { day: "12 Mar", count: 7, amount: 380000 },
  { day: "13 Mar", count: 25, amount: 2100000 },
  { day: "14 Mar", count: 19, amount: 1520000 },
  { day: "15 Mar", count: 13, amount: 890000 },
  { day: "16 Mar", count: 10, amount: 560000 },
  { day: "17 Mar", count: 17, amount: 1350000 },
  { day: "18 Mar", count: 21, amount: 1780000 },
  { day: "19 Mar", count: 5, amount: 250000 },
  { day: "20 Mar", count: 14, amount: 920000 },
  { day: "21 Mar", count: 23, amount: 1950000 },
  { day: "22 Mar", count: 11, amount: 680000 },
  { day: "23 Mar", count: 8, amount: 410000 },
  { day: "24 Mar", count: 16, amount: 1250000 },
  { day: "25 Mar", count: 19, amount: 1480000 },
  { day: "26 Mar", count: 12, amount: 780000 },
  { day: "27 Mar", count: 15, amount: 1100000 },
  { day: "28 Mar", count: 18, amount: 1400000 },
];

export const mockRiskDistribution = [
  { name: "Bajo", value: 4, fill: "hsl(145, 53%, 42%)" },
  { name: "Medio", value: 2, fill: "hsl(28, 80%, 52%)" },
  { name: "Alto", value: 1, fill: "hsl(4, 72%, 47%)" },
];

export const recentActivity = [
  { time: "14:36", text: "Alerta automática generada — Carlos Mendoza", type: "alert" },
  { time: "14:35", text: "Operación registrada — Compra 0.5 BTC", type: "operation" },
  { time: "11:05", text: "Reporte OR enviado a CNBV — Roberto Juárez", type: "report" },
  { time: "09:15", text: "Consulta automática listas OFAC/ONU/UIF", type: "list" },
  { time: "Ayer", text: "Expediente CLI-006 aprobado — Tech Solutions", type: "client" },
];
