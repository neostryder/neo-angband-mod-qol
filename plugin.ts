/**
 * The `qol` mod's behaviour, as the mod's OWN code.
 *
 * Nothing in this file is compiled into core. Delete this folder and the game
 * loses auto-dig entirely - there is no `qol.autoDig` string, and no dig-on-walk
 * branch, anywhere in packages/core. That is the whole point of the mod being a
 * mod: making something a mod means excluding it from the core game (2026-07-29).
 *
 * ------------------------------------------------------------------
 * ENTRY POINT CONTRACT - mod API 2
 * ------------------------------------------------------------------
 *
 * The default export is an Api2ModDefinition. This file imports the SDK for
 * TYPES ONLY: a module fetched from a folder cannot resolve a bare specifier,
 * and a bundled copy of the SDK would only add a second copy of its module
 * state.
 *
 * THE MOD READS ITS OWN FLAGS. `hooks` and `policies` are handed this mod's
 * resolved rule flags, and a switch that is off contributes no declaration and
 * no hook. A patch the player turned off is not merely inert, it is absent, and
 * the game takes its faithful path. A disabled mod is never called at all, so
 * returning nothing here means "enabled, but every patch off".
 *
 * Most of what this mod does is DECLARED rather than coded: auto-dig, the pref
 * file policy, light ignoring, the display niceties, the purge key and the one
 * reworded message are policy tables the game applies itself. What stays code
 * is what needs the player or storage: the two shortcut cards (host panels),
 * the backup folder, and remembering and restoring settings.
 */

import type {
  Api2HookContext,
  Api2Hooks,
  Api2IgnorePolicyEntry,
  Api2ModDefinition,
  Api2Policies,
  JsonValue,
  ModApi2,
} from "@rpgm-tools/neo-angband-mod-sdk";
import { migratePreferences, PREFS_VERSION, readRememberedSettings, withRememberedSettings } from "./preferences";
import { applyRemembered, rememberedFrom, type OptionStoreLike } from "./remember";
import { offerAbilityMacro, startMacroWizard, stopMacroWizard } from "./macro-wizard";
import { startRepeatShortcuts, stopRepeatShortcuts } from "./repeat-shortcuts";
import { UPSTREAM_MESSAGE_RULES } from "./wording";

/**
 * How many parse errors one pref file may report before the rest go unmentioned.
 *
 * TWENTY, which is the number core itself used to carry as `PARSE_ERROR_LIMIT`
 * before #272 established it had no counterpart in Angband 4.2.6 and moved it
 * here. Kept at the familiar value rather than picked afresh: a player who had
 * a mangled pref file under the old engine sees the same message run.
 *
 * It is a REPORT cap only. The game keeps applying the file either way, which is
 * the half of the old behaviour that was actually worth having - the old cap
 * threw away everything below the twentieth error, and nobody wanted that.
 */
const PREF_ERROR_REPORT_LIMIT = 20;

/** How many Escapes one purge sends: enough to back out of a few stacked menus or prompts. */
const PURGE_ESCAPE_COUNT = 3;

/** The live API once the game is ready; the hooks below are built before it exists. */
let live: ModApi2 | null = null;

/**
 * The option store of the live game, for restoring remembered settings. This is
 * the one place the mod reads the engine domain (first-party tier); a mod
 * without it cannot restore, and says so (gap QOL-1).
 */
function liveOptions(mod: ModApi2): OptionStoreLike | undefined {
  const state = mod.engine?.state as { options?: OptionStoreLike } | undefined;
  return state?.options;
}

