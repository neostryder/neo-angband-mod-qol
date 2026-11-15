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
  const transformers = new Map<string, MenuTransformer>();
  if (previous) transformers.set(MENU_ID, previous);
  const menus = {
    handlerFor: vi.fn((id: string) => transformers.get(id) ?? null),
    register: vi.fn((id: string, next: MenuTransformer) => { transformers.set(id, next); }),
  };
  const mod = {
    meta: { flags, newCharacter: false, log: vi.fn() },
    engine: { registry: { menus } },
  } as unknown as ModApi2;
  return { mod, menus, transform: (input: readonly MenuTransformRow[] = rows, id = MENU_ID) => transformers.get(id)?.(id, input) ?? input };
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
      "Show what you have learned about this item so far.", "Wear or wield it in the matching equipment slot.", "Drink the potion.",
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
    expect(h.transform()[0]).toMatchObject({ id: "inspect", label: "Known: Inspect", disabled: true, hint: "Show what you have learned about this item so far." });
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
    expect(h.transform()[0]?.hint).toBe("Show what you have learned about this item so far.");
    expect(h.menus.register).toHaveBeenCalledTimes(8);
  });

  it("adds command browser hints through stable table references in both keysets", async () => {
    const h = harness({ "qol.contextHelp": true });
    await plugin.start(h.mod);
    const table: MenuTransformRow[] = [
      { id: "core:keypress-command:0", label: "Wear/wield an item", semantic: { kind: "keypress-command", ref: 0, data: { originalKey: "w", roguelikeKey: "w" } } },
      { id: "core:keypress-command:1", label: "Use a staff", semantic: { kind: "keypress-command", ref: 1, data: { originalKey: "u", roguelikeKey: "Z" } } },
    ];
    expect(h.transform(table, "core:keypress-command-table")).toBe(table);
    for (const key of ["u", "Z"]) {
      const input: MenuTransformRow[] = [
        { id: table[0]!.id, label: "Wear/wield an item (w)", semantic: { kind: "keypress-command", ref: table[0]!.id } },
        { id: table[1]!.id, label: "Use a staff (" + key + ")", semantic: { kind: "keypress-command", ref: table[1]!.id } },
      ];
      const result = h.transform(input, "core:keypress-command:items");
      expect(result.map((row) => row.hint)).toEqual(["Wear or wield it in the matching equipment slot.", "Use the staff, spending one of its charges."]);
      expect(result.map(({ hint: _hint, ...row }) => row)).toEqual(input);
      const hinted = [{ ...input[0]!, hint: "Existing help." }];
      expect(h.transform(hinted, "core:keypress-command:items")[0]).toBe(hinted[0]);
    }
    const unknown: MenuTransformRow[] = [{ id: "future", label: "Future", semantic: { kind: "keypress-command", ref: "future" } }];
    expect(h.transform(unknown, "core:keypress-command:items")[0]).toBe(unknown[0]);
  });

  it("keeps an action's help when an earlier transformer remaps its key", () => {
    const h = harness({});
    h.menus.register("core:keypress-command-table", (_id, input) => input.map((row) => ({ ...row, semantic: { ...row.semantic, data: { ...row.semantic.data, originalKey: "r" } } })));
    installContextHelp(h.mod);
    const table: MenuTransformRow[] = [{ id: "core:keypress-command:7", label: "Use a staff", semantic: { kind: "keypress-command", ref: 7, data: { originalKey: "u" } } }];
    h.transform(table, "core:keypress-command-table");
    const input: MenuTransformRow[] = [{ id: table[0]!.id, label: "Use a staff (r)", semantic: { kind: "keypress-command", ref: table[0]!.id } }];
    expect(h.transform(input, "core:keypress-command:items")[0]?.hint).toBe("Use the staff, spending one of its charges.");
  });

  it("does nothing without the first-party registry seam", () => {
    expect(() => installContextHelp({} as ModApi2)).not.toThrow();
    expect(() => installContextHelp({ engine: { registry: undefined } } as unknown as ModApi2)).not.toThrow();
  });
});
