import { describe, expect, it, vi } from "vitest";
import type { Api2Panel, Api2PanelNode, Api2Result, LoadoutItemRef, LoadoutSlotsResult, DerivedStatsView, KnownItem, KnownWorldData, LoadoutDelta, LoadoutSimulation, ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";
import { comparisonCandidates, comparisonPanel, comparisonRows, GearComparisonManager } from "./gear-comparison";

function stats(extra: Partial<DerivedStatsView> = {}): DerivedStatsView {
  return { speed: 110, baseAc: 0, toA: 0, ac: 0, toH: 0, toD: 0, blows: 100, shots: 10, moves: 0, ammoMult: 0, ammoTval: 0,
    damRed: 0, percDamRed: 0, seeInfra: 0, light: 0, hold: 10, heavyWield: false, heavyShoot: false, blessWield: false, cumberArmor: false,
    statAdd: [0, 0, 0, 0, 0], statUse: [10, 10, 10, 10, 10], statTop: [10, 10, 10, 10, 10], statInd: [0, 0, 0, 0, 0],
    skills: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], resists: [0, 0, 0], resistElements: ["ACID", "FIRE", "COLD"], objectFlags: [], playerFlags: [],
    maxHp: 100, maxSp: 20, totalWeight: 125, weightLimit: 1000, ...extra };
}

function simulation(before: Partial<DerivedStatsView> = {}, after: Partial<DerivedStatsView> = {}, delta: Partial<LoadoutDelta> = {}): LoadoutSimulation {
  const beforeStats = stats(before);
  const afterStats = stats(after);
  const deltas = Object.fromEntries(Object.entries(beforeStats).map(([key, value]) => [key, typeof value === "number" ? (afterStats[key as keyof DerivedStatsView] as number) - value : Array.isArray(value) && value.every((v) => typeof v === "number") ? value.map((n, i) => (afterStats[key as keyof DerivedStatsView] as readonly number[])[i]! - n) : value]));
  return { before: { stats: beforeStats }, after: { stats: afterStats }, placements: [], unresolved: [], delta: {
    ...deltas, changed: false, unknownRunes: false, objectFlagsGained: [], objectFlagsLost: [], playerFlagsGained: [], playerFlagsLost: [], ...delta,
  } } as unknown as LoadoutSimulation;
}

function item(handle: number, extra: Partial<KnownItem> = {}): KnownItem {
  return { handle, label: "Item " + String(handle), ...extra } as KnownItem;
}

function world(extra: Partial<KnownWorldData> = {}): KnownWorldData {
  return { token: { epoch: 1, revision: 1 }, inventory: [item(1)], equipment: [], quiver: [], floorHere: [], stores: [], player: { grid: { x: 5, y: 6 } }, ...extra } as KnownWorldData;
}

function texts(node: Api2PanelNode): string[] {
  if (node.type === "text") return [node.text];
  if (node.type === "row" || node.type === "column") return node.children.flatMap(texts);
  return [];
}

function harness(known = world()) {
  let action: ((action: string) => void) | undefined;
  let dismiss: (() => void) | undefined;
  const panels: Api2Panel[] = [];
  const read = vi.fn(async (): Promise<Api2Result<KnownWorldData>> => ({ ok: true, value: known }));
  const inspect = vi.fn(async (_ref?: LoadoutItemRef): Promise<Api2Result<LoadoutSlotsResult>> => ({ ok: true, value: { token: known.token, slots: [{ slot: 0, name: "weapon", comparison: simulation() }] } }));
  const isCurrent = vi.fn(async () => ({ ok: true, value: true }));
  const mount = vi.fn(async (panel: Api2Panel, onAction?: typeof action, onDismiss?: typeof dismiss) => { panels.push(panel); action = onAction; dismiss = onDismiss; return { ok: true, value: { panelId: panel.id } }; });
  const patch = vi.fn(async (_id: string, changes: Partial<Api2Panel>) => { panels.push({ ...panels.at(-1)!, ...changes }); return { ok: true, value: { panelId: "gear-comparison" } }; });
  const unmount = vi.fn(async () => ({ ok: true, value: null }));
  const mod = { view: { world: read, isCurrent, inspect: { compareLoadoutSlots: inspect } }, ui: { mount, patch, unmount }, meta: { log: vi.fn() } } as unknown as ModApi2;
  const manager = new GearComparisonManager(mod);
  return { manager, mod, read, inspect, isCurrent, mount, patch, panels, unmount, action: (value: string) => action?.(value), dismiss: () => dismiss?.(), text: () => texts(panels.at(-1)!.root).join(" ") };
}

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