export default {
  api: ">=2.0.0 <3.0.0",

  hooks({ flags }: Api2HookContext): Api2Hooks {
    const hooks: Api2Hooks = {};

    if (flags["qol.accessibilityMacroWizard"] === true) hooks.abilityGained = offerAbilityMacro;

    /*
     * "Remember my settings" (qol.rememberSettings), the CAPTURE half.
     *
     * Angband keeps a character's options in that character's save, and nowhere
     * else - so a player who sets up the game the way they like it does it again
     * on the next character, and the one after that. Upstream's answer is the
     * pref file ('s' / 'r' in the options menu), which is a file the player has
     * to know exists and remember to write. This is the same idea with nobody
     * having to be told.
     *
     * The host tells the mod when the '=' menu closes having changed something.
     * All this end does is write it down; nothing is applied here, because the
     * character in front of the player has just told the game what they want and
     * overwriting that would be absurd.
     */
    if (flags["qol.rememberSettings"] === true) {
      const cheats = flags["qol.rememberCheats"] === true;
      hooks.optionsChanged = (options) => {
        const mod = live;
        if (!mod) return;
        const remembered = rememberedFrom(options, cheats);
        void mod.store.prefs
          .get()
          .then((stored) =>
            mod.store.prefs.set(withRememberedSettings(stored.ok ? stored.value : null, remembered) as unknown as JsonValue),
          );
      };
    }

    return hooks;
  },

  policies({ flags }: Api2HookContext): Api2Policies | undefined {
    const ignore: Api2IgnorePolicyEntry[] = [];
    if (flags["qol.ignoreTorches"] === true) ignore.push({ tval: "light", kindNameContains: "Torch", ignore: true });
    if (flags["qol.ignoreLanterns"] === true) ignore.push({ tval: "light", kindNameContains: "Lantern", ignore: true });

    /*
     * Each table is added only when its switch is on. The host applies the
     * tables itself, so none of them calls back into this mod.
     */
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
      ...(flags["qol.autoDig"] === true
        ? { walkBlockedByDiggable: { kind: "walk-blocked-by-diggable", attempt: "tunnel", energy: "move", step: false } as const }
        : {}),
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
      ...(flags["qol.forgivingPrefFiles"] === true
        ? { prefErrors: { kind: "pref-errors", continueAfterError: true, reportLimit: PREF_ERROR_REPORT_LIMIT } as const }
        : {}),
      /* "Quality ignore: always ignore torches / lanterns" (qol.ignoreTorches, qol.ignoreLanterns, #267). A torch or lantern artifact, or one inscribed !k or !*, is exempt: the host grants those exemptions to every ignore rule. */
      ...(ignore.length > 0 ? { ignore } : {}),
      /* "Misc. niceties" (qol.miscNiceties): an ellipsis for a cut-off store name, the selected item's description on the message line, and a colour key on the monster list. The reworded upstream message is the other half, below. The gamedata half ships as this mod's content files, filed under the qol-misc-niceties section. */
      ...(flags["qol.miscNiceties"] === true
        ? {
            displayOptions: {
              kind: "display-options",
              storeItemNameEllipsis: true,
              storeSelectionDescription: true,
              monsterListColorKey: true,
            } as const,
            messageText: UPSTREAM_MESSAGE_RULES,
          }
        : {}),
      /* "Purge queued input" (qol.purgeQueuedInput): F2, when nothing else owns it, sends Escape for you. Only a fresh press purges; a key held down does not repeat it. */
      ...(flags["qol.purgeQueuedInput"] === true
        ? {
            purgeInput: {
              kind: "purge-input",
              trigger: "F2",
              modifiers: [],
              freshOnly: true,
              escapeCount: PURGE_ESCAPE_COUNT,
            } as const,
          }
        : {}),
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
      async run(mod: ModApi2): Promise<void> {
        const backupFolder = mod.backupFolder;
        if (!backupFolder) {
          mod.meta.log("this host cannot choose a backup folder");
          return;
        }
        try {
          const picked = await backupFolder.choose();
          if (!picked.ok || picked.value === null) return; // refused or cancelled: nothing to report
          const name = picked.value;
          /*
           * neo-angband#24: say how many characters are already sitting in the
           * folder just picked - useful confirmation on a second machine's first
           * setup, where the folder is an existing Dropbox full of characters
           * rather than an empty one.
           */
          const found = await backupFolder.list();
          const identified = found.ok ? found.value.filter((f) => f.lineage !== undefined).length : 0;
          mod.meta.log(
            identified > 0
              ? `Using backup folder "${name}" (${String(identified)} character${identified === 1 ? "" : "s"} already there).`
              : `Using backup folder "${name}".`,
          );
        } catch {
          /* A rejected picker ends this one menu action cleanly. */
        }
      },
    },
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
  async start(mod: ModApi2): Promise<void> {
    live = mod;
    const { flags, log } = mod.meta;

    /* Every save the game writes is copied to the backup folder, when one is set. */
    const backupFolder = mod.backupFolder;
    if (backupFolder) {
      await backupFolder.onSave((file) => void backupFolder.write(file.name, file.text));
    }

    if (flags["qol.accessibilityMacroWizard"] === true) startMacroWizard(mod);
    if (flags["qol.accessibilityRepeatShortcuts"] === true) await startRepeatShortcuts(mod);

    if (flags["qol.rememberSettings"] !== true || !mod.meta.newCharacter) return;
    const stored = await mod.store.prefs.get();
    if (!stored.ok || stored.value === null || typeof stored.value !== "object") return;

    /* An unknown shape is IGNORED, not guessed at. The field exists so that the day there is a newer one, the older does not get read as if it were. */
    const remembered = readRememberedSettings(stored.value);
    if (!remembered) {
      log(`stored settings are version ${String((stored.value as { v?: unknown }).v)}; ignoring them`);
      return;
    }
    const options = liveOptions(mod);
    if (!options) {
      log("remembered settings cannot be restored here: this mod has no access to the game's options (gap QOL-1)");
      return;
    }
    const applied = applyRemembered(options, remembered, flags["qol.rememberCheats"] === true);
    log(`restored ${String(applied)} remembered option(s) onto the new character`);
  },

  stop(): void {
    live = null;
    stopMacroWizard();
    stopRepeatShortcuts();
  },

  /** Stored preferences from before the host versioned them: the 1.0 options shape or the `{ v: 2 }` envelope. */
  prefs: {
    version: PREFS_VERSION,
    migrate: (value: JsonValue, fromVersion: number): JsonValue =>
      migratePreferences(value, fromVersion) as unknown as JsonValue,
  },
} satisfies Api2ModDefinition;
