import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // ESTELA: índice de expediente, no pastillas dentro de una caja gris.
      // Las pastillas parecen un conmutador de ajustes; un expediente tiene
      // apartados, y un apartado se señala con una línea debajo del que estás
      // leyendo. Además la fila se desplaza en horizontal: cinco apartados con
      // nombres largos no caben en un teléfono y antes se estrujaban.
      "inline-flex w-full items-center gap-1 overflow-x-auto border-b border-border text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // El jade marca el apartado abierto: es lo accionable de la fila. La
      // línea va sobre el borde de la lista, de ahí el -mb-px.
      "-mb-px inline-flex shrink-0 items-center justify-center whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-semibold transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-accent data-[state=active]:text-foreground",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      // Sin anillo de foco. Radix enfoca este panel por programa al cambiar
      // de apartado —no porque nadie lo haya tabulado—, y Chrome lo trataba
      // como foco visible: el resultado era un recuadro jade de 2 px
      // alrededor de todo el contenido cada vez que se pulsaba una pestaña, y
      // parecía un fallo. Quien tabula ve el foco en la pestaña, que es el
      // control de verdad.
      "mt-4 focus-visible:outline-none",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
