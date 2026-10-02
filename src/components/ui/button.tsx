import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Jade, no navy. La regla de la marca es que el color anuncia: el
        // jade es «lo que se puede hacer». Un botón principal en navy se
        // confunde con la estructura —la barra, la cabecera, el texto— y deja
        // de leerse como algo que se pulsa. Es el jade oscuro: el blanco de
        // 14 px sobre el jade de marca no llega a 4.5:1.
        default:
          "bg-ikan-jade-oscuro text-white shadow-[0_8px_20px_-10px_rgba(0,107,91,0.8)] hover:bg-[#005A4C]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // El hover de outline y ghost era jade macizo: al pasar el ratón por
        // un botón secundario la pantalla se llenaba del color de la acción
        // principal. Ahora sube un peldaño de gris y ya.
        outline:
          "border border-input bg-white/60 hover:bg-white/85 hover:text-foreground dark:bg-white/[0.06] dark:hover:bg-white/[0.12]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-accent underline-offset-4 hover:underline",
        /** Navy, para cuando la acción es de estructura y no de avance. */
        navy: "bg-primary text-primary-foreground hover:bg-primary/90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3.5",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
