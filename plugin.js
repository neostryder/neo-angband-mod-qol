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
function liveOptions(mod2) {
  const state = mod2.engine?.state;
  return state?.options;
}
var plugin_default = {
  api: ">=2.0.0 <3.0.0",
  hooks({ flags }) {
    const hooks = {};
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
