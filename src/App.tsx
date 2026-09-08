import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { LoginPage } from "@/pages/auth/Login";
import { RecuperarPasswordPage } from "@/pages/auth/RecuperarPassword";
import { RestablecerPasswordPage } from "@/pages/auth/RestablecerPassword";
import AltaSegundoFactorPage from "@/pages/auth/AltaSegundoFactor";
import DashboardPage from "@/pages/DashboardPage";
import ClientsPage from "@/pages/ClientsPage";
import ClientDetailPage from "@/pages/ClientDetailPage";
import OperationsPage from "@/pages/OperationsPage";
import AlertsPage from "@/pages/AlertsPage";
import ReportsPage from "@/pages/ReportsPage";
import ListsPage from "@/pages/ListsPage";
import RulesEnginePage from "@/pages/RulesEnginePage";
import AuditPage from "@/pages/AuditPage";
import ConfigPage from "@/pages/ConfigPage";
import MatrizRiesgoPage from '@/pages/MatrizRiesgoPage';
import RegistroPage from "@/pages/registro/RegistroPage";
import NotariosPage from "@/pages/registro/NotariosPage";
import GraciasPage from "@/pages/registro/GraciasPage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Rutas públicas (sin auth) */}
            <Route path="/registro" element={<RegistroPage />} />
            <Route path="/registro/notarios" element={<NotariosPage />} />
            <Route path="/registro/gracias" element={<GraciasPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/recuperar" element={<RecuperarPasswordPage />} />
            <Route path="/restablecer" element={<RestablecerPasswordPage />} />
            {/* Fuera del layout y sin barra lateral: hasta activar el segundo
                factor no se llega a ninguna pantalla con datos. */}
            <Route
              path="/seguridad/2fa"
              element={
                <ProtectedRoute>
                  <AltaSegundoFactorPage />
                </ProtectedRoute>
              }
            />

            {/* Rutas protegidas */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route
                path="/clientes"
                element={
                  <ProtectedRoute requireAnyRole={['operador', 'oc', 'admin']}>
                    <ClientsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/clientes/:id"
                element={
                  <ProtectedRoute requireAnyRole={['operador', 'oc', 'admin']}>
                    <ClientDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/operaciones"
                element={
                  <ProtectedRoute requireAnyRole={['operador', 'oc', 'admin']}>
                    <OperationsPage />
                  </ProtectedRoute>
                }
              />
              {/* Identidad se fundió con Comparecientes: era una segunda lista
                  del mismo padrón, y quien quería saber si alguien estaba
                  verificado tenía dos sitios donde mirar. La ruta se conserva
                  redirigiendo porque hay enlaces guardados y correos con ella;
                  un 404 en su lugar haría pensar que la función desapareció. */}
              <Route
                path="/verificacion"
                element={<Navigate to="/clientes" replace />}
              />
              <Route
                path="/alertas"
                element={
                  <ProtectedRoute requireAnyRole={['oc', 'admin']}>
                    <AlertsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reportes"
                element={
                  <ProtectedRoute requireAnyRole={['oc', 'admin']}>
                    <ReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/auditoria"
                element={
                  <ProtectedRoute requireAnyRole={['oc', 'admin']}>
                    <AuditPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/listas"
                element={
                  <ProtectedRoute requireRole="admin">
                    <ListsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reglas"
                element={
                  <ProtectedRoute requireRole="admin">
                    <RulesEnginePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/matriz"
                element={
                  <ProtectedRoute requireAnyRole={['oc', 'admin']}>
                    <MatrizRiesgoPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/configuracion"
                element={
                  <ProtectedRoute requireRole="admin">
                    <ConfigPage />
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
