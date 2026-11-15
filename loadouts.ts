import type { Api2Panel, Api2PanelNode, JsonValue, KnownItem, KnownWorldData, ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";

interface Piece {
  readonly handle: number;
  readonly kindKey: string;
  readonly name: string;
}

export interface Loadout {
  readonly name: string;
  readonly slots: readonly (Piece | null)[];
}

type GearWorld = KnownWorldData & { readonly equipment: readonly (KnownItem | null)[]; readonly inventory: readonly KnownItem[] };
type IdentifiedItem = KnownItem & { readonly objectId?: number };
const PANEL = "loadouts";
const LIMIT = 20;

export function readLoadouts(bag: unknown): Loadout[] {
  if (!bag || typeof bag !== "object") return [];
  const saved = (bag as { loadouts?: { v?: unknown; sets?: unknown } }).loadouts;
  if (!saved || saved.v !== 1 || !Array.isArray(saved.sets)) return [];
  return saved.sets.slice(0, LIMIT).filter((set): set is Loadout => {
    if (!set || typeof set !== "object" || typeof set.name !== "string" || !set.name.trim() || set.name.length > 64) return false;
    if (!Array.isArray(set.slots) || set.slots.length > 64) return false;
    return set.slots.every((piece: unknown) => {
      if (piece === null) return true;
      if (!piece || typeof piece !== "object") return false;
      const p = piece as Piece;
      return Number.isSafeInteger(p.handle) && p.handle > 0 && typeof p.kindKey === "string" && typeof p.name === "string";
    });
  }).map((set) => ({ name: set.name, slots: set.slots.map((p) => p && { handle: p.handle, kindKey: p.kindKey, name: p.name }) }));
}

export function withLoadouts(bag: JsonValue | null, sets: readonly Loadout[]): JsonValue {
  const base = bag && typeof bag === "object" && !Array.isArray(bag) ? bag : {};
  return { ...base, loadouts: { v: 1, sets: sets.map((set) => ({ name: set.name, slots: set.slots.map((p) => p && { ...p }) })) } };
}

export function captureLoadout(name: string, equipment: readonly (KnownItem | null)[]): Loadout {
  return { name: name.trim(), slots: equipment.map((item) => item && ({ handle: item.handle, kindKey: item.kindKey, name: item.name ?? item.label })) };
}

function carried(world: GearWorld): KnownItem[] {
  return [...world.equipment.filter((item): item is KnownItem => item !== null), ...world.inventory, ...(world.quiver ?? [])];
}

/** Core saves gear handles and its next-handle counter; display names cannot identify duplicate items. */
export function locatePiece(world: GearWorld, piece: Piece, identities: ReadonlyMap<number, number>): KnownItem | undefined {
  const id = identities.get(piece.handle);
  return carried(world).find((item: IdentifiedItem) => id === undefined ? item.handle === piece.handle : item.objectId === id);
}

export function inscriptionChecks(inscription: string | null, key: "w" | "t"): number {
  return [...(inscription ?? "").matchAll(/!([wt*])/g)].filter((match) => match[1] === key || match[1] === "*").length;
}

export class LoadoutManager {
  private stopped = false;
  private running = false;
  private interrupted = false;
  private menuOpen = false;
  private confirming: ((yes: boolean) => void) | null = null;
  private readonly identities = new Map<number, number>();

  constructor(private readonly mod: ModApi2, private readonly delay: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 100))) {}

  disturb(): void { this.interrupted = true; }

  stop(): void {
    this.stopped = true;
    this.interrupted = true;
    this.confirming?.(false);
    void this.mod.ui.unmount(PANEL);
  }

  private async world(): Promise<GearWorld | null> {
    const result = await this.mod.view.world();
    if (!result.ok || !result.value.equipment || !result.value.inventory) return null;
    const world = result.value as GearWorld;
    for (const item of carried(world) as IdentifiedItem[]) {
      if (item.objectId !== undefined && !this.identities.has(item.handle)) this.identities.set(item.handle, item.objectId);
    }
    return world;
  }

  async open(): Promise<void> {
    if (this.stopped || this.running || this.menuOpen) return;
    this.menuOpen = true;
    await this.mod.ui.unmount(PANEL);
    const stored = await this.mod.store.character.get();
    const world = await this.world();
    if (!stored.ok || !world) {
      this.menuOpen = false;
      await this.report("Loadouts are not available for this character.");
      return;
    }
    let sets = readLoadouts(stored.value);
    let name = "";
    let busy = false;
    const panel = (message = ""): Api2Panel => ({
      id: PANEL, title: "Loadouts", modal: true,
      root: { type: "column", children: [
        { type: "text", text: "Save what you are wearing, empty slots included. The game manages the quiver. A full pack can drop an item during a swap." },
        { type: "input", label: "Loadout name", action: "name", value: name },
        { type: "button", label: "Save loadout", action: "save" },
        { type: "text", text: message },
        ...sets.map((set, index): Api2PanelNode => ({ type: "row", children: [
          { type: "text", text: set.name },
          { type: "button", label: "Restore", action: "restore-" + String(index) },
          { type: "button", label: "Delete", action: "delete-" + String(index) },
        ] })),
      ] },
    });
    const refresh = async (message: string): Promise<void> => { if (!this.stopped) await this.mod.ui.patch(PANEL, { root: panel(message).root }); };
    const act = async (action: string, value?: string | boolean): Promise<void> => {
      if (this.stopped || busy) return;
      if (action === "name" && typeof value === "string") { name = value; return; }
      busy = true;
      try {
        if (action === "save" || action.startsWith("delete-")) {
          const bag = await this.mod.store.character.get();
          if (!bag.ok) { await refresh("Could not read the loadouts."); return; }
          const current = readLoadouts(bag.value);
          let next: Loadout[];
          if (action === "save") {
            const clean = name.trim();
            if (!clean || clean.length > 64) { await refresh("Use a name of 1 to 64 characters."); return; }
            const now = await this.world();
            if (!now) return;
            if (current.length >= LIMIT && !current.some((set) => set.name === clean)) { await refresh("This character has 20 loadouts, the limit. Delete one to save another."); return; }
            next = [...current.filter((set) => set.name !== clean), captureLoadout(clean, now.equipment)];
          } else {
            const chosen = sets[Number(action.slice(7))];
            if (!chosen) return;
            next = current.filter((set) => set.name !== chosen.name);
          }
          const saved = await this.mod.store.character.set(withLoadouts(bag.value, next));
          if (this.stopped) return;
          if (saved.ok) sets = next;
          await refresh(saved.ok ? "The loadouts are saved." : "Could not save the loadouts.");
        } else if (action.startsWith("restore-")) {
          const set = sets[Number(action.slice(8))];
          if (!set) return;
          this.menuOpen = false;
          await this.mod.ui.unmount(PANEL);
          await this.restore(set);
        }
      } finally { busy = false; }
    };
    if (this.stopped) return;
    const opened = await this.mod.ui.mount(panel(), (action, value) => { void act(action, value); }, () => { this.menuOpen = false; });
    if (this.stopped) await this.mod.ui.unmount(PANEL);
    if (!opened.ok) { this.menuOpen = false; this.mod.meta.log(opened.message); }
  }

  private async report(text: string): Promise<void> {
    if (this.stopped) return;
    const opened = await this.mod.ui.mount({ id: PANEL, title: "Loadouts", root: { type: "column", children: [
      { type: "text", text: text.slice(0, 4096) },
      { type: "button", label: "Close", action: "close" },
    ] } }, () => { void this.mod.ui.unmount(PANEL); });
    if (this.stopped) await this.mod.ui.unmount(PANEL);
    if (!opened.ok) this.mod.meta.log(text);
  }

  private async confirm(item: KnownItem, key: "w" | "t"): Promise<boolean> {
    const count = inscriptionChecks(item.inscription, key);
    for (let i = 0; i < count; i++) {
      if (this.stopped || this.interrupted) return false;
      const yes = await new Promise<boolean>((resolve) => {
        this.confirming = resolve;
        void this.mod.ui.mount({ id: PANEL, title: "Loadouts", modal: true, root: { type: "column", children: [
          { type: "text", text: (key === "w" ? "Wear " : "Take off ") + (item.name ?? item.label) + "?" },
          { type: "button", label: "Continue swap", action: "yes" },
          { type: "button", label: "Cancel swap", action: "cancel" },
        ] } }, (action) => resolve(action === "yes"), () => resolve(false)).then((opened) => { if (!opened.ok) resolve(false); });
      });
      this.confirming = null;
      await this.mod.ui.unmount(PANEL);
      if (!yes) return false;
    }
    return true;
  }

  async restore(set: Loadout): Promise<void> {
    if (this.stopped || this.running) return;
    this.running = true;
    this.interrupted = false;
    const notes: string[] = [];
    const blocked = new Set<number>();
    try {
      const first = await this.world();
      let hp = first?.player?.hp;
      if (!first || first.equipment.length !== set.slots.length) { notes.push("The saved body slots are not available."); return; }
      // do_cmd_wield and do_cmd_takeoff own energy, sticky checks, and pack_overflow.
      for (let attempt = 0; attempt < set.slots.length * 3; attempt++) {
        const input = await this.mod.view.input();
        const world = await this.world();
        if (!input.ok || !world || this.stopped || this.interrupted || world.player?.dead || (hp !== undefined && world.player && world.player.hp < hp)) {
          notes.push("The swap stopped."); break;
        }
        hp = world.player?.hp;
        if (input.value.phase !== "play" || input.value.prompt || input.value.messagePending || input.value.driver.kind !== "player") {
          notes.push("The swap stopped because the game needs other input."); break;
        }
        let command: { code: string; args: { handle: number; slot?: number } } | null = null;
        let target = -1;
        let subject: KnownItem | null = null;
        let displaced: KnownItem | null = null;
        // Replacements free pack space before explicit empty slots are restored.
        for (const empty of [false, true]) {
          for (let slot = 0; slot < set.slots.length; slot++) {
            if (blocked.has(slot)) continue;
            const piece = set.slots[slot] ?? null;
            if ((piece === null) !== empty) continue;
            const worn = world.equipment[slot] ?? null;
            const found = piece && locatePiece(world, piece, this.identities);
            if (piece && !found) { notes.push(piece.name + ": you are not carrying it."); blocked.add(slot); continue; }
            if (piece && found && worn?.handle === found.handle) continue;
            if (!piece && !worn) continue;
            target = slot;
            if (found) {
              const otherSlot = world.equipment.findIndex((item) => item?.handle === found.handle);
              if (otherSlot >= 0) {
                command = { code: "takeoff", args: { handle: found.handle } };
                subject = found;
              } else if (worn && set.slots.some((saved, index) => index !== slot && saved && locatePiece(world, saved, this.identities)?.handle === worn.handle)) {
                command = { code: "takeoff", args: { handle: worn.handle } };
                subject = worn;
              } else {
                const simulation = await this.mod.view.simulateLoadout({ wieldAt: [{ item: { from: "gear", handle: found.handle }, slot }] });
                if (!simulation.ok || !simulation.value.placements.some((p) => p.slot === slot)) {
                  notes.push(piece!.name + ": the game cannot put this in the saved slot."); blocked.add(slot); continue;
                }
                command = { code: "wield", args: { handle: found.handle, slot } };
                subject = found;
                displaced = worn;
              }
            } else if (worn) { command = { code: "takeoff", args: { handle: worn.handle } }; subject = worn; }
            break;
          }
          if (command) break;
        }
        if (!command || !subject) break;
        if (!await this.confirm(subject, command.code === "wield" ? "w" : "t") || displaced && !await this.confirm(displaced, "t")) {
          notes.push("The swap was canceled."); break;
        }
        const fresh = await this.mod.view.input();
        if (!fresh.ok || this.stopped || this.interrupted) break;
        if (fresh.value.token.epoch !== input.value.token.epoch || fresh.value.token.revision !== input.value.token.revision) { notes.push("The swap stopped because the game changed while you were confirming."); break; }
        if (fresh.value.phase !== "play" || fresh.value.prompt || fresh.value.messagePending) { notes.push("The swap stopped because the game needs other input."); break; }
        const result = await this.mod.act.submit(fresh.value.token, { kind: "command", command });
        if (!result.ok) { notes.push(subject.label + ": " + result.message); blocked.add(target); continue; }
        let settled = false;
        for (let wait = 0; wait < 300 && !this.stopped && !this.interrupted; wait++) {
          await this.delay();
          const next = await this.mod.view.input();
          if (!next.ok) break;
          if (next.value.token.epoch !== fresh.value.token.epoch) break;
          if (next.value.token.revision !== fresh.value.token.revision && next.value.phase === "play" && !next.value.prompt && !next.value.messagePending) { settled = true; break; }
        }
        const after = await this.world();
        const moved = command.code === "wield" ? after?.equipment[target]?.handle === subject.handle : !after?.equipment.some((item) => item?.handle === subject!.handle);
        if (!settled) { notes.push("The swap stopped while the game was waiting."); break; }
        if (!moved) { notes.push(subject.label + ": the game did not move it."); blocked.add(target); }
      }
      const last = await this.world();
      if (last) {
        const lost = carried(first).filter((item) => !carried(last).some((now) => now.handle === item.handle));
        for (const item of lost) notes.push(item.label + ": you no longer carry it after the swap.");
        const complete = set.slots.every((piece, slot) => piece ? !!last.equipment[slot] && last.equipment[slot]?.handle === locatePiece(last, piece, this.identities)?.handle : !last.equipment[slot]);
        notes.unshift(complete ? "The loadout is restored." : "The loadout is only partly restored.");
      }
    } catch {
      notes.push("The swap stopped because of a game error.");
    } finally {
      this.running = false;
      await this.report(set.name + ": " + notes.join(" "));
    }
  }
}
