import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * ESTELA: canto de 4 px en vez de píldora, y siempre con texto —el color
 * refuerza, no informa—.
 *
 * Los cuatro significados de la paleta, y ninguno más:
 *   accent (jade)  · lo que se puede hacer
 *   success        · lo que está en orden
 *   warning (ámbar)· lo que le toca atender
 *   destructive    · lo que está roto
 *   barro          · lo vencido o irreversible. Uno por vista como máximo.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive/10 text-destructive",
        outline: "text-foreground",
        accent: "border-transparent bg-accent/10 text-accent",
        success: "border-transparent bg-success/10 text-success",
        warning:
          "border-transparent bg-warning/15 text-warning-foreground dark:text-ikan-ambar",
        barro:
          "border-transparent bg-ikan-barro/10 text-ikan-barro dark:text-[#D08672]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
