import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useActiveRole } from "./useActiveRole";
import { useAuth } from "@/lib/auth-context";

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

describe("useActiveRole", () => {
  it.each([
    [["operador"], false],
    [["operador", "oc"], true],
  ] as const)("indica si hay múltiples roles", (roles, hasMultipleRoles) => {
    const setActiveRole = vi.fn();
    mockedUseAuth.mockReturnValue({
      activeRole: roles[0],
      setActiveRole,
      roles,
    } as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useActiveRole());

    expect(result.current.hasMultipleRoles).toBe(hasMultipleRoles);
  });

  it("expone el rol activo y su setter", () => {
    const setActiveRole = vi.fn();
    mockedUseAuth.mockReturnValue({
      activeRole: "oc",
      setActiveRole,
      roles: ["operador", "oc"],
    } as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useActiveRole());

    expect(result.current.activeRole).toBe("oc");
    result.current.setActiveRole("operador");
    expect(setActiveRole).toHaveBeenCalledWith("operador");
  });
});
