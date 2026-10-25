import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bindAbilityMacro,
  macroActionFor,
  macroPanel,
  offerAbilityMacro,
  startMacroWizard,
  stopMacroWizard,
  suggestedMacroTrigger,
  type MacroWizardMod,
} from "./macro-wizard";

const ok = <T>(value: T): Promise<{ ok: true; value: T }> => Promise.resolve({ ok: true, value });
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const FLAMES = { kind: "activation", name: "Ring of Flames", command: "activate" } as const;
const MISSILE = { kind: "spell", name: "Magic Missile", command: "cast" } as const;

/** A wizard API whose free keys are the ones named, recording what it was asked to show. */
function fakeMod(free: readonly string[]) {
  const bind = vi.fn(() => ok(null));
  const mounted: { panel: ReturnType<typeof macroPanel>; onAction: (action: string, value?: string | boolean) => void; onDismiss: () => void }[] = [];
  const patch = vi.fn(() => ok({ panelId: "activation-shortcut" }));
  const unmount = vi.fn(() => ok(null));
  const log = vi.fn();
  const mod = {
    ui: {
      keys: { isBindableTriggerKey: (key: string) => ok(free.includes(key)), bind },
      mount: vi.fn((panel: never, onAction: never, onDismiss: never) => {
        mounted.push({ panel, onAction, onDismiss });
        return ok({ panelId: "activation-shortcut" });
      }),
      unmount,
      patch,
    },
    meta: { log },
  } as unknown as MacroWizardMod;
  return { mod, bind, mounted, patch, unmount, log };
}

afterEach(() => {
  stopMacroWizard();
});

describe("activation shortcut helper", () => {
  it("prefers the first free function key", async () => {
    expect(await suggestedMacroTrigger(fakeMod(["F3"]).mod.ui.keys)).toBe("F3");
    expect(await suggestedMacroTrigger(fakeMod([]).mod.ui.keys)).toBeNull();
  });

  it("binds the host casting and activation commands only through the keymap facade", async () => {
    const { mod, bind } = fakeMod(["F4"]);
    expect(macroActionFor(MISSILE)).toBe("m");
    expect(macroActionFor(FLAMES)).toBe("A");
    expect(await bindAbilityMacro(mod.ui.keys, FLAMES, "F4")).toBe(true);
    expect(bind).toHaveBeenCalledWith("F4", "A");
    expect(await bindAbilityMacro(mod.ui.keys, MISSILE, "F5")).toBe(false);
  });

  it("draws a modal card naming the ability, with a key field and two buttons", () => {
    const panel = macroPanel(FLAMES, "F4");
    expect(panel.id).toBe("activation-shortcut");
    expect(panel.title).toBe("Shortcut for Ring of Flames");
    expect(panel.modal).toBe(true);
    expect(JSON.stringify(panel.root)).toContain('"action":"set-key"');
    expect(JSON.stringify(panel.root)).toContain('"value":"F4"');
    expect(JSON.stringify(panel.root)).toContain("activation command");
    expect(JSON.stringify(macroPanel(MISSILE, "F4").root)).toContain("casting command");
    expect(JSON.stringify(macroPanel(MISSILE, "F4", "That key is unavailable.").root)).toContain("unavailable");
  });

  it("offers the free key, binds it on accept, and closes the card", async () => {
    const { mod, bind, mounted, unmount } = fakeMod(["F2"]);
    startMacroWizard(mod);
    offerAbilityMacro(FLAMES);
    await settle();
    expect(mounted).toHaveLength(1);
    expect(JSON.stringify(mounted[0]!.panel.root)).toContain('"value":"F2"');
    mounted[0]!.onAction("bind");
    await settle();
    expect(bind).toHaveBeenCalledWith("F2", "A");
    expect(unmount).toHaveBeenCalledWith("activation-shortcut");
  });

  it("binds the key the player typed instead", async () => {
    const { mod, bind, mounted } = fakeMod(["F2", "F9"]);
    startMacroWizard(mod);
    offerAbilityMacro(MISSILE);
    await settle();
    mounted[0]!.onAction("set-key", " F9 ");
    mounted[0]!.onAction("bind");
    await settle();
    expect(bind).toHaveBeenCalledWith("F9", "m");
  });

  it("keeps the card open and says why when the typed key is taken", async () => {
    const { mod, bind, mounted, patch, unmount } = fakeMod(["F2"]);
    startMacroWizard(mod);
    offerAbilityMacro(MISSILE);
    await settle();
    mounted[0]!.onAction("set-key", "q");
    mounted[0]!.onAction("bind");
    await settle();
    expect(bind).not.toHaveBeenCalled();
    expect(unmount).not.toHaveBeenCalled();
    expect(JSON.stringify(patch.mock.calls[0])).toContain("That key is unavailable");
  });

  it("shows the next offer only after the first is answered", async () => {
    const { mod, mounted } = fakeMod(["F2"]);
    startMacroWizard(mod);
    offerAbilityMacro(FLAMES);
    offerAbilityMacro(MISSILE);
    await settle();
    expect(mounted).toHaveLength(1);
    mounted[0]!.onAction("decline");
    await settle();
    expect(mounted).toHaveLength(2);
    expect(mounted[1]!.panel.title).toBe("Shortcut for Magic Missile");
  });

  it("holds offers that arrive before the game is ready", async () => {
    const { mod, mounted } = fakeMod(["F2"]);
    offerAbilityMacro(FLAMES);
    await settle();
    expect(mounted).toHaveLength(0);
    startMacroWizard(mod);
    await settle();
    expect(mounted).toHaveLength(1);
  });

  it("logs and moves on when no function key is free", async () => {
    const { mod, mounted, log } = fakeMod([]);
    startMacroWizard(mod);
    offerAbilityMacro(FLAMES);
    await settle();
    expect(mounted).toHaveLength(0);
    expect(log).toHaveBeenCalledWith("no unused keymap trigger is available for Ring of Flames");
  });

  it("closes the card and drops queued offers when the mod stops", async () => {
    const { mod, mounted, unmount } = fakeMod(["F2"]);
    startMacroWizard(mod);
    offerAbilityMacro(FLAMES);
    offerAbilityMacro(MISSILE);
    await settle();
    stopMacroWizard();
    expect(unmount).toHaveBeenCalledWith("activation-shortcut");
    await settle();
    expect(mounted).toHaveLength(1);
  });
});
