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
      await this.report("Loadouts are unavailable for this character.");
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
        { type: "text", text: "Save worn gear, including empty slots. Quiver contents stay under the game's control. Pack overflow can drop items during a swap." },
        { type: "input", label: "Loadout name", action: "name", value: name },
        { type: "button", label: "Save worn gear", action: "save" },
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
            await refresh("The loadouts could not be read.");
            return;
          }
          const current = readLoadouts(bag.value);
          let next;
          if (action === "save") {
            const clean = name.trim();
            if (!clean || clean.length > 64) {
              await refresh("Use a name from 1 to 64 characters.");
              return;
            }
            const now = await this.world();
            if (!now) return;
            if (current.length >= LIMIT && !current.some((set) => set.name === clean)) {
              await refresh("Delete a loadout before saving another. The limit is 20.");
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
          await refresh(saved.ok ? "The loadouts were saved." : "The loadouts could not be saved.");
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
          { type: "text", text: "Really " + (key === "w" ? "wear " : "take off ") + (item.name ?? item.label) + "?" },
          { type: "button", label: "Yes", action: "yes" },
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
        notes.push("The saved body slots are unavailable.");
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
          notes.push("The swap stopped because the game is waiting for other input.");
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
              notes.push(piece.name + ": not carried.");
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
                const simulation = await this.mod.view.simulateLoadout({ wield: [{ from: "gear", handle: found.handle }] });
                if (!simulation.ok || !simulation.value.placements.some((p) => p.slot === slot) && world.equipmentSlots?.[slot]?.type !== "RING") {
                  notes.push(piece.name + ": the game cannot place this item in the saved slot.");
                  blocked.add(slot);
                  continue;
                }
                if (world.equipmentSlots?.[slot]?.type === "RING" && !simulation.value.placements.some((p) => p.slot === slot) && simulation.value.placements.some((p) => p.displaced === null)) {
                  notes.push(piece.name + ": the game cannot target this empty ring slot.");
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
          notes.push("The swap stopped because the game changed during confirmation.");
          break;
        }
        if (fresh.value.phase !== "play" || fresh.value.prompt || fresh.value.messagePending) {
          notes.push("The swap stopped because the game is waiting for other input.");
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
          notes.push(subject.label + ": the game did not move this item.");
          blocked.add(target);
        }
      }
      const last = await this.world();
      if (last) {
        const lost = carried(first).filter((item) => !carried(last).some((now) => now.handle === item.handle));
        for (const item of lost) notes.push(item.label + ": no longer carried after the swap.");
        const complete = set.slots.every((piece, slot) => piece ? !!last.equipment[slot] && last.equipment[slot]?.handle === locatePiece(last, piece, this.identities)?.handle : !last.equipment[slot]);
        notes.unshift(complete ? "The loadout is restored." : "The loadout is incomplete.");
      }
    } catch {
      notes.push("The swap stopped because a game API call failed.");
    } finally {
      this.running = false;
      await this.report(set.name + ": " + notes.join(" "));
    }
  }
};

// wording.ts
var UPSTREAM_MESSAGE_WORDING = {
  /* cmd-cave.c, ordering an immobile monster to move (command monster). */
  "The monster can not move.": "The monster cannot move."
};
var UPSTREAM_MESSAGE_RULES = Object.entries(UPSTREAM_MESSAGE_WORDING).map(([find, replace]) => ({ find, replace }));

// plugin.ts
var PREF_ERROR_REPORT_LIMIT = 20;
var PURGE_ESCAPE_COUNT = 3;
var live2 = null;
var loadouts = null;
function liveOptions(mod2) {
  const state = mod2.engine?.state;
  return state?.options;
}
var plugin_default = {
  api: ">=2.0.0 <3.0.0",
  hooks({ flags }) {
    const hooks = {};
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
    const backupFolder = mod2.backupFolder;
    if (backupFolder) {
      await backupFolder.onSave((file) => void backupFolder.write(file.name, file.text));
    }
    if (flags["qol.loadouts"] === true) {
      const manager = new LoadoutManager(mod2);
      loadouts = manager;
      for (const result of [
        await mod2.ui.gameMenu.register("loadouts", "Loadouts...", () => manager.open()),
        await mod2.ui.commands.register("loadouts", "manage loadouts", () => manager.open()),
        await mod2.ui.commands.register("cancel-loadout", "cancel loadout swap", () => manager.disturb())
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
