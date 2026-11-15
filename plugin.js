// qol - generated from plugin.ts by neo-angband-mod-build
// (@rpgm-tools/neo-angband-mod-sdk). Edit the TypeScript source, not this file.

// preferences.ts
function isRecord(value) {
  return !!value && typeof value === "object";
}
function storedRememberedSettings(raw) {
  if (!isRecord(raw)) return null;
  const candidate = raw.v === 2 ? raw.options : raw.v === 1 ? raw : void 0;
  if (!isRecord(candidate) || candidate.v !== 1 || !isRecord(candidate.values)) return null;
  const { values, hitpointWarn, delayFactor, lazymoveDelay } = candidate;
  return { v: 1, values, hitpointWarn, delayFactor, lazymoveDelay };
}
function preservedPreferences(raw) {
  const options = storedRememberedSettings(raw);
  const hideRepeatShortcuts = isRecord(raw) && raw.v === 2 && raw.hideRepeatShortcuts === true;
  return {
    ...options ? { options } : {},
    ...hideRepeatShortcuts ? { hideRepeatShortcuts } : {}
  };
}
function readRememberedSettings(raw) {
  return storedRememberedSettings(raw);
}
function withRememberedSettings(raw, options) {
  return { v: 2, ...preservedPreferences(raw), options };
}
function readHideRepeatShortcuts(raw) {
  return isRecord(raw) && raw.v === 2 && raw.hideRepeatShortcuts === true;
}
function withHideRepeatShortcuts(raw, hidden) {
  return { v: 2, ...preservedPreferences(raw), hideRepeatShortcuts: hidden };
}
var PREFS_VERSION = 1;
function migratePreferences(value, fromVersion) {
  if (fromVersion >= PREFS_VERSION) return isRecord(value) && value.v === 2 ? value : null;
  const kept = preservedPreferences(value);
  return Object.keys(kept).length > 0 ? { v: 2, ...kept } : null;
}

// remember.ts
function mayRemember(name, cheats, birth) {
  if (name.startsWith("birth_") || birth !== void 0 && name in birth) return false;
  if (name.startsWith("cheat_") || name.startsWith("score_")) return cheats;
  return true;
}
function rememberedFrom(snapshot, cheats) {
  const values = {};
  for (const [name, value] of Object.entries(snapshot.values)) {
    if (mayRemember(name, cheats, snapshot.birth)) values[name] = value;
  }
  return {
    v: 1,
    values,
    hitpointWarn: snapshot.hitpointWarn,
    delayFactor: snapshot.delayFactor,
    lazymoveDelay: snapshot.lazymoveDelay
  };
}
function applyRemembered(options, remembered, cheats) {
  let applied = 0;
  for (const [name, value] of Object.entries(remembered.values ?? {})) {
    if (!mayRemember(name, cheats) || options.isBirth?.(name) === true) continue;
    if (options.set(name, value)) applied++;
  }
  if (typeof remembered.hitpointWarn === "number") options.hitpointWarn = remembered.hitpointWarn;
  if (typeof remembered.delayFactor === "number") options.delayFactor = remembered.delayFactor;
  if (typeof remembered.lazymoveDelay === "number") options.lazymoveDelay = remembered.lazymoveDelay;
  return applied;
}

// macro-wizard.ts
var SUGGESTED_TRIGGERS = [
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12"
];
var PANEL_ID = "activation-shortcut";
async function suggestedMacroTrigger(keys) {
  for (const trigger of SUGGESTED_TRIGGERS) {
    const answer = await keys.isBindableTriggerKey(trigger);
    if (answer.ok && answer.value) return trigger;
  }
  return null;
}
function macroActionFor(ability) {
  return ability.command === "activate" ? "A" : "m";
}
async function bindAbilityMacro(keys, ability, trigger) {
  const bindable = await keys.isBindableTriggerKey(trigger);
  if (!bindable.ok || !bindable.value) return false;
  return (await keys.bind(trigger, macroActionFor(ability))).ok;
}
function macroPanel(ability, trigger, problem) {
  const family = ability.command === "activate" ? "activation" : "casting";
  return {
    id: PANEL_ID,
    title: `Shortcut for ${ability.name}`,
    modal: true,
    root: {
      type: "column",
      children: [
        { type: "text", text: `Bind a key to open the ${family} command?` },
        { type: "input", label: "Key", action: "set-key", value: trigger },
        ...problem ? [{ type: "text", text: problem }] : [],
        {
          type: "row",
          children: [
            { type: "button", label: "Bind shortcut", action: "bind" },
            { type: "button", label: "No thanks", action: "decline" }
          ]
        }
      ]
    }
  };
}
var UNAVAILABLE = "That key is unavailable. Choose an unused printable key, Enter, or F1 through F12.";
var mod = null;
var active = false;
var pending = [];
function startMacroWizard(live3) {
  mod = live3;
  if (pending.length > 0) void showNext();
}
function offerAbilityMacro(ability) {
  pending.push(ability);
  if (mod) void showNext();
}
async function showNext() {
  const live3 = mod;
  if (active || !live3) return;
  const ability = pending.shift();
  if (!ability) return;
  active = true;
  const next = () => {
    active = false;
    void showNext();
  };
  const suggested = await suggestedMacroTrigger(live3.ui.keys);
  if (!suggested) {
    live3.meta.log(`no unused keymap trigger is available for ${ability.name}`);
    next();
    return;
  }
  let key = suggested;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    void live3.ui.unmount(PANEL_ID);
    next();
  };
  const opened = await live3.ui.mount(
    macroPanel(ability, key),
    (action, value) => {
      if (action === "set-key" && typeof value === "string") {
        key = value.trim();
      } else if (action === "decline") {
        finish();
      } else if (action === "bind") {
        void bindAbilityMacro(live3.ui.keys, ability, key).then((bound) => {
          if (finished) return;
          if (bound) finish();
          else void live3.ui.patch(PANEL_ID, { root: macroPanel(ability, key, UNAVAILABLE).root });
        });
      }
    },
    finish
  );
  if (!opened.ok) {
    live3.meta.log(`could not open activation shortcut helper: ${opened.message}`);
    finished = true;
    next();
  }
}
function stopMacroWizard() {
  const live3 = mod;
  mod = null;
  pending.splice(0);
  if (active) void live3?.ui.unmount(PANEL_ID);
  active = false;
}