describe("known comparison rows", () => {
  it("shows every scalar and unchanged values", () => {
    const rows = comparisonRows(simulation());
    for (const label of ["Speed (110 is normal)", "Base armor class", "Armor bonus", "Total armor class", "Global to-hit", "Global to-dam", "Blows per turn", "Shots per turn", "Extra movement", "Ammo multiplier", "Ammo type (tval)", "Flat damage reduction", "Damage reduction (%)", "Infravision (grids)", "Light radius (grids)", "Comfortable weapon weight (lb)", "Weapon too heavy", "Launcher too heavy", "Blessed weapon rule met", "Armor reduces spell points", "Max hit points", "Max spell points", "Carried weight (lb)", "Weight limit (lb)"]) expect(rows.some((row) => row.label === label), label).toBe(true);
    expect(rows.find((row) => row.label.startsWith("Speed"))).toEqual({ label: "Speed (110 is normal)", before: "110", after: "110", delta: "0" });
  });

  it("uses the supplied delta instead of deriving another combat calculation", () => {
    expect(comparisonRows(simulation({ speed: 110 }, { speed: 120 }, { speed: 42 }))[0]?.delta).toBe("+42");
  });

  it("formats blows, shots, and weight in the documented units", () => {
    const rows = comparisonRows(simulation({ blows: 125, shots: 12, totalWeight: 125 }, { blows: 175, shots: 15, totalWeight: 140 }));
    expect(rows.find((row) => row.label === "Blows per turn")).toMatchObject({ before: "1.25", after: "1.75", delta: "+0.5" });
    expect(rows.find((row) => row.label === "Shots per turn")).toMatchObject({ before: "1.2", after: "1.5", delta: "+0.3" });
    expect(rows.find((row) => row.label === "Carried weight (lb)")).toMatchObject({ before: "12.5", after: "14", delta: "+1.5" });
  });

  it("labels all stats, skills, and resistance entries", () => {
    const rows = comparisonRows(simulation({ resists: [1, 0, 0] }, { resists: [0, 1, -1] }));
    expect(rows.filter((row) => row.label.startsWith("Equipment modifier:"))).toHaveLength(5);
    expect(rows.filter((row) => row.label.startsWith("Current stat"))).toHaveLength(5);
    expect(rows.filter((row) => row.label.startsWith("Undrained stat"))).toHaveLength(5);
    expect(rows.filter((row) => row.label.startsWith("Stat table index"))).toHaveLength(5);
    expect(rows.filter((row) => row.label.startsWith("Skill:"))).toHaveLength(10);
    expect(rows.find((row) => row.label === "Resistance level: ACID")).toMatchObject({ before: "1", after: "0", delta: "-1" });
    expect(rows.find((row) => row.label === "Resistance level: FIRE")).toMatchObject({ delta: "+1" });
    expect(rows.find((row) => row.label === "Resistance level: COLD")).toMatchObject({ delta: "-1" });
  });

  it("shows gained, lost, and unchanged flags with both sides", () => {
    const rows = comparisonRows(simulation({ objectFlags: ["FREE_ACT", "SEE_INVIS"], playerFlags: ["ZERO_FAIL"] }, { objectFlags: ["REGEN", "SEE_INVIS"], playerFlags: [] }));
    expect(rows.find((row) => row.label === "Object flag: FREE_ACT")).toMatchObject({ before: "yes", after: "no", delta: "lost" });
    expect(rows.find((row) => row.label === "Object flag: REGEN")).toMatchObject({ delta: "gained" });
    expect(rows.find((row) => row.label === "Object flag: SEE_INVIS")).toMatchObject({ delta: "same" });
    expect(rows.find((row) => row.label === "Player flag: ZERO_FAIL")).toMatchObject({ delta: "lost" });
  });

  it("shows armor mana loss, boolean transitions, and ammo type changes", () => {
    const rows = comparisonRows(simulation({}, { maxSp: 10, cumberArmor: true, heavyWield: true, ammoTval: 17 }));
    expect(rows.find((row) => row.label === "Max spell points")).toMatchObject({ delta: "-10" });
    expect(rows.find((row) => row.label === "Armor reduces spell points")).toMatchObject({ before: "no", after: "yes", delta: "set" });
    expect(rows.find((row) => row.label === "Ammo type (tval)")).toMatchObject({ before: "0", after: "17", delta: "changed" });
  });

  it("does not invent zeros for missing vector entries", () => {
    const rows = comparisonRows(simulation({ resists: [] }, { resists: [1] }, { resists: [] }));
    expect(rows.find((row) => row.label === "Resistance level: ACID")).toMatchObject({ before: "unknown", after: "1", delta: "unknown" });
  });

  it("warns about unknown runes and unresolved item references", () => {
    const sim = simulation({}, {}, { unknownRunes: true });
    const panel = comparisonPanel({ ...sim, unresolved: [{ from: "gear", handle: 9 }] }, "Unknown sword", "weapon");
    const text = texts(panel.root).join(" ");
    expect(text).toContain("Unknown runes are not counted"); expect(text).toContain("zero delta can still hide an effect");
    expect(text).toContain("comparison is incomplete"); expect(text).toContain("Spell failure, spell costs, and attack damage are not available");
  });

  it("keeps every panel group within the host's limits", () => {
    const sim = simulation({ objectFlags: Array.from({ length: 120 }, (_, i) => "FLAG_" + String(i)) });
    const check = (node: Api2PanelNode, depth = 0): void => {
      expect(depth).toBeLessThan(16);
      if (node.type === "row" || node.type === "column") { expect(node.children.length).toBeLessThanOrEqual(32); node.children.forEach((child) => check(child, depth + 1)); }
      if (node.type === "text") expect(node.text.length).toBeLessThanOrEqual(4096);
    };
    check(comparisonPanel(sim, "Sword", "weapon").root);
  });
});

