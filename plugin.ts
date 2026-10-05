/**
 * The `qol` mod's behaviour, as the mod's OWN code.
 *
 * Nothing in this file is compiled into core. Delete this folder and the game
 * loses auto-dig entirely - there is no `qol.autoDig` string, and no dig-on-walk
 * branch, anywhere in packages/core. That is the whole point of the mod being a
 * mod: making something a mod means excluding it from the core game (2026-07-29).
 *
 * ------------------------------------------------------------------
 * ENTRY POINT CONTRACT - one shape, for every mod and every front end
 * ------------------------------------------------------------------
 *
 * A mod that runs code default-exports a ModPlugin (src/mod-plugin.ts):
 *
 *   export default { api: 1, hooks(ctx) { ... } }
 *
 * `ctx.flags` is the host's RESOLVED per-patch choice map: every `rules[].flag`
 * this mod declares in its manifest.json, mapped to the value the player's toggles
 * settled on (manifest `default` unless they changed it). The host calls `hooks`
 * ONCE per enabled mod, in load order, and folds the results with composeModHooks
 * (core/mod/hooks.ts) into the single ModHooks core holds.
 *
 * `ctx.core` is the ENGINE, handed in, and core-adapter.ts is the only module
 * that reads it or any other part of the context. This file imports
 * @rpgm-tools/neo-angband-core for TYPES ONLY, and that is not a style choice.
 * The same source is built to the `plugin.js` that ships in this mod's own
 * repository, and a module fetched from a folder cannot resolve a bare
 * specifier - nor should it, because a bundled copy of core would give the
 * plugin its own registries and singletons while the game ran on another set,
 * which is a failure with no error message anywhere. See src/mod-plugin.ts's
 * header for the full argument.
 *
 * Three rules make the shape work:
 *
 *  1. THE MOD READS ITS OWN FLAGS. Core never sees a flag name. A hook is
 *     installed only if the patch that needs it is on, so a patch the player
 *     switched off is not merely inert - its hook is ABSENT, and core takes the
 *     faithful path with one undefined check.
 *  2. NEVER RETURN A FUNCTION THAT SELF-DISABLES. `walkBlockedByDiggable: () =>
 *     flags.x ? ... : null` would be wrong even though it behaves the same: an
 *     installed hook is a promise to core that something wants that point, and
 *     composeModHooks would let it shadow a later mod's handler.
 *  3. A DISABLED MOD IS NEVER CALLED AT ALL. The host does not invoke this
 *     function for a mod the player has not enabled, so returning `{}` here
 *     means "enabled, but every patch off".
 *
 * The mod uses core's public API - the same API a third-party mod has. It touches
 * no private path and no test hook.
 */

import type { ModHooks } from "@rpgm-tools/neo-angband-core";
import {
  createAdapter,
  type MenuHost,
  type OptionCategories,
  type PluginContext,
} from "./core-adapter";
import {
  readRememberedSettings,
  withRememberedSettings,
  type RememberedSettings,
} from "./preferences";
import {
  installMacroWizard,
  offerAbilityMacro,
  uninstallMacroWizard,
  type AbilityGainedLike,
} from "./macro-wizard";
import { installRepeatShortcuts, uninstallRepeatShortcuts } from "./repeat-shortcuts";
import { installPurgeQueuedInput, uninstallPurgeQueuedInput } from "./purge-queued-input";
import {
  installMiscNiceties,
  uninstallMiscNiceties,
  upstreamWordingFix,
} from "./misc-niceties";

/**
 * The option snapshot core hands to `optionsChanged`, structurally.
 */
interface OptionSnapshot {
  values: Record<string, boolean>;
  hitpointWarn: number;
  delayFactor: number;
  lazymoveDelay: number;
}

/**
 * Whether this mod may remember `name`.
 *
 * THREE EXCLUSIONS, and each is a decision rather than a limitation:
 *
 *  - BIRTH options are locked into a character at creation and `set()` refuses
 *    them afterwards, so remembering one here could never apply it. They already
 *    carry forward by a different route: the game seeds the '=' birth editor
 *    with the previous character's choices, which is where a birth option can
 *    actually still be changed.
 *  - CHEAT options are excluded unless the player asks for them, because turning
 *    one on forces its `score_` twin and permanently bars that character from
 *    the score list. Inheriting that silently is the one case where remembering
 *    a setting does damage.
 *  - SCORE options are excluded on exactly the same terms and by the same
 *    toggle: they are the record of having cheated, so carrying one onto a fresh
 *    character would mark a character that never did.
 */
