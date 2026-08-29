import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AdminLayout } from "@/components/AdminLayout";
import { LoginPage } from "@/pages/auth/Login";
import { RecuperarPasswordPage } from "@/pages/auth/RecuperarPassword";
import { RestablecerPasswordPage } from "@/pages/auth/RestablecerPassword";
import AdminListasPage from "@/pages/admin/AdminListasPage";
import AdminParametrosPage from "@/pages/admin/AdminParametrosPage";

/**
 * Consola de plataforma de Kawiil.
 *
 * Aplicación SEPARADA de la que usan los sujetos obligados: se despliega en su
 * propio proyecto de Vercel y su propio dominio. Comparte el código y la base,
 * no el despliegue.
 *
 * Ojo con lo que esto sí y no es: la separación da despliegues independientes
 * y evita que un cliente se tope con URLs internas. La frontera de SEGURIDAD
 * sigue siendo la RLS más `platform_admin` (migration 0008), no el dominio.
 * Un dominio distinto no protege datos; las políticas sí.
 */
const queryClient = new QueryClient();

const AdminApp = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/recuperar" element={<RecuperarPasswordPage />} />
            <Route path="/restablecer" element={<RestablecerPasswordPage />} />

            <Route
              element={
                <ProtectedRoute requirePlatformAdmin>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Navigate to="/listas" replace />} />
              <Route path="/listas" element={<AdminListasPage />} />
              <Route path="/parametros" element={<AdminParametrosPage />} />
            </Route>

            {/* La consola no tiene página de "no encontrado" propia: cualquier
                ruta desconocida va al inicio, que ya está protegido. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default AdminApp;
