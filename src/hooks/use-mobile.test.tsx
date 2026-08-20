import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "./use-mobile";

describe("useIsMobile", () => {
  const originalMatchMedia = window.matchMedia;
  const originalInnerWidth = window.innerWidth;
  let listeners: Set<(event: MediaQueryListEvent) => void>;
  let mediaQueryList: MediaQueryList;

  beforeEach(() => {
    listeners = new Set();
    mediaQueryList = {
      matches: false,
      media: "(max-width: 767px)",
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (
        _type: string,
        listener: EventListenerOrEventListenerObject,
      ) => {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      },
      removeEventListener: (
        _type: string,
        listener: EventListenerOrEventListenerObject,
      ) => {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      },
      dispatchEvent: () => true,
    } as MediaQueryList;
    window.matchMedia = vi.fn(() => mediaQueryList);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
  });

  function setInnerWidth(width: number) {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: width,
    });
  }

  function fireChange() {
    listeners.forEach((listener) =>
      listener(new Event("change") as MediaQueryListEvent),
    );
  }

  it("es falso a partir de 768 píxeles", () => {
    setInnerWidth(768);
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it("es verdadero por debajo de 768 píxeles", () => {
    setInnerWidth(767);
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it("revalúa el ancho cuando cambia el media query", () => {
    setInnerWidth(900);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    setInnerWidth(500);
    act(fireChange);
    expect(result.current).toBe(true);
  });

  it("elimina el listener al desmontarse", () => {
    const { unmount } = renderHook(() => useIsMobile());
    expect(listeners.size).toBe(1);

    unmount();
    expect(listeners.size).toBe(0);
  });
});