// repeat-shortcuts.ts
var PANEL_ID2 = "repeated-action-shortcuts";
function defaultRepeatShortcuts() {
  return [{ trigger: "F1", label: "Rest as needed", action: "R&[Enter]" }];
}
async function bindRepeatShortcut(keys, trigger, action) {
  const bindable = await keys.isBindableTriggerKey(trigger);
  if (!bindable.ok || !bindable.value) return false;
  return (await keys.bind(trigger, action)).ok;
}
function repeatShortcutsPanel(shortcuts, triggers, status) {
  return {
    id: PANEL_ID2,
    title: "Repeated-action shortcuts",
    modal: false,
    root: {
      type: "column",
      children: [
        { type: "text", text: "Bind one key to a repeated non-combat command. Existing bindings are left unchanged." },
        ...shortcuts.flatMap((shortcut, i) => [
          {
            type: "input",
            label: `${shortcut.label} key`,
            action: `set-key-${String(i)}`,
            value: triggers[i] ?? shortcut.trigger
          },
          {
            type: "row",
            children: [
              { type: "button", label: "Bind", action: `bind-${String(i)}`, disabled: status[i] === "Bound." },
              { type: "text", text: status[i] ?? "" }
            ]
          }
        ]),
        { type: "checkbox", label: "Don't show this again", action: "hide-forever", checked: false },
        { type: "button", label: "Done", action: "done" }
      ]
    }
  };
}
var live = null;
async function startRepeatShortcuts(mod2) {
  stopRepeatShortcuts();
  const stored = await mod2.store.prefs.get();
  if (stored.ok && readHideRepeatShortcuts(stored.value)) return;
  live = mod2;
  const shortcuts = defaultRepeatShortcuts();
  const triggers = shortcuts.map((s) => s.trigger);
  const status = shortcuts.map(() => "");
  const redraw = () => {
    void mod2.ui.patch(PANEL_ID2, { root: repeatShortcutsPanel(shortcuts, triggers, status).root });
  };
  const opened = await mod2.ui.mount(
    repeatShortcutsPanel(shortcuts, triggers, status),
    (action, value) => {
      if (action === "done") {
        void mod2.ui.unmount(PANEL_ID2);
      } else if (action === "hide-forever" && typeof value === "boolean") {
        void mod2.store.prefs.get().then((current) => mod2.store.prefs.set(withHideRepeatShortcuts(current.ok ? current.value : null, value)));
      } else if (action.startsWith("set-key-") && typeof value === "string") {
        triggers[Number(action.slice("set-key-".length))] = value.trim();
      } else if (action.startsWith("bind-")) {
        const i = Number(action.slice("bind-".length));
        const shortcut = shortcuts[i];
        if (!shortcut) return;
        void bindRepeatShortcut(mod2.ui.keys, triggers[i] ?? shortcut.trigger, shortcut.action).then((bound) => {
          status[i] = bound ? "Bound." : "That key is unavailable.";
          redraw();
        });
      }
    },
    () => {
      if (live === mod2) live = null;
    }
  );
  if (!opened.ok) {
    mod2.meta.log(`could not open repeated-action shortcuts: ${opened.message}`);
    live = null;
  }
}
function stopRepeatShortcuts() {
  const mod2 = live;
  live = null;
  void mod2?.ui.unmount(PANEL_ID2);
}

