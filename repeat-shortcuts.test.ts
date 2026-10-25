import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonValue } from "@rpgm-tools/neo-angband-mod-sdk";
import {
  defaultRepeatShortcuts,
  repeatShortcutsPanel,
  startRepeatShortcuts,
  stopRepeatShortcuts,
  type RepeatShortcutsMod,
} from "./repeat-shortcuts";
import { readHideRepeatShortcuts, withHideRepeatShortcuts } from "./preferences";

const ok = <T>(value: T): Promise<{ ok: true; value: T }> => Promise.resolve({ ok: true, value });
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** A card API with the given stored preferences and free keys, recording what it was asked to show. */
function fakeMod(stored: JsonValue | null, free: readonly string[] = ["F1"]) {
  let prefs = stored;
  const bind = vi.fn(() => ok(null));
  const mounted: { panel: ReturnType<typeof repeatShortcutsPanel>; onAction: (action: string, value?: string | boolean) => void }[] = [];
  const patch = vi.fn(() => ok({ panelId: "repeated-action-shortcuts" }));
  const unmount = vi.fn(() => ok(null));
  const set = vi.fn((value: JsonValue | null) => {
    prefs = value;
    return ok(null);
  });
  const mod = {
    ui: {
      keys: { isBindableTriggerKey: (key: string) => ok(free.includes(key)), bind },
      mount: vi.fn((panel: never, onAction: never) => {
        mounted.push({ panel, onAction });
        return ok({ panelId: "repeated-action-shortcuts" });
      }),
      unmount,
      patch,
    },
    store: { prefs: { get: () => ok(prefs), set } },
    meta: { log: vi.fn() },
  } as unknown as RepeatShortcutsMod;
  return { mod, bind, mounted, patch, unmount, set, stored: () => prefs };
}

afterEach(() => {
  stopRepeatShortcuts();
});

describe("repeated-action shortcuts", () => {
  it("offers one key for the conditional-rest command sequence only", () => {
    /* No run shortcuts: `.` plus a direction (original keyset) or one shifted
     * direction key (roguelike) are already as short as a bound key would
     * make them, so a run binding here would save nothing (#151). */
    expect(defaultRepeatShortcuts()).toEqual([
      { trigger: "F1", label: "Rest as needed", action: "R&[Enter]" },
    ]);
  });

  it("draws a non-modal card with the key field, a Bind button, the hide box and Done", () => {
    const shortcuts = defaultRepeatShortcuts();
    const panel = repeatShortcutsPanel(shortcuts, ["F1"], [""]);
    expect(panel.id).toBe("repeated-action-shortcuts");
    expect(panel.modal).toBe(false);
    const drawn = JSON.stringify(panel.root);
    for (const action of ["set-key-0", "bind-0", "hide-forever", "done"]) expect(drawn).toContain(`"action":"${action}"`);
    expect(JSON.stringify(repeatShortcutsPanel(shortcuts, ["F1"], ["Bound."]).root)).toContain('"disabled":true');
  });

  it("binds the rest sequence to the free key when the player presses Bind", async () => {
    const { mod, bind, mounted, patch } = fakeMod(null);
    await startRepeatShortcuts(mod);
    expect(mounted).toHaveLength(1);
    mounted[0]!.onAction("bind-0");
    await settle();
    expect(bind).toHaveBeenCalledWith("F1", "R&[Enter]");
    expect(JSON.stringify(patch.mock.calls[0])).toContain("Bound.");
  });

  it("binds the key the player typed, and says when it is taken", async () => {
    const { mod, bind, mounted, patch } = fakeMod(null, ["F6"]);
    await startRepeatShortcuts(mod);
    mounted[0]!.onAction("bind-0");
    await settle();
    expect(bind).not.toHaveBeenCalled();
    expect(JSON.stringify(patch.mock.calls[0])).toContain("That key is unavailable.");
    mounted[0]!.onAction("set-key-0", " F6 ");
    mounted[0]!.onAction("bind-0");
    await settle();
    expect(bind).toHaveBeenCalledWith("F6", "R&[Enter]");
  });

  it("closes on Done", async () => {
    const { mod, mounted, unmount } = fakeMod(null);
    await startRepeatShortcuts(mod);
    mounted[0]!.onAction("done");
    expect(unmount).toHaveBeenCalledWith("repeated-action-shortcuts");
  });
});

describe("permanently hiding the card (#198)", () => {
  it("round-trips the hidden flag without disturbing remembered settings", () => {
    const options = { v: 1 as const, values: { auto_more: true }, hitpointWarn: 3, delayFactor: 2, lazymoveDelay: 1 };
    const hidden = withHideRepeatShortcuts({ v: 2, options }, true);
    expect(readHideRepeatShortcuts(hidden)).toBe(true);
    expect(hidden.options).toEqual(options);
  });

  it("defaults to false for anything not a v2 envelope", () => {
    expect(readHideRepeatShortcuts(undefined)).toBe(false);
    expect(readHideRepeatShortcuts({ v: 1, hideRepeatShortcuts: true })).toBe(false);
  });

  it("never opens the card once the player has permanently dismissed it", async () => {
    const { mod } = fakeMod({ v: 2, hideRepeatShortcuts: true });
    await startRepeatShortcuts(mod);
    expect(mod.ui.mount).not.toHaveBeenCalled();
  });

  it("writes the choice down when the box is ticked, keeping the rest of the preferences", async () => {
    const options = { v: 1, values: { auto_more: true }, hitpointWarn: 3, delayFactor: 2, lazymoveDelay: 1 };
    const { mod, mounted, stored } = fakeMod({ v: 2, options });
    await startRepeatShortcuts(mod);
    mounted[0]!.onAction("hide-forever", true);
    await settle();
    expect(stored()).toEqual({ v: 2, options, hideRepeatShortcuts: true });
  });
});
