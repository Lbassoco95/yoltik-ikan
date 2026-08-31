import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

/**
 * Punto de entrada único para dos aplicaciones distintas.
 *
 * `VITE_APP_TARGET` decide cuál se monta, y se fija en tiempo de BUILD:
 *
 *   app    (o sin definir)  Ikán para sujetos obligados. Es lo que ve el
 *                           notario o el exchange.
 *   admin                   Consola de plataforma de Kawiil. Se despliega en
 *                           su propio proyecto de Vercel y su propio dominio.
 *
 * Vite sustituye `import.meta.env.VITE_APP_TARGET` por un literal al compilar,
 * así que la condición se resuelve estáticamente y Rollup descarta el
 * `import()` de la rama que no aplica: el bundle de la app de clientes NO
 * incluye el código de la consola, ni al revés.
 *
 * Recordatorio: la separación es OPERATIVA, no de seguridad. La frontera real
 * es la RLS más `platform_admin` en la base. Un dominio
 * distinto evita que un cliente se tope con URLs internas y permite desplegar
 * por separado; no protege datos por sí solo.
 */
const ES_CONSOLA_ADMIN = import.meta.env.VITE_APP_TARGET === "admin";

const RootApp = ES_CONSOLA_ADMIN
  ? lazy(() => import("./AdminApp.tsx"))
  : lazy(() => import("./App.tsx"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-muted-foreground">
          Cargando…
        </div>
      }
    >
      <RootApp />
    </Suspense>
  </StrictMode>,
);
