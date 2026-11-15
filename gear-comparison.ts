import type { Api2Panel, Api2PanelNode, KnownWorldData, LoadoutItemRef, LoadoutSimulation, ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";

export interface ComparisonRow {
  readonly label: string;
  readonly before: string;
  readonly after: string;
  readonly delta: string;
}

const NUMBERS = [
  ["speed", "Speed (110 is normal)", 1], ["baseAc", "Base armor class", 1], ["toA", "Armor bonus", 1],
  ["ac", "Total armor class", 1], ["toH", "Global to-hit", 1], ["toD", "Global to-dam", 1],
  ["blows", "Blows per turn", 100], ["shots", "Shots per turn", 10], ["moves", "Extra movement", 1],
  ["ammoMult", "Ammo multiplier", 1], ["damRed", "Flat damage reduction", 1], ["percDamRed", "Damage reduction (%)", 1],
  ["seeInfra", "Infravision (grids)", 1], ["light", "Light radius (grids)", 1], ["hold", "Comfortable weapon weight (lb)", 1],
  ["maxHp", "Max hit points", 1], ["maxSp", "Max spell points", 1], ["totalWeight", "Carried weight (lb)", 10],
  ["weightLimit", "Weight limit (lb)", 10],
] as const;
const BOOLEANS = [
  ["heavyWield", "Weapon too heavy"], ["heavyShoot", "Launcher too heavy"],
  ["blessWield", "Blessed weapon rule met"], ["cumberArmor", "Armor reduces spell points"],
] as const;
const STATS = ["STR", "INT", "WIS", "DEX", "CON"];
const SKILLS = ["Physical disarming", "Magical disarming", "Magic devices", "Saving throw", "Searching", "Stealth", "Melee accuracy", "Shooting accuracy", "Throwing accuracy", "Digging"];
const VECTORS = [["statAdd", "Equipment modifier"], ["statUse", "Current stat (encoded)"], ["statTop", "Undrained stat (encoded)"], ["statInd", "Stat table index"], ["skills", "Skill"], ["resists", "Resistance level"]] as const;

function number(value: number | undefined, scale = 1, signed = false): string {
  if (value === undefined) return "unknown";
  const formatted = String(Number((value / scale).toFixed(4)));
  return signed && value > 0 ? "+" + formatted : formatted;
}

/** Core's known-only calc_bonuses, calc_hitpoints, and calc_mana avoid learning unknown runes. */
export function comparisonRows(simulation: LoadoutSimulation): ComparisonRow[] {
  const before = simulation.before.stats;
  const after = simulation.after.stats;
  const delta = simulation.delta;
  const rows: ComparisonRow[] = NUMBERS.map(([key, label, scale]) => ({ label, before: number(before[key], scale), after: number(after[key], scale), delta: number(delta[key], scale, true) }));
  rows.push({ label: "Ammo type (tval)", before: String(before.ammoTval), after: String(after.ammoTval), delta: before.ammoTval === after.ammoTval ? "same" : "changed" });
  for (const [key, label] of BOOLEANS) {
    rows.push({ label, before: before[key] ? "yes" : "no", after: after[key] ? "yes" : "no", delta: before[key] === after[key] ? "same" : after[key] ? "set" : "cleared" });
  }
  for (const [key, family] of VECTORS) {
    for (let i = 0; i < Math.max(before[key].length, after[key].length); i++) {
      const label = key === "skills" ? SKILLS[i] ?? String(i) : key === "resists" ? after.resistElements[i] ?? before.resistElements[i] ?? String(i) : STATS[i] ?? String(i);
      rows.push({ label: family + ": " + label, before: number(before[key][i]), after: number(after[key][i]), delta: number(delta[key][i], 1, true) });
    }
  }
  for (const [key, label] of [["objectFlags", "Object flag"], ["playerFlags", "Player flag"]] as const) {
    const flags = [...new Set([...before[key], ...after[key]])].sort();
    if (flags.length === 0) rows.push({ label, before: "none", after: "none", delta: "same" });
    for (const flag of flags) {
      const had = before[key].includes(flag);
      const has = after[key].includes(flag);
      rows.push({ label: label + ": " + flag, before: had ? "yes" : "no", after: has ? "yes" : "no", delta: had === has ? "same" : has ? "gained" : "lost" });
    }
  }
  return rows;
}

function grouped(nodes: Api2PanelNode[]): Api2PanelNode[] {
  const groups: Api2PanelNode[] = [];
  for (let i = 0; i < nodes.length; i += 24) groups.push({ type: "column", children: nodes.slice(i, i + 24) });
  return groups;
}

export function comparisonPanel(simulation: LoadoutSimulation, title: string, slot: string): Api2Panel {
  const rows: Api2PanelNode[] = [{ type: "row", children: ["Statistic", "Before", "After", "Delta"].map((text) => ({ type: "text", text })) },
    ...comparisonRows(simulation).map((row): Api2PanelNode => ({ type: "row", children: [row.label, row.before, row.after, row.delta].map((text) => ({ type: "text", text })) })),
  ];
  return { id: "gear-comparison", title, modal: true, root: { type: "column", children: [
    { type: "text", text: "Comparing in " + slot + ", using only runes you have learned." },
    ...(simulation.delta.unknownRunes ? [{ type: "text" as const, text: "Unknown runes are not counted, so a zero delta can still hide an effect." }] : []),
    ...(simulation.unresolved.length ? [{ type: "text" as const, text: "Some items could not be found, so this comparison is incomplete." }] : []),
    { type: "text", text: "Global to-hit and to-dam leave out the weapon's own bonuses. Spell failure, spell costs, and attack damage are not available for hypothetical gear." },
    ...grouped(rows),
    { type: "button", label: "Choose another item", action: "items" },
  ] } };
}

export interface ComparisonCandidate {
  readonly label: string;
  readonly ref: LoadoutItemRef;
}

export function comparisonCandidates(world: KnownWorldData): ComparisonCandidate[] {
  const seen = new Set<number>();
  const candidates: ComparisonCandidate[] = [];
  for (const item of [...(world.inventory ?? []), ...(world.equipment ?? []).filter((item) => item !== null), ...(world.quiver ?? [])]) {
    if (seen.has(item.handle)) continue;
    seen.add(item.handle);
    candidates.push({ label: item.name ?? item.label, ref: { from: "gear", handle: item.handle } });
  }
  if (world.player) {
    for (const item of world.floorHere ?? []) {
      if (item.floorIndex !== undefined) candidates.push({ label: "Floor: " + (item.name ?? item.label), ref: { from: "floor", ...world.player.grid, index: item.floorIndex } });
    }
  }
  for (const [storeIndex, store] of (world.stores ?? []).entries()) {
    for (const item of store.stock) candidates.push({ label: store.featName + ": " + (item.name ?? item.label), ref: { from: "store", store: storeIndex, index: item.index } });
  }
  return candidates;
}

export class GearComparisonManager {
  private stopped = false;
  private openPanel = false;
  private generation = 0;

  constructor(private readonly mod: ModApi2) {}

  stop(): void {
    this.stopped = true;
    this.generation++;
    void this.mod.ui.unmount("gear-comparison");
  }

  async open(): Promise<void> {
    if (this.stopped || this.openPanel) return;
    this.openPanel = true;
    const generation = ++this.generation;
    const current = (): boolean => !this.stopped && this.openPanel && generation === this.generation;
    let page = 0;
    let candidates: ComparisonCandidate[] = [];
    let world: KnownWorldData | null = null;
    let mounted = false;
    let busy = false;
    const show = async (panel: Api2Panel): Promise<void> => {
      if (!current()) return;
      const result = mounted
        ? await this.mod.ui.patch("gear-comparison", { title: panel.title ?? null, root: panel.root })
        : await this.mod.ui.mount(panel, (action) => { void act(action); }, () => { this.openPanel = false; this.generation++; });
      if (!current()) { if (!mounted) await this.mod.ui.unmount("gear-comparison"); return; }
      mounted = result.ok;
      if (!result.ok) { this.openPanel = false; this.mod.meta.log(result.message); }
    };
    const items = async (message = ""): Promise<void> => {
      const read = await this.mod.view.world();
      if (!current()) return;
      world = read.ok ? read.value : null;
      candidates = world ? comparisonCandidates(world) : [];
      page = Math.max(0, Math.min(page, Math.ceil(candidates.length / 16) - 1));
      const start = page * 16;
      await show({ id: "gear-comparison", title: "Compare gear", modal: true, root: { type: "column", children: [
        { type: "text", text: message || (!read.ok ? read.message : candidates.length ? "Choose an item, then a slot to compare it in." : "No known items to compare. Carry an item, stand on one, or visit a store.") },
        ...candidates.slice(start, start + 16).map((candidate, index): Api2PanelNode => ({ type: "button", label: candidate.label, action: "item-" + String(start + index) })),
        { type: "row", children: [
          { type: "button", label: "Previous page", action: "previous", disabled: page === 0 },
          { type: "text", text: "Page " + String(page + 1) },
          { type: "button", label: "Next page", action: "next", disabled: start + 16 >= candidates.length },
        ] },
      ] } });
    };
    let slots: { name: string; comparison: LoadoutSimulation }[] = [];
    let comparedToken: KnownWorldData["token"] | null = null;
    let title = "Compare gear";
    const act = async (action: string): Promise<void> => {
      if (!current() || busy) return;
      busy = true;
      try {
        if (action === "items" || action === "next" || action === "previous") {
          if (action === "next") page++;
          if (action === "previous") page--;
          await items(); return;
        }
        if (action.startsWith("item-")) {
          const candidate = candidates[Number(action.slice(5))];
          if (!candidate || !world) return;
          const fresh = await this.mod.view.isCurrent(world.token);
          if (!current()) return;
          if (!fresh.ok || !fresh.value) { await items("The game changed. Choose the item again."); return; }
          const result = await this.mod.view.inspect.compareLoadoutSlots(candidate.ref);
          if (!current()) return;
          if (!result.ok) { await items(result.message); return; }
          slots = [...result.value.slots];
          comparedToken = result.value.token;
          title = candidate.label;
          if (!slots.length) { await items("This item has no worn slot to compare."); return; }
          if (slots.length === 1) { await show(comparisonPanel(slots[0]!.comparison, title, slots[0]!.name)); return; }
          // Core owns slot legality through wield_slot, including both ring hands.
          await show({ id: "gear-comparison", title, modal: true, root: { type: "column", children: [
            { type: "text", text: "Choose the slot to replace." },
            ...grouped(slots.map((slot, index): Api2PanelNode => ({ type: "button", label: slot.name, action: "slot-" + String(index) }))),
            { type: "button", label: "Choose another item", action: "items" },
          ] } });
        } else if (action.startsWith("slot-")) {
          const slot = slots[Number(action.slice(5))];
          if (!comparedToken) return;
          const fresh = await this.mod.view.isCurrent(comparedToken);
          if (!current()) return;
          if (!fresh.ok || !fresh.value) { await items("The game changed. Choose the item again."); return; }
          if (slot) await show(comparisonPanel(slot.comparison, title, slot.name));
        }
      } catch { if (current()) await items("Could not read the comparison."); }
      finally { busy = false; }
    };
    try { await items(); }
    catch { this.openPanel = false; this.mod.meta.log("Could not open the comparison."); }
  }
}
