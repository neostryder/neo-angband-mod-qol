import { describe, expect, it, vi } from "vitest";
import type { Api2Panel, Api2Result, JsonValue, KnownItem, KnownWorldData, ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";
import { captureLoadout, inscriptionChecks, LoadoutManager, locatePiece, readLoadouts, withLoadouts } from "./loadouts";

function item(handle: number, extra: Partial<KnownItem> & { objectId?: number } = {}): KnownItem {
  return { handle, kindKey: "sword", label: "Sword " + String(handle), name: "Sword", inscription: null, ...extra } as KnownItem;
}

function harness(equipment: (KnownItem | null)[] = [item(1)], inventory: KnownItem[] = [item(2)]) {
  const state = { equipment, inventory, quiver: [] as KnownItem[], equipmentSlots: equipment.map(() => ({ type: "WEAPON", name: "weapon" })), player: { hp: 100, dead: false }, token: { epoch: 1, revision: 0 } };
  const world = () => state as unknown as KnownWorldData & { equipment: (KnownItem | null)[]; inventory: KnownItem[] };
  let bag: JsonValue | null = { other: "kept" };
  let action: ((action: string, value?: string | boolean) => void) | undefined;
  const panels: Api2Panel[] = [];
  let phase = "play";
  let prompt: object | null = null;
  const submit = vi.fn(async (_token: unknown, intent: { command: { code: string; args: { handle: number; slot?: number } } }): Promise<Api2Result<null>> => {
    const command = intent.command;
    const handle = command.args.handle;
    if (command.code === "takeoff") {
      const slot = state.equipment.findIndex((it) => it?.handle === handle);
      if (slot >= 0) { state.inventory.push(state.equipment[slot]!); state.equipment[slot] = null; }
    } else {
      const worn = [...state.inventory, ...state.quiver].find((it) => it.handle === handle);
      const slot = command.args.slot ?? 0;
      if (worn) {
        if (state.equipment[slot]) state.inventory.push(state.equipment[slot]!);
        state.equipment[slot] = worn;
        state.inventory = state.inventory.filter((it) => it.handle !== handle);
        state.quiver = state.quiver.filter((it) => it.handle !== handle);
      }
    }
    state.token = { ...state.token, revision: state.token.revision + 1 };
    return { ok: true as const, value: null };
  });
  const simulate = vi.fn(async () => ({ ok: true as const, value: { placements: [{ slot: 0, displaced: state.equipment[0] ?? null }] } }));
  const mount = vi.fn(async (panel: Api2Panel, onAction?: typeof action) => { panels.push(panel); action = onAction; return { ok: true, value: { panelId: panel.id } }; });
  const set = vi.fn(async (value: JsonValue | null): Promise<Api2Result<null>> => { bag = value; return { ok: true, value: null }; });
  const input = vi.fn(async () => ({ ok: true, value: { token: { ...state.token }, phase, prompt, messagePending: false, driver: { kind: "player" } } }));
  const mod = {
    view: { world: vi.fn(async () => ({ ok: true, value: structuredClone(world()) })), input, simulateLoadout: simulate },
    act: { submit },
    store: { character: { get: async () => ({ ok: true, value: bag }), set } },
    ui: { mount, patch: vi.fn(async () => ({ ok: true })), unmount: vi.fn(async () => ({ ok: true })) },
    meta: { log: vi.fn() },
  } as unknown as ModApi2;
  const delay = vi.fn(async () => {});
  const manager = new LoadoutManager(mod, delay);
  return { state, world, mod, manager, submit, simulate, panels, mount, input, delay, set, bag: () => bag,
    action: (name: string, value?: string) => action?.(name, value),
    phase: (value: string) => { phase = value; }, prompt: (value: object | null) => { prompt = value; },
    report: () => JSON.stringify(panels.at(-1)),
  };
}

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

describe("saved loadouts", () => {
  it("records empty slots and trims a name", () => {
    expect(captureLoadout("  melee  ", [item(1), null])).toEqual({ name: "melee", slots: [{ handle: 1, kindKey: "sword", name: "Sword" }, null] });
  });

  it("round trips JSON in the character bag without replacing other data", () => {
    const sets = [captureLoadout("melee", [item(1), null])];
    const bag = JSON.parse(JSON.stringify(withLoadouts({ other: 42 }, sets)));
    expect(bag.other).toBe(42);
    expect(readLoadouts(bag)).toEqual(sets);
    expect(readLoadouts(withLoadouts([], sets))).toEqual(sets);
  });

  it.each([null, [], { loadouts: { v: 2, sets: [] } }, { loadouts: { v: 1, sets: [null, { name: "bad", slots: [{ handle: -1 }] }, { name: "", slots: [] }] } }])("ignores malformed or future storage: %j", (bag) => {
    expect(readLoadouts(bag)).toEqual([]);
  });

  it("never guesses between items with the same name or kind", () => {
    const h = harness([null], [item(2), item(3)]);
    expect(locatePiece(h.world(), { handle: 1, kindKey: "sword", name: "Sword" }, new Map())).toBeUndefined();
    expect(locatePiece(h.world(), { handle: 2, kindKey: "flavor:1", name: "Unknown weapon" }, new Map())?.handle).toBe(2);
  });

  it("uses a session object id when a carried object's handle changes", () => {
    const h = harness([null], [item(9, { objectId: 55 }), item(1, { objectId: 66 })]);
    expect(locatePiece(h.world(), { handle: 1, kindKey: "sword", name: "Sword" }, new Map([[1, 55]]))?.handle).toBe(9);
  });

  it("counts every matching inscription guard", () => {
    expect(inscriptionChecks("!w!w!* !t @w1", "w")).toBe(3);
    expect(inscriptionChecks("!w!w!* !t @w1", "t")).toBe(2);
    expect(inscriptionChecks(null, "t")).toBe(0);
  });

  it("saves, replaces by name, reloads, and deletes through the panel", async () => {
    const h = harness();
    await h.manager.open();
    h.action("name", "melee"); h.action("save"); await flush();
    expect(readLoadouts(h.bag())).toEqual([captureLoadout("melee", [item(1)])]);
    h.state.equipment = [item(3)]; h.action("save"); await flush();
    expect(readLoadouts(h.bag())).toEqual([captureLoadout("melee", [item(3)])]);
    const reloaded = new LoadoutManager(h.mod);
    await reloaded.open(); h.action("delete-0"); await flush();
    expect(readLoadouts(h.bag())).toEqual([]);
    expect(h.bag()).toMatchObject({ other: "kept" });
  });

  it("rejects an empty name and a failed storage write", async () => {
    const h = harness(); await h.manager.open();
    h.action("save"); await flush(); expect(h.set).not.toHaveBeenCalled();
    h.set.mockImplementationOnce(async () => ({ ok: false, reason: "unavailable", message: "storage unavailable" }));
    h.action("name", "melee"); h.action("save"); await flush();
    expect(readLoadouts(h.bag())).toEqual([]);
  });
});

describe("loadout swaps", () => {
  it("submits ordinary wear with a fresh token and the saved slot", async () => {
    const h = harness(); await h.manager.restore(captureLoadout("melee", [item(2)]));
    expect(h.submit).toHaveBeenCalledExactlyOnceWith({ epoch: 1, revision: 0 }, { kind: "command", command: { code: "wield", args: { handle: 2, slot: 0 } } });
    expect(h.report()).toContain("The loadout is restored.");
  });

  it("does nothing when every slot already matches", async () => {
    const h = harness(); await h.manager.restore(captureLoadout("melee", [item(1)]));
    expect(h.submit).not.toHaveBeenCalled(); expect(h.report()).toContain("restored");
  });

  it("reports a missing item and leaves the existing item worn", async () => {
    const h = harness(); await h.manager.restore(captureLoadout("missing", [item(99)]));
    expect(h.submit).not.toHaveBeenCalled(); expect(h.state.equipment[0]?.handle).toBe(1);
    expect(h.report()).toContain("you are not carrying it"); expect(h.report()).toContain("only partly restored");
  });

  it("does not mistake a missing item and an empty slot for success", async () => {
    const h = harness([null], []); await h.manager.restore(captureLoadout("missing", [item(99)]));
    expect(h.report()).toContain("only partly restored");
  });

  it("reports an unchanged sticky item without retrying the command", async () => {
    const h = harness(); h.submit.mockImplementationOnce(async () => { h.state.token.revision++; return { ok: true, value: null }; });
    await h.manager.restore(captureLoadout("sticky", [item(2)]));
    expect(h.submit).toHaveBeenCalledTimes(1); expect(h.report()).toContain("did not move"); expect(h.report()).toContain("only partly restored");
  });

  it("keeps a quiver item available as a gear reference", async () => {
    const h = harness([null], []); h.state.quiver = [item(2)];
    await h.manager.restore(captureLoadout("quiver", [item(2)]));
    expect(h.state.equipment[0]?.handle).toBe(2); expect(h.report()).toContain("restored");
  });

  it("restores empty slots through takeoff after replacements", async () => {
    const h = harness([item(1), item(3)]);
    await h.manager.restore(captureLoadout("empty", [item(2), null]));
    expect(h.submit.mock.calls.map((call) => call[1].command.code)).toEqual(["wield", "takeoff"]);
    expect(h.state.equipment).toEqual([item(2), null]);
  });

  it("reports items the full-pack command path stops carrying", async () => {
    const h = harness(); const ordinary = h.submit.getMockImplementation()!;
    h.submit.mockImplementationOnce(async (token, intent) => { const result = await ordinary(token, intent); h.state.inventory = []; return result; });
    await h.manager.restore(captureLoadout("full", [item(2)]));
    expect(h.report()).toContain("no longer carry it after the swap");
  });

  it("reports a refused command and does not repeat it", async () => {
    const h = harness(); h.submit.mockImplementationOnce(async () => ({ ok: false, reason: "refused", code: "stale", message: "stale input token" }));
    await h.manager.restore(captureLoadout("stale", [item(2)]));
    expect(h.submit).toHaveBeenCalledTimes(1); expect(h.report()).toContain("stale input token");
  });

  it("stops after damage before another wear", async () => {
    const h = harness([item(1), item(3)], [item(2), item(4)]);
    const ordinary = h.submit.getMockImplementation()!;
    h.submit.mockImplementationOnce(async (token, intent) => { const result = await ordinary(token, intent); h.state.player.hp--; return result; });
    await h.manager.restore(captureLoadout("danger", [item(2), item(4)]));
    expect(h.submit).toHaveBeenCalledTimes(1); expect(h.report()).toContain("stopped");
  });

  it("stops when a monster becomes visible", async () => {
    const h = harness(); h.delay.mockImplementationOnce(async () => { h.manager.disturb(); });
    await h.manager.restore(captureLoadout("danger", [item(2)]));
    expect(h.submit).toHaveBeenCalledTimes(1); expect(h.report()).toContain("stopped");
  });

  it("never submits while another prompt or phase holds input", async () => {
    const h = harness(); h.prompt({ kind: "confirm" });
    await h.manager.restore(captureLoadout("prompt", [item(2)])); expect(h.submit).not.toHaveBeenCalled();
    h.prompt(null); h.phase("store");
    await h.manager.restore(captureLoadout("store", [item(2)])); expect(h.submit).not.toHaveBeenCalled();
  });

  it("waits for a later input revision instead of flooding the queue", async () => {
    const h = harness(); h.submit.mockImplementationOnce(async () => ({ ok: true, value: null }));
    await h.manager.restore(captureLoadout("pending", [item(2)]));
    expect(h.delay).toHaveBeenCalledTimes(300); expect(h.submit).toHaveBeenCalledTimes(1); expect(h.report()).toContain("waiting");
  });

  it("honors an inscription cancellation without sending a command", async () => {
    const h = harness([item(1)], [item(2, { inscription: "!w" })]);
    const running = h.manager.restore(captureLoadout("guard", [item(2)])); await flush();
    expect(h.report()).toContain("Wear "); h.action("cancel"); await running;
    expect(h.submit).not.toHaveBeenCalled(); expect(h.report()).toContain("canceled");
  });

  it("asks once per wear and takeoff inscription before replacing gear", async () => {
    const h = harness([item(1, { inscription: "!t" })], [item(2, { inscription: "!w!*" })]);
    const running = h.manager.restore(captureLoadout("guard", [item(2)])); await flush();
    h.action("yes"); await flush(); h.action("yes"); await flush(); h.action("yes"); await running;
    expect(h.panels.filter((p) => JSON.stringify(p).includes("Cancel swap"))).toHaveLength(3);
    expect(h.submit).toHaveBeenCalledTimes(1);
  });

  it("reports the empty second-ring targeting limitation without moving gear", async () => {
    const h = harness([null, null]); h.state.equipmentSlots = [{ type: "RING", name: "left" }, { type: "RING", name: "right" }];
    h.simulate.mockResolvedValueOnce({ ok: true, value: { placements: [{ slot: 0, displaced: null }] } });
    await h.manager.restore(captureLoadout("right", [null, item(2)]));
    expect(h.submit).not.toHaveBeenCalled(); expect(h.report()).toContain("cannot fill this ring slot");
  });

  it("takes misplaced rings off before filling their saved slots", async () => {
    const h = harness([item(1), item(2)], []); h.state.equipmentSlots = [{ type: "RING", name: "left" }, { type: "RING", name: "right" }];
    h.simulate.mockImplementation(async () => ({ ok: true, value: { placements: [{ slot: h.state.equipment[0] ? 1 : 0, displaced: null }] } }));
    await h.manager.restore(captureLoadout("hands", [item(2), item(1)]));
    expect(h.submit.mock.calls.map((call) => call[1].command.code)).toEqual(["takeoff", "takeoff", "wield", "wield"]);
    expect(h.state.equipment.map((it) => it?.handle)).toEqual([2, 1]);
  });


  it("defers incompatible and two-handed slot decisions to the game's simulator", async () => {
    const h = harness(); h.simulate.mockResolvedValueOnce({ ok: true, value: { placements: [] } });
    await h.manager.restore(captureLoadout("incompatible", [item(2)]));
    expect(h.submit).not.toHaveBeenCalled(); expect(h.report()).toContain("cannot put this");
  });

  it("stops if the character changes while the command is pending", async () => {
    const h = harness(); h.delay.mockImplementationOnce(async () => { h.state.token.epoch++; });
    await h.manager.restore(captureLoadout("session", [item(2)]));
    expect(h.submit).toHaveBeenCalledTimes(1); expect(h.report()).toContain("stopped");
  });

  it("does not act on equipment that changed during inscription confirmation", async () => {
    const h = harness([item(1)], [item(2, { inscription: "!w" })]);
    const running = h.manager.restore(captureLoadout("guard", [item(2)])); await flush();
    h.state.token.revision++; h.action("yes"); await running;
    expect(h.submit).not.toHaveBeenCalled(); expect(h.report()).toContain("changed while you were confirming");
  });

  it("closes a confirmation and sends no more commands after stop", async () => {
    const h = harness([item(1)], [item(2, { inscription: "!w" })]);
    const running = h.manager.restore(captureLoadout("guard", [item(2)])); await flush();
    h.manager.stop(); await running; expect(h.submit).not.toHaveBeenCalled(); expect(h.report()).toContain("Wear ");
  });
});
