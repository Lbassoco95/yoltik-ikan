import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { LoginPage } from "@/pages/auth/Login";
import { RecuperarPasswordPage } from "@/pages/auth/RecuperarPassword";
import { RestablecerPasswordPage } from "@/pages/auth/RestablecerPassword";
import DashboardPage from "@/pages/DashboardPage";
import ClientsPage from "@/pages/ClientsPage";
import ClientDetailPage from "@/pages/ClientDetailPage";
import OperationsPage from "@/pages/OperationsPage";
import AlertsPage from "@/pages/AlertsPage";
import ReportsPage from "@/pages/ReportsPage";
import ListsPage from "@/pages/ListsPage";
import RulesEnginePage from "@/pages/RulesEnginePage";
import VerificationPage from "@/pages/VerificationPage";
import AuditPage from "@/pages/AuditPage";
import ConfigPage from "@/pages/ConfigPage";
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
              <Route
                path="/verificacion"
                element={
                  <ProtectedRoute requireAnyRole={['operador', 'oc']}>
                    <VerificationPage />
                  </ProtectedRoute>
                }
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
