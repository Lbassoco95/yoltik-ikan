import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
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
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/clientes" element={<ClientsPage />} />
            <Route path="/clientes/:id" element={<ClientDetailPage />} />
            <Route path="/operaciones" element={<OperationsPage />} />
            <Route path="/alertas" element={<AlertsPage />} />
            <Route path="/reportes" element={<ReportsPage />} />
            <Route path="/listas" element={<ListsPage />} />
            <Route path="/reglas" element={<RulesEnginePage />} />
            <Route path="/verificacion" element={<VerificationPage />} />
            <Route path="/auditoria" element={<AuditPage />} />
            <Route path="/configuracion" element={<ConfigPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
