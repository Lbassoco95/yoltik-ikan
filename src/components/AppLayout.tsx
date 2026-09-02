import { AvisoDemostracion } from "@/components/AvisoDemostracion";
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/**
 * Marco de la aplicación de clientes.
 *
 * En un teléfono la barra lateral NO ocupa espacio: se superpone cuando se
 * abre y se quita al navegar. Antes era una columna fija de 260 px que en una
 * pantalla de 390 dejaba 130 para el contenido —y el botón para plegarla
 * existía pero nadie lo había conectado, así que no había forma de recuperar
 * ese espacio—. Eso, y no las tablas, es lo que hacía que el documento midiera
 * 1144 px en un viewport de 390.
 */
export default function AppLayout() {
  const [colapsada, setColapsada] = useState(false);
  const [menuMovil, setMenuMovil] = useState(false);
  const { pathname } = useLocation();

  // Navegar cierra el menú: en un teléfono la barra tapa la pantalla entera y
  // dejarla abierta encima de la pantalla recién abierta no tiene sentido.
  useEffect(() => setMenuMovil(false), [pathname]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      {menuMovil && (
        <button
          type="button"
          aria-label="Cerrar el menú"
          className="fixed inset-0 z-40 bg-foreground/40 md:hidden"
          onClick={() => setMenuMovil(false)}
        />
      )}

      <AppSidebar
        collapsed={colapsada}
        onToggle={() => setColapsada(!colapsada)}
        className={
          menuMovil ? "fixed inset-y-0 left-0 z-50 md:static" : "hidden md:flex"
        }
      />

      <div className="flex-1 flex flex-col min-w-0">
        <AvisoDemostracion />
        <AppHeader
          onToggleSidebar={() => {
            setMenuMovil((v) => !v);
            setColapsada((v) => (window.innerWidth >= 768 ? !v : v));
          }}
        />
        <main className="flex-1 min-w-0 p-4 sm:p-6 overflow-auto">
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
