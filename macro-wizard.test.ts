import { describe, expect, it, vi } from "vitest";
import { bindAbilityMacro, macroActionFor, suggestedMacroTrigger } from "./macro-wizard";

describe("activation shortcut helper", () => {
  it("prefers the first free function key", () => {
    expect(suggestedMacroTrigger({ isBindableTriggerKey: (key) => key === "F3", bind: () => false })).toBe("F3");
  });

  it("binds the host casting and activation commands only through the keymap facade", () => {
    const bind = vi.fn(() => true);
    const keymaps = { isBindableTriggerKey: (key: string) => key === "F4", bind };
    expect(macroActionFor({ kind: "spell", name: "Magic Missile", command: "cast" })).toBe("m");
    expect(macroActionFor({ kind: "activation", name: "Ring of Flames", command: "activate" })).toBe("A");
    expect(bindAbilityMacro(keymaps, { kind: "activation", name: "Ring of Flames", command: "activate" }, "F4")).toBe(true);
    expect(bind).toHaveBeenCalledWith("F4", "A");
    expect(bindAbilityMacro(keymaps, { kind: "spell", name: "Magic Missile", command: "cast" }, "F5")).toBe(false);
  });
});