// gear-comparison.ts
var NUMBERS = [
  ["speed", "Speed (110 is normal)", 1],
  ["baseAc", "Base armor class", 1],
  ["toA", "Armor bonus", 1],
  ["ac", "Total armor class", 1],
  ["toH", "Global to-hit", 1],
  ["toD", "Global to-dam", 1],
  ["shots", "Shots per turn", 10],
  ["moves", "Extra movement", 1],
  ["ammoMult", "Ammo multiplier", 1],
  ["damRed", "Flat damage reduction", 1],
  ["percDamRed", "Damage reduction (%)", 1],
  ["seeInfra", "Infravision (grids)", 1],
  ["light", "Light radius (grids)", 1],
  ["hold", "Comfortable weapon weight (lb)", 1],
  ["maxHp", "Max hit points", 1],
  ["maxSp", "Max spell points", 1],
  ["totalWeight", "Carried weight (lb)", 10],
  ["weightLimit", "Weight limit (lb)", 10]
];
var BOOLEANS = [
  ["heavyWield", "Weapon too heavy"],
  ["heavyShoot", "Launcher too heavy"],
  ["blessWield", "Blessed weapon rule met"],
  ["cumberArmor", "Armor reduces spell points"]
];
var STATS = ["STR", "INT", "WIS", "DEX", "CON"];
var SKILLS = ["Physical disarming", "Magical disarming", "Magic devices", "Saving throw", "Searching", "Stealth", "Melee accuracy", "Shooting accuracy", "Throwing accuracy", "Digging"];
var VECTORS = [["statAdd", "Equipment modifier"], ["statUse", "Current stat (encoded)"], ["statTop", "Undrained stat (encoded)"], ["statInd", "Stat table index"], ["skills", "Skill"], ["resists", "Resistance level"]];
function number(value, scale = 1, signed = false) {
  if (value === void 0) return "unknown";
  const formatted = String(Number((value / scale).toFixed(4)));
  return signed && value > 0 ? "+" + formatted : formatted;
}
function summaryRow(label, before, after) {
  return { label, before: number(before), after: number(after), delta: number(before === void 0 || after === void 0 ? void 0 : after - before, 1, true) };
}
function comparisonRows(simulation, spells = []) {
  const before = simulation.before.stats;
  const after = simulation.after.stats;
  const delta = simulation.delta;
  const rows = NUMBERS.map(([key, label, scale]) => ({ label, before: number(before[key], scale), after: number(after[key], scale), delta: number(delta[key], scale, true) }));
  const beforeCombat = simulation.before.combat;
  const afterCombat = simulation.after.combat;
  rows.push(summaryRow("Blows per round", beforeCombat.blows, afterCombat.blows));
  rows.push(summaryRow("Damage per round", beforeCombat.damage?.normal, afterCombat.damage?.normal));
  const damageLines = [...beforeCombat.damage?.vs ?? [], ...afterCombat.damage?.vs ?? []];
  const seen = /* @__PURE__ */ new Set();
  for (const line of damageLines) {
    const key = line.kind + ": " + line.name;
    if (seen.has(key)) continue;
    seen.add(key);
    const damage = (combat) => combat.damage?.vs.find((entry) => entry.kind === line.kind && entry.name === line.name)?.damage ?? combat.damage?.normal;
    rows.push(summaryRow("Damage per round (" + key + ")", damage(beforeCombat), damage(afterCombat)));
  }
  const beforeSpells = simulation.before.spells ?? [];
  const afterSpells = simulation.after.spells ?? [];
  for (const index of [...new Set([...beforeSpells, ...afterSpells].map((spell) => spell.index))].sort((a, b) => a - b)) {
    const had = beforeSpells.find((spell) => spell.index === index);
    const has = afterSpells.find((spell) => spell.index === index);
    const name = spells.find((spell) => spell.sidx === index)?.name ?? "Spell";
    rows.push(summaryRow(name + " mana cost", had?.mana, has?.mana));
    rows.push(summaryRow(name + " fail chance (%)", had?.failChance, has?.failChance));
  }
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
  for (const [key, label] of [["objectFlags", "Object flag"], ["playerFlags", "Player flag"]]) {
    const flags = [.../* @__PURE__ */ new Set([...before[key], ...after[key]])].sort();
    if (flags.length === 0) rows.push({ label, before: "none", after: "none", delta: "same" });
    for (const flag of flags) {
      const had = before[key].includes(flag);
      const has = after[key].includes(flag);
      rows.push({ label: label + ": " + flag, before: had ? "yes" : "no", after: has ? "yes" : "no", delta: had === has ? "same" : has ? "gained" : "lost" });
    }
  }
  return rows;
}
function grouped(nodes) {
  const groups = [];
  for (let i = 0; i < nodes.length; i += 24) groups.push({ type: "column", children: nodes.slice(i, i + 24) });
  return groups;
}
function comparisonPanel(simulation, title, slot, spells = []) {
  const rows = [
    { type: "row", children: ["Statistic", "Before", "After", "Delta"].map((text) => ({ type: "text", text })) },
    ...comparisonRows(simulation, spells).map((row) => ({ type: "row", children: [row.label, row.before, row.after, row.delta].map((text) => ({ type: "text", text })) }))
  ];
  return { id: "gear-comparison", title, modal: true, root: { type: "column", children: [
    { type: "text", text: "Comparing in " + slot + ", using only runes you have learned." },
    ...simulation.delta.unknownRunes ? [{ type: "text", text: "Unknown runes are not counted, so a zero delta can still hide an effect." }] : [],
    ...simulation.unresolved.length ? [{ type: "text", text: "Some items could not be found, so this comparison is incomplete." }] : [],
    { type: "text", text: "Global to-hit and to-dam leave out the weapon's own bonuses." },
    ...grouped(rows),
    { type: "button", label: "Choose another item", action: "items" }
  ] } };
}
function comparisonCandidates(world) {
  const seen = /* @__PURE__ */ new Set();
  const candidates = [];
  for (const item of [...world.inventory ?? [], ...(world.equipment ?? []).filter((item2) => item2 !== null), ...world.quiver ?? []]) {
    if (seen.has(item.handle)) continue;
    seen.add(item.handle);
    candidates.push({ label: item.name ?? item.label, ref: { from: "gear", handle: item.handle } });
  }
  if (world.player) {
    for (const item of world.floorHere ?? []) {
      if (item.floorIndex !== void 0) candidates.push({ label: "Floor: " + (item.name ?? item.label), ref: { from: "floor", ...world.player.grid, index: item.floorIndex } });
    }
  }
  for (const [storeIndex, store] of (world.stores ?? []).entries()) {
    for (const item of store.stock) candidates.push({ label: store.featName + ": " + (item.name ?? item.label), ref: { from: "store", store: storeIndex, index: item.index } });
  }
  return candidates;
}
var GearComparisonManager = class {
  constructor(mod2) {
    this.mod = mod2;
  }
  mod;
  stopped = false;
  openPanel = false;
  generation = 0;
  stop() {
    this.stopped = true;
    this.generation++;
    void this.mod.ui.unmount("gear-comparison");
  }
  async open() {
    if (this.stopped || this.openPanel) return;
    this.openPanel = true;
    const generation = ++this.generation;
    const current = () => !this.stopped && this.openPanel && generation === this.generation;
    let page = 0;
    let candidates = [];
    let world = null;
    let mounted = false;
    let busy = false;
    const show = async (panel) => {
      if (!current()) return;
      const result = mounted ? await this.mod.ui.patch("gear-comparison", { title: panel.title ?? null, root: panel.root }) : await this.mod.ui.mount(panel, (action) => {
        void act(action);
      }, () => {
        this.openPanel = false;
        this.generation++;
      });
      if (!current()) {
        if (!mounted) await this.mod.ui.unmount("gear-comparison");
        return;
      }
      mounted = result.ok;
      if (!result.ok) {
        this.openPanel = false;
        this.mod.meta.log(result.message);
      }
    };
    const items = async (message = "") => {
      const read = await this.mod.view.world();
      if (!current()) return;
      world = read.ok ? read.value : null;
      candidates = world ? comparisonCandidates(world) : [];
      page = Math.max(0, Math.min(page, Math.ceil(candidates.length / 16) - 1));
      const start = page * 16;
      await show({ id: "gear-comparison", title: "Compare gear", modal: true, root: { type: "column", children: [
        { type: "text", text: message || (!read.ok ? read.message : candidates.length ? "Choose an item, then a slot to compare it in." : "No known items to compare. Carry an item, stand on one, or visit a store.") },
        ...candidates.slice(start, start + 16).map((candidate, index) => ({ type: "button", label: candidate.label, action: "item-" + String(start + index) })),
        { type: "row", children: [
          { type: "button", label: "Previous page", action: "previous", disabled: page === 0 },
          { type: "text", text: "Page " + String(page + 1) },
          { type: "button", label: "Next page", action: "next", disabled: start + 16 >= candidates.length }
        ] }
      ] } });
    };
    let slots = [];
    let comparedToken = null;
    let title = "Compare gear";
    const act = async (action) => {
      if (!current() || busy) return;
      busy = true;
      try {
        if (action === "items" || action === "next" || action === "previous") {
          if (action === "next") page++;
          if (action === "previous") page--;
          await items();
          return;
        }
        if (action.startsWith("item-")) {
          const candidate = candidates[Number(action.slice(5))];
          if (!candidate || !world) return;
          const fresh = await this.mod.view.isCurrent(world.token);
          if (!current()) return;
          if (!fresh.ok || !fresh.value) {
            await items("The game changed. Choose the item again.");
            return;
          }
          const result = await this.mod.view.inspect.compareLoadoutSlots(candidate.ref);
          if (!current()) return;
          if (!result.ok) {
            await items(result.message);
            return;
          }
          slots = [...result.value.slots];
          comparedToken = result.value.token;
          title = candidate.label;
          if (!slots.length) {
            await items("This item has no worn slot to compare.");
            return;
          }
          if (slots.length === 1) {
            await show(comparisonPanel(slots[0].comparison, title, slots[0].name, world?.spellbooks?.flatMap((book) => book.spells) ?? []));
            return;
          }
          await show({ id: "gear-comparison", title, modal: true, root: { type: "column", children: [
            { type: "text", text: "Choose the slot to replace." },
            ...grouped(slots.map((slot, index) => ({ type: "button", label: slot.name, action: "slot-" + String(index) }))),
            { type: "button", label: "Choose another item", action: "items" }
          ] } });
        } else if (action.startsWith("slot-")) {
          const slot = slots[Number(action.slice(5))];
          if (!comparedToken) return;
          const fresh = await this.mod.view.isCurrent(comparedToken);
          if (!current()) return;
          if (!fresh.ok || !fresh.value) {
            await items("The game changed. Choose the item again.");
            return;
          }
          if (slot) await show(comparisonPanel(slot.comparison, title, slot.name, world?.spellbooks?.flatMap((book) => book.spells) ?? []));
        }
      } catch {
        if (current()) await items("Could not read the comparison.");
      } finally {
        busy = false;
      }
    };
    try {
      await items();
    } catch {
      this.openPanel = false;
      this.mod.meta.log("Could not open the comparison.");
    }
  }
};

