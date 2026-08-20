import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Banner } from "@/components/shared/Banner";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  alertPriorityColors,
  clientRiskSolidColors,
  operationStatusColors,
} from "@/lib/status-colors";
import {
  formatMxn,
  formatMxnValue,
  formatMxnWithUnit,
  umaToMxn,
} from "@/lib/utils";

describe("utilidades compartidas", () => {
  it("formatea montos MXN y conversiones UMA", () => {
    expect(formatMxn(72930.15)).toBe("$72,930");
    expect(formatMxnWithUnit(72930.15)).toBe("$72,930 MXN");
    expect(formatMxnValue(900000)).toBe("$900,000");
    expect(umaToMxn(645)).toBeCloseTo(72930.15);
  });

  it("expone mapas de color tipados por estado", () => {
    expect(clientRiskSolidColors.Alto).toBe(
      "bg-destructive text-destructive-foreground",
    );
    expect(operationStatusColors.Alertada).toBe("bg-warning/10 text-warning");
    expect(alertPriorityColors.Baja).toBe("bg-muted text-muted-foreground");
  });
});

describe("componentes compartidos", () => {
  it("renderiza StatusBadge con clases adicionales", () => {
    render(<StatusBadge className="text-[10px]">Alta</StatusBadge>);
    expect(screen.getByText("Alta")).toHaveClass("status-badge", "text-[10px]");
  });

  it("renderiza encabezado con subtítulo y acción", () => {
    render(
      <PageHeader
        title="Alertas"
        subtitle="Hoy"
        action={<button>Nuevo</button>}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Alertas" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Hoy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo" })).toBeInTheDocument();
  });

  it("renderiza buscador controlado y banner variante", () => {
    render(
      <>
        <SearchInput aria-label="Buscar" value="texto" readOnly />
        <Banner variant="primarySubtle" layout="block">
          Aviso
        </Banner>
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Buscar" })).toHaveClass(
      "pl-10",
    );
    expect(screen.getByText("Aviso")).toHaveClass(
      "bg-primary/5",
      "border-primary/20",
    );
    expect(screen.getByText("Aviso")).not.toHaveClass("flex");
  });
});