describe("comparison candidates", () => {
  it("deduplicates gear, includes quiver items, and preserves floor indices", () => {
    const candidates = comparisonCandidates(world({ inventory: [item(1)], equipment: [null, item(2)], quiver: [item(1), item(3)], floorHere: [item(0, { floorIndex: 7 }), item(0)] }));
    expect(candidates.map((candidate) => candidate.ref)).toEqual([{ from: "gear", handle: 1 }, { from: "gear", handle: 2 }, { from: "gear", handle: 3 }, { from: "floor", x: 5, y: 6, index: 7 }]);
  });

  it("uses store array indices rather than terrain feature ids", () => {
    const stores = [{ feat: 81, featName: "Home", isHome: true, owner: { name: "Owner", purse: 0 }, stock: [{ ...item(0), index: 4 }] }, { feat: 82, featName: "Shop", isHome: false, owner: { name: "Owner", purse: 0 }, stock: [{ ...item(0), index: 9 }] }] as KnownWorldData["stores"];
    expect(comparisonCandidates(world({ inventory: [], stores })).map((candidate) => candidate.ref)).toEqual([{ from: "store", store: 0, index: 4 }, { from: "store", store: 1, index: 9 }]);
  });

  it("handles denied world parts without reading live objects", () => {
    expect(comparisonCandidates(world({ inventory: null, equipment: null, quiver: null, floorHere: null, stores: null, player: null }))).toEqual([]);
  });
});