// loadouts.ts
var PANEL = "loadouts";
var LIMIT = 20;
function readLoadouts(bag) {
  if (!bag || typeof bag !== "object") return [];
  const saved = bag.loadouts;
  if (!saved || saved.v !== 1 || !Array.isArray(saved.sets)) return [];
  return saved.sets.slice(0, LIMIT).filter((set) => {
    if (!set || typeof set !== "object" || typeof set.name !== "string" || !set.name.trim() || set.name.length > 64) return false;
    if (!Array.isArray(set.slots) || set.slots.length > 64) return false;
    return set.slots.every((piece) => {
      if (piece === null) return true;
      if (!piece || typeof piece !== "object") return false;
      const p = piece;
      return Number.isSafeInteger(p.handle) && p.handle > 0 && typeof p.kindKey === "string" && typeof p.name === "string";
    });
  }).map((set) => ({ name: set.name, slots: set.slots.map((p) => p && { handle: p.handle, kindKey: p.kindKey, name: p.name }) }));
}
function withLoadouts(bag, sets) {
  const base = bag && typeof bag === "object" && !Array.isArray(bag) ? bag : {};
  return { ...base, loadouts: { v: 1, sets: sets.map((set) => ({ name: set.name, slots: set.slots.map((p) => p && { ...p }) })) } };
}
function captureLoadout(name, equipment) {
  return { name: name.trim(), slots: equipment.map((item) => item && { handle: item.handle, kindKey: item.kindKey, name: item.name ?? item.label }) };
}
function carried(world) {
  return [...world.equipment.filter((item) => item !== null), ...world.inventory, ...world.quiver ?? []];
}
function locatePiece(world, piece, identities) {
  const id = identities.get(piece.handle);
  return carried(world).find((item) => id === void 0 ? item.handle === piece.handle : item.objectId === id);
}
function inscriptionChecks(inscription, key) {
  return [...(inscription ?? "").matchAll(/!([wt*])/g)].filter((match) => match[1] === key || match[1] === "*").length;
}
var LoadoutManager = class {
  constructor(mod2, delay = () => new Promise((resolve) => setTimeout(resolve, 100))) {
    this.mod = mod2;
    this.delay = delay;
  }
  mod;
  delay;
  stopped = false;
  running = false;
  interrupted = false;
  menuOpen = false;
  confirming = null;
  identities = /* @__PURE__ */ new Map();
  disturb() {
    this.interrupted = true;
  }
  stop() {
    this.stopped = true;
    this.interrupted = true;
    this.confirming?.(false);
    void this.mod.ui.unmount(PANEL);
  }
  async world() {
    const result = await this.mod.view.world();
    if (!result.ok || !result.value.equipment || !result.value.inventory) return null;
    const world = result.value;
    for (const item of carried(world)) {
      if (item.objectId !== void 0 && !this.identities.has(item.handle)) this.identities.set(item.handle, item.objectId);
    }
    return world;
  }
  async open() {
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
    const panel = (message = "") => ({
      id: PANEL,
      title: "Loadouts",
      modal: true,
      root: { type: "column", children: [
        { type: "text", text: "Save what you are wearing, empty slots included. The game manages the quiver. A full pack can drop an item during a swap." },
        { type: "input", label: "Loadout name", action: "name", value: name },
        { type: "button", label: "Save loadout", action: "save" },
        { type: "text", text: message },
        ...sets.map((set, index) => ({ type: "row", children: [
          { type: "text", text: set.name },
          { type: "button", label: "Restore", action: "restore-" + String(index) },
          { type: "button", label: "Delete", action: "delete-" + String(index) }
        ] }))
      ] }
    });
    const refresh = async (message) => {
      if (!this.stopped) await this.mod.ui.patch(PANEL, { root: panel(message).root });
    };
    const act = async (action, value) => {
      if (this.stopped || busy) return;
      if (action === "name" && typeof value === "string") {
        name = value;
        return;
      }
      busy = true;
      try {
        if (action === "save" || action.startsWith("delete-")) {
          const bag = await this.mod.store.character.get();
          if (!bag.ok) {
            await refresh("Could not read the loadouts.");
            return;
          }
          const current = readLoadouts(bag.value);
          let next;
          if (action === "save") {
            const clean = name.trim();
            if (!clean || clean.length > 64) {
              await refresh("Use a name of 1 to 64 characters.");
              return;
            }
            const now = await this.world();
            if (!now) return;
            if (current.length >= LIMIT && !current.some((set) => set.name === clean)) {
              await refresh("This character has 20 loadouts, the limit. Delete one to save another.");
              return;
            }
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
      } finally {
        busy = false;
      }
    };
    if (this.stopped) return;
    const opened = await this.mod.ui.mount(panel(), (action, value) => {
      void act(action, value);
    }, () => {
      this.menuOpen = false;
    });
    if (this.stopped) await this.mod.ui.unmount(PANEL);
    if (!opened.ok) {
      this.menuOpen = false;
      this.mod.meta.log(opened.message);
    }
  }
  async report(text) {
    if (this.stopped) return;
    const opened = await this.mod.ui.mount({ id: PANEL, title: "Loadouts", root: { type: "column", children: [
      { type: "text", text: text.slice(0, 4096) },
      { type: "button", label: "Close", action: "close" }
    ] } }, () => {
      void this.mod.ui.unmount(PANEL);
    });
    if (this.stopped) await this.mod.ui.unmount(PANEL);
    if (!opened.ok) this.mod.meta.log(text);
  }
  async confirm(item, key) {
    const count = inscriptionChecks(item.inscription, key);
    for (let i = 0; i < count; i++) {
      if (this.stopped || this.interrupted) return false;
      const yes = await new Promise((resolve) => {
        this.confirming = resolve;
        void this.mod.ui.mount({ id: PANEL, title: "Loadouts", modal: true, root: { type: "column", children: [
          { type: "text", text: (key === "w" ? "Wear " : "Take off ") + (item.name ?? item.label) + "?" },
          { type: "button", label: "Continue swap", action: "yes" },
          { type: "button", label: "Cancel swap", action: "cancel" }
        ] } }, (action) => resolve(action === "yes"), () => resolve(false)).then((opened) => {
          if (!opened.ok) resolve(false);
        });
      });
      this.confirming = null;
      await this.mod.ui.unmount(PANEL);
      if (!yes) return false;
    }
    return true;
  }
  async restore(set) {
    if (this.stopped || this.running) return;
    this.running = true;
    this.interrupted = false;
    const notes = [];
    const blocked = /* @__PURE__ */ new Set();
    try {
      const first = await this.world();
      let hp = first?.player?.hp;
      if (!first || first.equipment.length !== set.slots.length) {
        notes.push("The saved body slots are not available.");
        return;
      }
      for (let attempt = 0; attempt < set.slots.length * 3; attempt++) {
        const input = await this.mod.view.input();
        const world = await this.world();
        if (!input.ok || !world || this.stopped || this.interrupted || world.player?.dead || hp !== void 0 && world.player && world.player.hp < hp) {
          notes.push("The swap stopped.");
          break;
        }
        hp = world.player?.hp;
        if (input.value.phase !== "play" || input.value.prompt || input.value.messagePending || input.value.driver.kind !== "player") {
          notes.push("The swap stopped because the game needs other input.");
          break;
        }
        let command = null;
        let target = -1;
        let subject = null;
        let displaced = null;
        for (const empty of [false, true]) {
          for (let slot = 0; slot < set.slots.length; slot++) {
            if (blocked.has(slot)) continue;
            const piece = set.slots[slot] ?? null;
            if (piece === null !== empty) continue;
            const worn = world.equipment[slot] ?? null;
            const found = piece && locatePiece(world, piece, this.identities);
            if (piece && !found) {
              notes.push(piece.name + ": you are not carrying it.");
              blocked.add(slot);
              continue;
            }
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
                  notes.push(piece.name + ": the game cannot put this in the saved slot.");
                  blocked.add(slot);
                  continue;
                }
                command = { code: "wield", args: { handle: found.handle, slot } };
                subject = found;
                displaced = worn;
              }
            } else if (worn) {
              command = { code: "takeoff", args: { handle: worn.handle } };
              subject = worn;
            }
            break;
          }
          if (command) break;
        }
        if (!command || !subject) break;
        if (!await this.confirm(subject, command.code === "wield" ? "w" : "t") || displaced && !await this.confirm(displaced, "t")) {
          notes.push("The swap was canceled.");
          break;
        }
        const fresh = await this.mod.view.input();
        if (!fresh.ok || this.stopped || this.interrupted) break;
        if (fresh.value.token.epoch !== input.value.token.epoch || fresh.value.token.revision !== input.value.token.revision) {
          notes.push("The swap stopped because the game changed while you were confirming.");
          break;
        }
        if (fresh.value.phase !== "play" || fresh.value.prompt || fresh.value.messagePending) {
          notes.push("The swap stopped because the game needs other input.");
          break;
        }
        const result = await this.mod.act.submit(fresh.value.token, { kind: "command", command });
        if (!result.ok) {
          notes.push(subject.label + ": " + result.message);
          blocked.add(target);
          continue;
        }
        let settled = false;
        for (let wait = 0; wait < 300 && !this.stopped && !this.interrupted; wait++) {
          await this.delay();
          const next = await this.mod.view.input();
          if (!next.ok) break;
          if (next.value.token.epoch !== fresh.value.token.epoch) break;
          if (next.value.token.revision !== fresh.value.token.revision && next.value.phase === "play" && !next.value.prompt && !next.value.messagePending) {
            settled = true;
            break;
          }
        }
        const after = await this.world();
        const moved = command.code === "wield" ? after?.equipment[target]?.handle === subject.handle : !after?.equipment.some((item) => item?.handle === subject.handle);
        if (!settled) {
          notes.push("The swap stopped while the game was waiting.");
          break;
        }
        if (!moved) {
          notes.push(subject.label + ": the game did not move it.");
          blocked.add(target);
        }
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
};

// town-lava.ts
function clearTownLava(gen, core) {
  const cave = gen.c;
  if (cave.depth !== 0) return true;
  const lava = core.FEAT.LAVA;
  const granite = core.FEAT.GRANITE;
  for (let y = 0; y < cave.height; y++) {
    for (let x = 0; x < cave.width; x++) {
      const grid = core.loc(x, y);
      if (cave.feat(grid) === lava) cave.setFeat(grid, granite);
    }
  }
  return true;
}

// wording.ts
var UPSTREAM_MESSAGE_WORDING = {
  /* cmd-cave.c, ordering an immobile monster to move (command monster). */
  "The monster can not move.": "The monster cannot move."
};
var UPSTREAM_MESSAGE_RULES = Object.entries(UPSTREAM_MESSAGE_WORDING).map(([find, replace]) => ({ find, replace }));

// rejoin-prose.ts
function plainLine(line) {
  return /^[A-Za-z"'][^\t]*\S$/u.test(line) && /[A-Za-z]+ [A-Za-z]+/u.test(line) && !/ {2,}|[|+_\\]|^(?:[A-Za-z0-9?]|\^[A-Za-z])(?:[).:]|\s)|^(?:ESC|Enter|Return|Tab|Space|F\d+|Ctrl[-+]|Alt[-+])\b|^[A-Za-z]+\s*:/u.test(line);
}
function rejoinProse(text) {
  return text.split(/(\r?\n(?:[ \t]*\r?\n)+)/u).map((paragraph, index) => {
    if (index % 2 !== 0) return paragraph;
    const lines = paragraph.split(/\r?\n/u);
    return lines.length > 1 && lines.every(plainLine) ? lines.join(" ") : paragraph;
  }).join("");
}
function rejoinScreenProse(text, site) {
  return site.part === "prose" || site.part === "detail" ? rejoinProse(text) : text;
}

// context-help.ts
var MENU_ID = "core:context-object";
var ITEM_HELP = {
  inspect: "Show what you have learned about this item so far.",
  equip: "Wear or wield it in the matching equipment slot.",
  takeoff: "Stop wearing or wielding this item.",
  drop: "Leave it on the floor where you stand.",
  throw: "Throw it at a target you pick.",
  fire: "Shoot this ammunition from your sling, bow, or crossbow.",
  inscribe: "Add an inscription that shows next to its name.",
  uninscribe: "Remove this item's inscription.",
  ignore: "Mark it ignored so it stays hidden, or unmark it.",
  browse: "List the spells in this book without casting any.",
  cast: "Pick a spell from this book and cast it.",
  study: "Learn a new spell from this book.",
  aim: "Point the wand in a direction and use a charge.",
  zap: "Zap the rod. It recharges over time.",
  "use-staff": "Use the staff, spending one of its charges.",
  read: "Read the scroll, using it up.",
  quaff: "Drink the potion.",
  eat: "Eat this food or mushroom.",
  activate: "Use the item's activation. It needs time to recharge.",
  refill: "Refuel your light source from this item."
};
var COMMAND_HELP = {
  "{": ITEM_HELP.inscribe,
  "}": ITEM_HELP.uninscribe,
  w: ITEM_HELP.equip,
  t: ITEM_HELP.takeoff,
  I: ITEM_HELP.inspect,
  d: ITEM_HELP.drop,
  f: ITEM_HELP.fire,
  u: ITEM_HELP["use-staff"],
  a: ITEM_HELP.aim,
  z: ITEM_HELP.zap,
  A: ITEM_HELP.activate,
  E: ITEM_HELP.eat,
  q: ITEM_HELP.quaff,
  r: ITEM_HELP.read,
  F: ITEM_HELP.refill,
  v: ITEM_HELP.throw,
  b: ITEM_HELP.browse,
  G: ITEM_HELP.study,
  m: ITEM_HELP.cast,
  k: ITEM_HELP.ignore,
  U: "Choose an item and use its ordinary action.",
  D: "Choose a direction to disarm a trap or chest.",
  R: "Rest for a turn count or until you recover.",
  l: "Look at a grid, monster, or item without spending a turn.",
  "*": "Choose a monster or location as your target.",
  "'": "Target the nearest visible monster.",
  T: "Choose a direction to dig through terrain.",
  "<": "Climb the up staircase under you.",
  ">": "Descend the down staircase under you.",
  o: "Choose a direction to open a door or chest.",
  c: "Choose a direction to close a door.",
  h: "Fire ammunition at the nearest target.",
  W: "Step in a direction without automatically disarming a trap.",
  e: "List your worn equipment.",
  i: "List the items in your pack.",
  "|": "List ammunition in your quiver.",
  g: "Pick up an item from the floor under you.",
  S: "Show your character's abilities.",
  M: "Show the map of this level.",
  K: "Show or hide items marked as ignored.",
  "]": "List the items you can see.",
  "[": "List the monsters you can see.",
  L: "Move the map view to look around the level.",
  "/": "Explain a map symbol.",
  C: "Show your character's stats, equipment, and history.",
  "~": "Browse what your character has learned.",
  "=": "Review interface options and character settings.",
  Q: "End this character's run by retiring.",
  ")": "Save a text or HTML copy of the screen.",
  ":": "Add a note to your character's history.",
  V: "Show the game version.",
  '"': "Apply one preference-file line.",
  "+": "Alter the adjacent grid in a direction you choose.",
  s: "Attempt to steal from an adjacent monster.",
  ";": "Walk one step in a direction you choose.",
  ".": "Run in a direction until something stops you.",
  ",": "Wait in place for one turn.",
  p: "Explore until interrupted or no unexplored route remains.",
  n: "Repeat the previous command."
};
var COMMAND_MENUS = ["items", "action-commands", "manage-items", "information", "utility", "hidden"];
function installContextHelp(mod2) {
  const registry = mod2.engine?.registry;
  if (!registry) return;
  const commandHints = /* @__PURE__ */ new Map();
  const tableId = "core:keypress-command-table";
  const previousTable = registry.menus.handlerFor(tableId);
  registry.menus.register(tableId, (id, rows) => {
    const current = previousTable ? previousTable(id, rows) : rows;
    commandHints.clear();
    for (const row of current) {
      const key = rows.find((source) => source.id === row.id)?.semantic.data?.originalKey;
      if (row.semantic.kind !== "keypress-command" || typeof key !== "string") continue;
      const hint = Object.hasOwn(COMMAND_HELP, key) ? COMMAND_HELP[key] : void 0;
      if (hint !== void 0) commandHints.set(row.id, hint);
    }
    return current;
  });
  for (const menu of COMMAND_MENUS) {
    const menuId = "core:keypress-command:" + menu;
    const previous2 = registry.menus.handlerFor(menuId);
    registry.menus.register(menuId, (id, rows) => {
      const current = previous2 ? previous2(id, rows) : rows;
      return current.map((row) => {
        const ref = row.semantic.ref;
        const hint = row.semantic.kind === "keypress-command" && typeof ref === "string" ? commandHints.get(ref) : void 0;
        return row.hint !== void 0 || hint === void 0 ? row : { ...row, hint };
      });
    });
  }
  const previous = registry.menus.handlerFor(MENU_ID);
  registry.menus.register(MENU_ID, (id, rows) => {
    const current = previous ? previous(id, rows) : rows;
    return current.map((row) => {
      const ref = row.semantic.ref;
      if (row.hint !== void 0 || row.semantic.kind !== "command" || typeof ref !== "string") return row;
      const hint = Object.hasOwn(ITEM_HELP, ref) ? ITEM_HELP[ref] : void 0;
      return hint === void 0 ? row : { ...row, hint };
    });
  });
}

// epigraphs.json
var epigraphs_default = {
  death: [
    "The stairs were right there. The monster was closer.",
    "Every unknown potion is a question. This one had an answer.",
    "Somewhere down there, a pile of good gear waits for the next adventurer.",
    "The scroll of recall stayed in the pack, unread to the end.",
    "It was out of depth. So, as it turned out, was its victim.",
    "Grip and Fang will be barking about this one for years.",
    "One more level seemed like a fine idea at the time.",
    "The rune went unidentified, and the trap went off anyway.",
    "Hit points are a budget, and this one ran out mid-purchase.",
    "Down here, the floor keeps everything you drop, including you.",
    "The Pits are generous with monsters and stingy with exits.",
    "Several healing potions went down with the pack, unopened.",
    "Even the town at night keeps a few fresh graves.",
    "Light radius one, life expectancy shorter.",
    "Death came from offscreen, as it usually does.",
    "Another character dump for the scholars of bad decisions."
  ],
  retirement: [
    "The stairs go down forever. Someone has to stop taking them.",
    "The last scroll of recall went one way only: up.",
    "The armor hangs on a peg in town now, still dented.",
    "Gold in the pack and all limbs attached. Few leave the dungeon with both.",
    "Morgoth can wait. He has been waiting a long time already.",
    "Every potion left unquaffed is one fewer mystery to regret.",
    "The town at night is quiet, and that is enough these days.",
    "Some runes stay unidentified. Their owner has stopped asking.",
    "Walking out still breathing counts as winning on most dungeon levels.",
    "Grip and Fang still bark at the old adventurer every morning.",
    "The Pits were survived once. Nobody needs to check twice.",
    "The deepest stair taken will stay the deepest stair taken.",
    "Out-of-depth monsters are someone else's problem now.",
    "The shopkeepers lost a steady customer today.",
    "A full night's sleep, the first one since dungeon level one.",
    "The map is half drawn, and it will stay that way."
  ],
  victory: [
    "Morgoth's crown weighs more than it looks. It fits in the pack anyway.",
    "The Iron Hells of Angband are quiet for the first time in an age.",
    "One last staircase up, and nothing left down there to follow.",
    "Many thousand game turns later, there is one fewer Dark Lord.",
    "The town at night has nothing left to fear, except the dogs.",
    "Grip and Fang are unimpressed. Nobody told them about Morgoth.",
    "The deepest level is just a room now, with an empty throne in it.",
    "The out-of-depth monsters can stay that way. Nobody is coming down again.",
    "Every scroll of recall left in the pack is a souvenir now.",
    "The character dump is long. The last line is the only one anyone reads.",
    "Even the Pits feel smaller on the way back up.",
    "A hundred levels down, and the walk home is the easy part.",
    "Morgoth fell. The stairs, as always, were still there.",
    "Most runs end in a pile of gear. This one ended with a crown in it.",
    "The runes on the old armor never did get identified. It did not matter.",
    "The dungeon will still be there tomorrow. It just has no master."
  ]
};

// memorial.ts
function memorialLine(report) {
  const lines = report.outcome === "winner" ? epigraphs_default.victory : report.outcome === "retired" ? epigraphs_default.retirement : epigraphs_default.death;
  let hash = 2166136261;
  for (const char of JSON.stringify([report.outcome, report.name, report.turn, report.seed ?? null])) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return lines[hash % lines.length].slice(0, 72);
}

// plugin.ts
var PREF_ERROR_REPORT_LIMIT = 20;
var PURGE_ESCAPE_COUNT = 3;
var live2 = null;
var loadouts = null;
var comparison = null;
function liveOptions(mod2) {
  const state = mod2.engine?.state;
  return state?.options;
}
var plugin_default = {
  api: ">=2.3.0 <3.0.0",
  hooks({ flags }) {
    const hooks = {};
    if (flags["qol.memorialEpigraphs"] === true) hooks.runEndLine = memorialLine;
    if (flags["qol.rejoinProse"] === true) {
      hooks.helpText = (text, site) => site.kind === "paragraph" ? rejoinProse(text) : null;
      hooks.screenText = rejoinScreenProse;
      hooks.characterBackground = rejoinProse;
      hooks.objectInfoText = (text, site) => site.section === "flavor" ? rejoinProse(text) : text;
    }
    if (flags["qol.loadouts"] === true) hooks.monsterBecameVisible = () => loadouts?.disturb();
    if (flags["qol.accessibilityMacroWizard"] === true) hooks.abilityGained = offerAbilityMacro;
    if (flags["qol.rememberSettings"] === true) {
      const cheats = flags["qol.rememberCheats"] === true;
      hooks.optionsChanged = (options) => {
        const mod2 = live2;
        if (!mod2) return;
        const remembered = rememberedFrom(options, cheats);
        void mod2.store.prefs.get().then(
          (stored) => mod2.store.prefs.set(withRememberedSettings(stored.ok ? stored.value : null, remembered))
        );
      };
    }
    return hooks;
  },
  policies({ flags }) {
    const ignore = [];
    if (flags["qol.ignoreTorches"] === true) ignore.push({ tval: "light", kindNameContains: "Torch", ignore: true });
    if (flags["qol.ignoreLanterns"] === true) ignore.push({ tval: "light", kindNameContains: "Lantern", ignore: true });
    return {
      ...flags["qol.pauseObjectFeeling"] === true ? { messagePauseAfter: ["You feel that "] } : {},
      /*
       * "Auto-dig on walk" (qol.autoDig), ported from neostryder's Angband fork
       * (do_cmd_movement_tunnel_test / the move_player change): walking into
       * known diggable terrain you can actually dig begins one tunnel attempt
       * instead of faithful 4.2.6's no-energy bump. Source-fork behaviour, kept
       * exactly: dig, do NOT step onto the grid, and spend a full move whether
       * the attempt succeeded or not. The host runs the game's own tunnel
       * command for it, so the roll, messages and payouts are the real ones, and
       * it declines before drawing from the random stream when the dig is not
       * possible, which is what makes the mod safe to enable mid-character.
       */
      ...flags["qol.autoDig"] === true ? { walkBlockedByDiggable: { kind: "walk-blocked-by-diggable", attempt: "tunnel", energy: "move", step: false } } : {},
      /*
       * "Keep reading a pref file past a mistake" (qol.forgivingPrefFiles).
       *
       * Angband 4.2.6 stops dead at the first line of a pref file it cannot
       * parse: process_pref_file_named (ui-prefs.c L1225-1231) prints one error
       * and `break`s out of the read loop, so one typo on line 3 of a 900-line
       * graphics pack silently costs you lines 4 to 900. The game reproduces
       * that, because it reproduces 4.2.6. This applies the whole file and only
       * limits what you are TOLD. The last mod to declare a pref policy stands,
       * which is what the mod manager's row already promises the player.
       */
      ...flags["qol.forgivingPrefFiles"] === true ? { prefErrors: { kind: "pref-errors", continueAfterError: true, reportLimit: PREF_ERROR_REPORT_LIMIT } } : {},
      /* "Quality ignore: always ignore torches / lanterns" (qol.ignoreTorches, qol.ignoreLanterns, #267). A torch or lantern artifact, or one inscribed !k or !*, is exempt: the host grants those exemptions to every ignore rule. */
      ...ignore.length > 0 ? { ignore } : {},
      /* "Misc. niceties" (qol.miscNiceties): an ellipsis for a cut-off store name, the selected item's description on the message line, and a colour key on the monster list. The reworded upstream message is the other half, below. The gamedata half ships as this mod's content files, filed under the qol-misc-niceties section. */
      ...flags["qol.miscNiceties"] === true ? {
        displayOptions: {
          kind: "display-options",
          storeItemNameEllipsis: true,
          storeSelectionDescription: true,
          monsterListColorKey: true
        },
        messageText: UPSTREAM_MESSAGE_RULES
      } : {},
      /* "Purge queued input" (qol.purgeQueuedInput): F2, when nothing else owns it, sends Escape for you. Only a fresh press purges; a key held down does not repeat it. */
      ...flags["qol.purgeQueuedInput"] === true ? {
        purgeInput: {
          kind: "purge-input",
          trigger: "F2",
          modifiers: [],
          freshOnly: true,
          escapeCount: PURGE_ESCAPE_COUNT
        }
      } : {}
    };
  },
  /*
   * "No lava in town" (qol.noTownLava). API 2 has no table for a finished
   * level, so this is the game's own levelGenerated member, and only while
   * the switch is on. town-lava.ts does the pass. It draws nothing.
   */
  engineHooks({ flags, engine }) {
    if (flags["qol.noTownLava"] !== true) return void 0;
    return {
      levelGenerated: (gen) => clearTownLava(gen, engine.core)
    };
  },
  /*
   * The Game-menu row that picks the cloud-backup folder. The host omits
   * `backupFolder` when it cannot present a picker, so on such a host the row
   * reports that and does nothing; a cancelled pick resolves null and a
   * rejected one is contained, so the Game menu closes normally either way.
   */
  actions: [
    {
      menu: "core:game-menu",
      action: "choose-backup-folder",
      label: "Choose cloud-backup folder...",
      async run(mod2) {
        const backupFolder = mod2.backupFolder;
        if (!backupFolder) {
          mod2.meta.log("this host cannot choose a backup folder");
          return;
        }
        try {
          const picked = await backupFolder.choose();
          if (!picked.ok || picked.value === null) return;
          const name = picked.value;
          const found = await backupFolder.list();
          const identified = found.ok ? found.value.filter((f) => f.lineage !== void 0).length : 0;
          mod2.meta.log(
            identified > 0 ? `Using backup folder "${name}" (${String(identified)} character${identified === 1 ? "" : "s"} already there).` : `Using backup folder "${name}".`
          );
        } catch {
        }
      }
    }
  ],
  /*
   * "Remember my settings", the APPLY half, and everything else that needs the
   * game to be running.
   *
   * `start` rather than a hook because it runs ONCE with the game already
   * built, which is exactly the moment a new character's option store exists
   * and nothing has read it yet.
   *
   * ONLY FOR A NEW CHARACTER. A loaded save carries its own options and they are
   * that character's - a player who set a save up one way must not have it
   * rewritten because they changed something on a different character last
   * week. `meta.newCharacter` is the host's answer to that question and cannot
   * be derived here: turn 0 is not it (the game autosaves immediately after
   * birth), and neither is an empty save bag (a mod enabled mid-game has one
   * too).
   */
  async start(mod2) {
    live2 = mod2;
    const { flags, log } = mod2.meta;
    if (flags["qol.contextHelp"] === true) installContextHelp(mod2);
    const backupFolder = mod2.backupFolder;
    if (backupFolder) {
      await backupFolder.onSave((file) => void backupFolder.write(file.name, file.text));
    }
    if (flags["qol.gearComparison"] === true) {
      const manager = new GearComparisonManager(mod2);
      comparison = manager;
      for (const result of [
        await mod2.ui.gameMenu.register("compare-gear", "Compare gear...", () => manager.open()),
        await mod2.ui.commands.register("qol:compare-gear", "compare gear", () => manager.open())
      ]) {
        if (!result.ok) log(result.message);
      }
    }
    if (flags["qol.loadouts"] === true) {
      const manager = new LoadoutManager(mod2);
      loadouts = manager;
      for (const result of [
        await mod2.ui.gameMenu.register("loadouts", "Loadouts...", () => manager.open()),
        await mod2.ui.commands.register("qol:loadouts", "manage loadouts", () => manager.open()),
        await mod2.ui.commands.register("qol:cancel-loadout", "cancel loadout swap", () => manager.disturb())
      ]) {
        if (!result.ok) log(result.message);
      }
    }
    if (flags["qol.accessibilityMacroWizard"] === true) startMacroWizard(mod2);
    if (flags["qol.accessibilityRepeatShortcuts"] === true) await startRepeatShortcuts(mod2);
    if (flags["qol.rememberSettings"] !== true || !mod2.meta.newCharacter) return;
    const stored = await mod2.store.prefs.get();
    if (!stored.ok || stored.value === null || typeof stored.value !== "object") return;
    const remembered = readRememberedSettings(stored.value);
    if (!remembered) {
      log(`stored settings are version ${String(stored.value.v)}; ignoring them`);
      return;
    }
    const options = liveOptions(mod2);
    if (!options) {
      log("remembered settings cannot be restored here: this mod has no access to the game's options (gap QOL-1)");
      return;
    }
    const applied = applyRemembered(options, remembered, flags["qol.rememberCheats"] === true);
    log(`restored ${String(applied)} remembered option(s) onto the new character`);
  },
  stop() {
    live2 = null;
    loadouts?.stop();
    loadouts = null;
    comparison?.stop();
    comparison = null;
    stopMacroWizard();
    stopRepeatShortcuts();
  },
  /** Stored preferences from before the host versioned them: the 1.0 options shape or the `{ v: 2 }` envelope. */
  prefs: {
    version: PREFS_VERSION,
    migrate: (value, fromVersion) => migratePreferences(value, fromVersion)
  }
};
export {
  plugin_default as default
};
