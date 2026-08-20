import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ToastModule = typeof import("./use-toast");

const toastState = (id: string, open = true) => ({
  id,
  open,
  title: id,
});

describe("reducer de notificaciones", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  async function loadToastModule(): Promise<ToastModule> {
    return import("./use-toast");
  }

  it("agrega al frente y limita la lista a una notificación", async () => {
    const { reducer } = await loadToastModule();
    const state = { toasts: [toastState("primera")] };

    expect(
      reducer(state, { type: "ADD_TOAST", toast: toastState("segunda") }),
    ).toEqual({ toasts: [toastState("segunda")] });
  });

  it("actualiza únicamente la notificación con el id indicado", async () => {
    const { reducer } = await loadToastModule();
    const state = { toasts: [toastState("uno"), toastState("dos")] };

    expect(
      reducer(state, {
        type: "UPDATE_TOAST",
        toast: { id: "dos", description: "actualizada" },
      }),
    ).toEqual({
      toasts: [
        toastState("uno"),
        { ...toastState("dos"), description: "actualizada" },
      ],
    });
  });

  it("descarta una notificación o todas según el id", async () => {
    const { reducer } = await loadToastModule();
    const state = { toasts: [toastState("uno"), toastState("dos")] };

    expect(reducer(state, { type: "DISMISS_TOAST", toastId: "uno" })).toEqual({
      toasts: [toastState("uno", false), toastState("dos")],
    });
    expect(reducer(state, { type: "DISMISS_TOAST" })).toEqual({
      toasts: [toastState("uno", false), toastState("dos", false)],
    });
  });

  it("elimina una notificación o todas según el id", async () => {
    const { reducer } = await loadToastModule();
    const state = { toasts: [toastState("uno"), toastState("dos")] };

    expect(reducer(state, { type: "REMOVE_TOAST", toastId: "uno" })).toEqual({
      toasts: [toastState("dos")],
    });
    expect(reducer(state, { type: "REMOVE_TOAST" })).toEqual({ toasts: [] });
  });

  it("expone una superficie para crear, actualizar y descartar notificaciones", async () => {
    const { toast, useToast } = await loadToastModule();
    const { result, unmount } = renderHook(() => useToast());

    let created: ReturnType<typeof toast>;
    act(() => {
      created = result.current.toast({ title: "Aviso" });
    });
    expect(created!.id).toBeDefined();
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      id: created!.id,
      title: "Aviso",
      open: true,
    });

    act(() => {
      created!.update({ id: created!.id, description: "Detalle" });
    });
    expect(result.current.toasts[0]).toMatchObject({ description: "Detalle" });

    act(() => {
      created!.dismiss();
    });
    expect(result.current.toasts[0].open).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1000000);
    });
    expect(result.current.toasts).toEqual([]);
    unmount();
  });
});