describe("comparison panel flow", () => {
  it("requests Core's slot comparison and shows it without submitting actions", async () => {
    const h = harness(); await h.manager.open(); h.action("item-0"); await flush();
    expect(h.inspect).toHaveBeenCalledExactlyOnceWith({ from: "gear", handle: 1 });
    expect(h.text()).toContain("Before After Delta"); expect(h.text()).toContain("Max spell points");
    expect(h.mount).toHaveBeenCalledTimes(1); expect(h.patch).toHaveBeenCalledTimes(1);
  });

  it("lets the player choose either ring hand from the returned slots", async () => {
    const h = harness();
    h.inspect.mockResolvedValueOnce({ ok: true, value: { token: { epoch: 1, revision: 1 }, slots: [{ slot: 2, name: "left hand", comparison: simulation({}, { speed: 115 }) }, { slot: 3, name: "right hand", comparison: simulation({}, { speed: 105 }) }] } });
    await h.manager.open(); h.action("item-0"); await flush();
    expect(h.panels.at(-1)?.root).toMatchObject({ children: expect.arrayContaining([expect.objectContaining({ type: "column", children: expect.arrayContaining([expect.objectContaining({ action: "slot-0", label: "left hand" }), expect.objectContaining({ action: "slot-1", label: "right hand" })]) })]) });
    h.action("slot-1"); await flush(); expect(h.text()).toContain("Comparing in right hand"); expect(h.text()).toContain("-5");
  });

  it("refreshes stale choices before calling the simulator", async () => {
    const h = harness(); h.isCurrent.mockResolvedValueOnce({ ok: true, value: false });
    await h.manager.open(); h.action("item-0"); await flush();
    expect(h.inspect).not.toHaveBeenCalled(); expect(h.text()).toContain("The game changed"); expect(h.read).toHaveBeenCalledTimes(2);
  });

  it("reports non-wearable items without displaying invented stats", async () => {
    const h = harness(); h.inspect.mockResolvedValueOnce({ ok: true, value: { token: { epoch: 1, revision: 1 }, slots: [] } });
    await h.manager.open(); h.action("item-0"); await flush(); expect(h.text()).toContain("no worn slot to compare");
  });

  it("paginates a pack and returns to refreshed item choices", async () => {
    const h = harness(world({ inventory: Array.from({ length: 40 }, (_, i) => item(i + 1)) }));
    await h.manager.open(); h.action("next"); await flush();
    expect(h.text()).toContain("Page 2");
    h.action("item-16"); await flush(); expect(h.inspect).toHaveBeenCalledWith({ from: "gear", handle: 17 });
    h.action("items"); await flush(); expect(h.read).toHaveBeenCalledTimes(3);
    h.action("previous"); await flush(); expect(h.text()).toContain("Page 1");
  });


  it("shows an API refusal instead of a stat result", async () => {
    const h = harness(); h.inspect.mockResolvedValueOnce({ ok: false, reason: "not-granted", capability: "state:player.read", message: "Player read denied." });
    await h.manager.open(); h.action("item-0"); await flush();
    expect(h.text()).toContain("Player read denied."); expect(h.text()).not.toContain("Before After Delta");
  });

  it("shows a denied world read without asking the simulator", async () => {
    const h = harness(); h.read.mockResolvedValueOnce({ ok: false, reason: "unavailable", message: "No character is running." });
    await h.manager.open(); expect(h.text()).toContain("No character is running."); expect(h.inspect).not.toHaveBeenCalled();
  });

  it("refreshes a ring choice if the game changes after simulation", async () => {
    const h = harness();
    h.inspect.mockResolvedValueOnce({ ok: true, value: { token: { epoch: 1, revision: 1 }, slots: [{ slot: 2, name: "left", comparison: simulation() }, { slot: 3, name: "right", comparison: simulation() }] } });
    await h.manager.open(); h.action("item-0"); await flush(); h.isCurrent.mockResolvedValueOnce({ ok: true, value: false });
    h.action("slot-1"); await flush(); expect(h.text()).toContain("The game changed");
  });

  it("does not open duplicate panels", async () => {
    const h = harness(); await h.manager.open(); await h.manager.open(); expect(h.mount).toHaveBeenCalledTimes(1);
  });

  it("ignores late simulation results after dismissal", async () => {
    const h = harness(); let complete: ((value: Awaited<ReturnType<typeof h.inspect>>) => void) | undefined;
    h.inspect.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    await h.manager.open(); h.action("item-0"); await flush(); h.dismiss();
    complete!({ ok: true, value: { token: { epoch: 1, revision: 1 }, slots: [{ slot: 0, name: "weapon", comparison: simulation() }] } });
    await flush(); expect(h.patch).not.toHaveBeenCalled();
  });

  it("closes on stop and never mounts after a pending read completes", async () => {
    const h = harness(); let complete: ((value: Awaited<ReturnType<typeof h.read>>) => void) | undefined;
    h.read.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const opened = h.manager.open(); h.manager.stop(); complete!({ ok: true, value: world() }); await opened;
    expect(h.unmount).toHaveBeenCalled(); expect(h.mount).not.toHaveBeenCalled();
  });
});