/**
 * How many parse errors one pref file may report before the rest go unmentioned.
 *
 * TWENTY, which is the number core itself used to carry as `PARSE_ERROR_LIMIT`
 * before #272 established it had no counterpart in Angband 4.2.6 and moved it
 * here. Kept at the familiar value rather than picked afresh: a player who had
 * a mangled pref file under the old engine sees the same message run.
 *
 * It is a REPORT cap only. Core keeps applying the file either way, which is the
 * half of the old behaviour that was actually worth having - the old cap threw
 * away everything below the twentieth error, and nobody wanted that.
 */
const PREF_ERROR_REPORT_LIMIT = 20;

function mayRemember(opts: OptionCategories, name: string, cheats: boolean): boolean {
  if (opts.isBirth(name)) return false;
  if (opts.isCheat(name) || opts.isScore(name)) return cheats;
  return true;
}

export default {
  api: 1,

  hooks(ctx: PluginContext): ModHooks {
    const adapter = createAdapter(ctx);
    const { flags } = adapter.meta;
    const { engine } = adapter;
    const hooks: ModHooks = {};

    adapter.host.backupFolder?.onSave((file) => void adapter.host.backupFolder?.write(file.name, file.text));

    /*
     * "Auto-dig on walk" (qol.autoDig), ported from neostryder's Angband fork
     * (do_cmd_movement_tunnel_test / the move_player change): walking into known
     * diggable terrain you can actually dig begins one tunnel attempt instead of
     * faithful 4.2.6's no-energy bump.
     *
     * Both core primitives this needs are public, and using them rather than
     * reimplementing them is deliberate - a reimplemented dig roll would drift
     * from the tunnel command's:
     *
     *  - movementTunnelTest: known, not permanent rock, impassable, diggable, and
     *    diggable with a positive chance for the current weapon / best pack digger.
     *    RNG-FREE, which is what lets this decline for free.
     *  - tunnelAux: ONE do_cmd_tunnel_aux attempt with the real roll, messages and
     *    payouts (rubble finds, treasure). It DRAWS RNG, so it is reached only
     *    after the decision to handle the walk is final.
     *
     * Declining returns null BEFORE any draw, so a walk this mod does not handle
     * leaves the stream exactly where faithful core would - the hook's documented
     * contract, and what makes the mod safe to enable mid-character.
     *
     * Source-fork behaviour, kept exactly: dig, do NOT step onto the grid, and
     * spend a full move (energy_use = move_energy) whether the attempt succeeded
     * or not.
     */
    if (flags["qol.autoDig"] === true) {
      hooks.walkBlockedByDiggable = (state, grid, deps): number | null => {
        if (!engine.movementTunnelTest(state, grid)) return null;
        engine.tunnelAux(state, grid, deps);
        return engine.moveEnergy(state);
      };
    }

    /*
     * "Keep reading a pref file past a mistake" (qol.forgivingPrefFiles).
     *
     * Angband 4.2.6 stops dead at the first line of a pref file it cannot parse:
     * process_pref_file_named (ui-prefs.c L1225-1231) prints one error and
     * `break`s out of the read loop, so one typo on line 3 of a 900-line
     * graphics pack silently costs you lines 4 to 900. Core reproduces that,
     * because core reproduces 4.2.6.
     *
     * Until #272 the port did not: it carried a 20-error cap of its own, with an
     * environment override, which is a convenience Angband never shipped. A
     * convenience belongs in a mod, so here it is - and it is BETTER than the
     * thing it replaces, because the old cap still
     * threw the rest of the file away once it was reached. This applies the
     * whole file and only limits what you are TOLD.
     *
     * NOT A ModHooks MEMBER, and that is core's shape rather than this mod's
     * choice. The three readers this governs - the '=' menu's "Load a user pref
     * file", a mod's own `prefs` resource, and the graphics pack loader - have
     * no GameState in scope, and two of them run before there is one, so there
     * is no hooks object for them to consult. Core exposes a module-level
     * policy instead (setPrefErrorPolicy), which is the same shape as its sound
     * and rune registries.
     *
     * INSTALLED FROM hooks() rather than register(), because hooks() is the
     * earliest moment a mod runs - the host composes every enabled mod's hooks
     * before startGame - and the graphics pack is read during boot. register()
     * would be too late for it. Load order does the rest: the host calls hooks()
     * in load order, so the LAST mod to set a policy is the one that stands,
     * which is what the mod manager's row already promises the player.
     *
     * TURNING THIS OFF STILL TAKES IT AWAY. A module-level value in core would
     * outlive a mod being switched off inside one process - but switching a mod
     * off does not take effect inside one process. The manager prompts to save
     * and RELOADS, and after the reload this function is never called, so
     * nothing installs a policy and core is back on 4.2.6's.
     */
    if (flags["qol.forgivingPrefFiles"] === true) {
      const setPolicy = engine.setPrefErrorPolicy;
      if (typeof setPolicy !== "function") {
        /* DELIBERATE, not a should-never-happen. `engine` stays ">=0.18.0"
         * because the other three toggles work perfectly on 0.18.0, and
         * raising the range to gate this one would refuse the whole mod and
         * cost a player auto-dig and remembered settings to buy a pref-file
         * convenience. So this pairing is allowed and this toggle degrades.
         *
         * It SAYS SO rather than going quietly inert, which is the failure
         * this project keeps finding: a switch that is on in the manager and
         * does nothing in the game is worse than one that refuses. */
        adapter.meta.log("this game is too old to keep reading a pref file past a mistake");
      } else {
        setPolicy({
          continueAfterError: true,
          reportLimit: PREF_ERROR_REPORT_LIMIT,
        });
      }
    }

    if (flags["qol.accessibilityMacroWizard"] === true) {
      (hooks as ModHooks & { abilityGained?: (ability: AbilityGainedLike) => void }).abilityGained =
        offerAbilityMacro;
    }

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
     * The host fires optionsChanged when the '=' menu closes having changed
     * something. All this end does is write it down; nothing is applied here,
     * because the character in front of the player has just told the game what
     * they want and overwriting that would be absurd.
     */
    if (flags["qol.rememberSettings"] === true) {
      const prefs = adapter.store.prefs;
      if (!prefs) {
        /* The engine range in manifest.json should have refused this pairing.
         * If it somehow did not, say so - a silently inert mod is the failure
         * this project keeps finding. */
        adapter.meta.log("this game is too old to remember settings (no ctx.prefs)");
      } else {
        /*
         * A THROWAWAY OptionState, used only to CLASSIFY names.
         *
         * `ctx.state` is not available here and never will be: the host builds
         * every mod's hooks BEFORE it starts the game, because the composed
         * ModHooks is an argument to startGame. So this half cannot read the
         * live option store - and does not need to. All it needs to know is
         * which names are birth / cheat / score options, which is a property of
         * the option TABLE, identical in every instance.
         *
         * Built from the engine rather than from a list kept here, so a name that
         * changes category in a future engine changes category for this mod on
         * the same day.
         */
        const classifier = engine.newOptionState();
        const cheats = flags["qol.rememberCheats"] === true;
        hooks.optionsChanged = (snapshot: OptionSnapshot): void => {
          const values: Record<string, boolean> = {};
          for (const [name, value] of Object.entries(snapshot.values)) {
            if (mayRemember(classifier, name, cheats)) values[name] = value;
          }
          const remembered: RememberedSettings = {
            v: 1,
            values,
            hitpointWarn: snapshot.hitpointWarn,
            delayFactor: snapshot.delayFactor,
            lazymoveDelay: snapshot.lazymoveDelay,
          };
          prefs.set(withRememberedSettings(prefs.get(), remembered));
        };
      }
    }

    /*
     * "Misc. niceties" (qol.miscNiceties) also rewords a few of upstream's own
     * messages for clarity at the host's message sink. The gamedata half of the
     * same switch ships as this mod's content files (activation.json, class.json
     * and the rest), filed under the qol-misc-niceties section.
     */
    if (flags["qol.miscNiceties"] === true) hooks.messageText = upstreamWordingFix;

    return hooks;
  },

  /*
   * "Remember my settings", the APPLY half.
   *
   * register() rather than hooks(), for one reason: this runs ONCE at boot with
   * the game already built, which is exactly the moment a new character's option
   * store exists and nothing has read it yet. A hook would have to be called by
   * something, and there is nothing in a turn that means "the character just
   * started".
   *
   * ONLY FOR A NEW CHARACTER. A loaded save carries its own options and they are
   * that character's - a player who set a save up one way must not have it
   * rewritten because they changed something on a different character last week.
   * `ctx.newCharacter` is the host's answer to that question and cannot be
   * derived here: turn 0 is not it (the game autosaves immediately after birth),
   * and neither is an empty save bag (a mod enabled mid-game has one too).
   *
   */
  register(host: MenuHost, ctx: PluginContext): void {
    const adapter = createAdapter(ctx, host);
    const { flags, log } = adapter.meta;
    const { keys, panels } = adapter.ui;
    installMiscNiceties({ flags, display: adapter.host.display, log });
    adapter.engine.installLightIgnore();
    if (flags["qol.accessibilityMacroWizard"] === true) {
      installMacroWizard({
        ...(panels ? { ui: panels } : {}),
        ...(keys ? { keymaps: keys } : {}),
        log,
      });
    }

    const backupFolder = adapter.host.backupFolder;
    if (backupFolder) {
      /* No unsupported-platform dead row: the host omits backupFolder when it
       * cannot present a picker, so there is nothing useful for a player to
       * select there. A cancelled pick resolves null; a rejected pick is
       * contained by this menu action. */
      adapter.host.addGameMenuAction(
        "choose-backup-folder",
        "Choose cloud-backup folder...",
        async () => {
          try {
            const name = await backupFolder.choose();
            if (name === null) return; // cancelled: nothing to report
            /*
             * neo-angband#24: say how many characters are already sitting in
             * the folder just picked - useful confirmation on a second
             * machine's first setup, where the folder is an existing Dropbox
             * full of characters rather than an empty one. `list?.()` rather
             * than `list()`: an older host's backupFolder has everything else
             * on this shape but not this method.
             */
            const found = (await backupFolder.list?.()) ?? [];
            const identified = found.filter((f) => f.lineage !== undefined).length;
            log(
              identified > 0
                ? `Using backup folder "${name}" (${String(identified)} character${identified === 1 ? "" : "s"} already there).`
                : `Using backup folder "${name}".`,
            );
          } catch {
            /* A rejected picker ends this one menu action cleanly, like a
             * cancelled picker that resolves null. */
          }
        },
      );
    }

    if (flags["qol.accessibilityRepeatShortcuts"] === true) {
      const prefs = adapter.store.prefs;
      installRepeatShortcuts({
        ...(panels ? { ui: panels } : {}),
        ...(keys ? { keymaps: keys } : {}),
        ...(prefs ? { prefs } : {}),
        log,
      });
    }

    if (flags["qol.purgeQueuedInput"] === true) {
      const { display, keyRepeat } = adapter.host;
      installPurgeQueuedInput({
        ...(display ? { display } : {}),
        ...(keys ? { keymaps: keys } : {}),
        ...(keyRepeat ? { keyRepeat } : {}),
        log,
      });
    }

    if (flags["qol.rememberSettings"] !== true) return;
    if (!adapter.meta.newCharacter) return;
    const opts = adapter.engine.startingOptions;
    const stored = adapter.store.prefs?.get();
    if (!opts || !stored || typeof stored !== "object") return;

    const remembered = readRememberedSettings(stored);
    /* An unknown shape is IGNORED, not guessed at. This is the only version
     * there has ever been; the field exists so that the day there is a second
     * one, the first does not get read as if it were. */
    if (!remembered) {
      const version = (stored as { v?: unknown }).v;
      log(`stored settings are version ${String(version)}; ignoring them`);
      return;
    }

    const cheats = flags["qol.rememberCheats"] === true;
    let applied = 0;
    for (const [name, value] of Object.entries(remembered.values ?? {})) {
      /* Filtered on the way IN as well as on the way out. The two toggles can
       * change between the write and the read - a player who remembered their
       * cheat options and then turned that toggle off must not keep inheriting
       * them from what is already stored. */
      if (!mayRemember(opts, name, cheats)) continue;
      /* set() answers false for an option this engine does not have, which is
       * what happens to a stored name after an engine upgrade removes one. Not
       * an error: the option is gone, so there is nothing to restore. */
      if (opts.set(name, value)) applied++;
    }
    opts.setNumbers(remembered);
    log(`restored ${String(applied)} remembered option(s) onto the new character`);
  },


  uninstall(): void {
    uninstallMiscNiceties();
    uninstallMacroWizard();
    uninstallRepeatShortcuts();
    uninstallPurgeQueuedInput();
  },
};
