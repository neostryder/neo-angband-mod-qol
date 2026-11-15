import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";
import type { MenuTransformer, MenuTransformRow } from "@rpgm-tools/neo-angband-core";
import plugin from "./plugin";
import { installContextHelp } from "./context-help";

const MENU_ID = "core:context-object";
const rows: readonly MenuTransformRow[] = [
  { id: "inspect", label: "Inspect", semantic: { kind: "command", ref: "inspect" } },
  { id: "equip", label: "Equip", semantic: { kind: "command", ref: "equip" }, disabled: true },
  { id: "quaff", label: "Quaff", semantic: { kind: "command", ref: "quaff" } },
];

function harness(flags: Readonly<Record<string, boolean>>, previous: MenuTransformer | null = null) {
  let transformer: MenuTransformer | null = previous;
  const menus = {
    handlerFor: vi.fn(() => transformer),
    register: vi.fn((_id: string, next: MenuTransformer) => { transformer = next; }),
  };
  const mod = {
    meta: { flags, newCharacter: false, log: vi.fn() },
    engine: { registry: { menus } },
  } as unknown as ModApi2;
  return { mod, menus, transform: (input: readonly MenuTransformRow[] = rows) => transformer?.(MENU_ID, input) ?? input };
}

afterEach(() => plugin.stop());

describe("item context help", () => {
  it("registers nothing and preserves rows by identity with the setting absent or false", async () => {
    for (const flags of [{}, { "qol.contextHelp": false }]) {
      const h = harness(flags);
      await plugin.start(h.mod);
      expect(h.menus.register).not.toHaveBeenCalled();
      expect(h.menus.handlerFor).not.toHaveBeenCalled();
      expect(h.transform()).toBe(rows);
    }
  });

  it("adds hints to the real context action names without changing their choices", async () => {
    const h = harness({ "qol.contextHelp": true });
    await plugin.start(h.mod);
    expect(h.menus.register).toHaveBeenCalledWith(MENU_ID, expect.any(Function));
    const result = h.transform();
    expect(result.map((row) => row.hint)).toEqual([
      "Read the item's known properties.", "Wear or wield this item in a matching slot.", "Drink this potion.",
    ]);
    expect(result.map(({ hint: _hint, ...row }) => row)).toEqual(rows);
  });

  it("keeps existing hints and unknown actions intact", () => {
    const h = harness({});
    installContextHelp(h.mod);
    const input: MenuTransformRow[] = [
      { ...rows[0]!, hint: "The game's own hint." },
      { id: "future", label: "Future action", semantic: { kind: "command", ref: "future" } },
      { id: "other", label: "Other", semantic: { kind: "category", ref: "inspect" } },
      { id: "number", label: "Number", semantic: { kind: "command", ref: 1 } },
      { id: "prototype", label: "Prototype", semantic: { kind: "command", ref: "constructor" } },
    ];
    expect(h.transform(input)).toEqual(input);
    for (const [index, row] of h.transform(input).entries()) expect(row).toBe(input[index]);
  });

  it("composes after an existing transformer and keeps its wording and disabled state", () => {
    const previous = vi.fn((_id: string, input: readonly MenuTransformRow[]) => input.map((row) => ({ ...row, label: `Known: ${row.label}`, disabled: true })));
    const h = harness({}, previous);
    installContextHelp(h.mod);
    expect(h.transform()[0]).toMatchObject({ id: "inspect", label: "Known: Inspect", disabled: true, hint: "Read the item's known properties." });
    expect(previous).toHaveBeenCalledWith(MENU_ID, rows);
  });

  it("needs no object, monster, or world view", () => {
    const h = harness({});
    const mod = new Proxy(h.mod, {
      get(target, key, receiver) {
        if (key !== "engine") throw new Error(`unexpected domain ${String(key)}`);
        return Reflect.get(target, key, receiver);
      },
    });
    installContextHelp(mod);
    expect(h.transform()[0]?.hint).toBe("Read the item's known properties.");
    expect(h.menus.register).toHaveBeenCalledTimes(1);
  });

  it("does nothing without the first-party registry seam", () => {
    expect(() => installContextHelp({} as ModApi2)).not.toThrow();
    expect(() => installContextHelp({ engine: { registry: undefined } } as unknown as ModApi2)).not.toThrow();
  });
});
