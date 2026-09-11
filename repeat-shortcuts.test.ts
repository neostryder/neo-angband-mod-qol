import { describe, expect, it, vi } from "vitest";
import { defaultRepeatShortcuts, installRepeatShortcuts } from "./repeat-shortcuts";
import { readHideRepeatShortcuts, withHideRepeatShortcuts } from "./preferences";

describe("repeated-action shortcuts", () => {
  it("offers one key for the conditional-rest command sequence only", () => {
    /* No run shortcuts: `.` plus a direction (original keyset) or one shifted
     * direction key (roguelike) are already as short as a bound key would
     * make them, so a run binding here would save nothing (#151). */
    expect(defaultRepeatShortcuts()).toEqual([
      { trigger: "F1", label: "Rest as needed", action: "R&[Enter]" },
    ]);
  });
});

describe("permanently hiding the card (#198)", () => {
  it("round-trips the hidden flag without disturbing sibling preferences", () => {
    const withDisplay = { v: 2, display: { v: 1, zoomIndex: 2, interfaceZoomIndex: 1, mapDetail: 0 } };
    expect(readHideRepeatShortcuts(withDisplay)).toBe(false);
    const hidden = withHideRepeatShortcuts(withDisplay, true);
    expect(readHideRepeatShortcuts(hidden)).toBe(true);
    expect(hidden.display).toEqual(withDisplay.display);
  });

  it("defaults to false for anything not a v2 envelope", () => {
    expect(readHideRepeatShortcuts(undefined)).toBe(false);
    expect(readHideRepeatShortcuts({ v: 1, hideRepeatShortcuts: true })).toBe(false);
  });

  it("never opens the card once the player has permanently dismissed it", () => {
    const openPanel = vi.fn();
    installRepeatShortcuts({
      ui: { openPanel },
      keymaps: { isBindableTriggerKey: () => true, bind: () => true },
      prefs: { get: () => ({ v: 2, hideRepeatShortcuts: true }), set: vi.fn() },
    });
    expect(openPanel).not.toHaveBeenCalled();
  });

  it("still asks the host for a panel when nothing has hidden it yet", () => {
    /* Only the gate is asserted here, not the drawn card itself: drawPrompt
     * needs a real DOM (document.createElement, a shadow root), which this
     * test environment does not have - see zoom-pan.ts's own
     * typeof document === "undefined" guard for the same constraint. The
     * drawn card is covered by live verification instead. */
    const openPanel = vi.fn(() => {
      throw new Error("stop before drawPrompt touches document");
    });
    expect(() =>
      installRepeatShortcuts({
        ui: { openPanel },
        keymaps: { isBindableTriggerKey: () => true, bind: () => true },
        prefs: { get: () => undefined, set: vi.fn() },
      }),
    ).not.toThrow();
    expect(openPanel).toHaveBeenCalledOnce();
  });
});
