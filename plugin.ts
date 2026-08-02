/**
 * The `qol` mod's behaviour, as the mod's OWN code.
 *
 * Nothing in this file is compiled into core. Delete this folder and the game
 * loses auto-dig entirely - there is no `qol.autoDig` string, and no dig-on-walk
 * branch, anywhere in packages/core. That is the whole point of the mod being a
 * mod (neostryder, 2026-07-29: "the whole point of making them mods was to exclude
 * them from the core game").
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
 * `ctx.core` is the ENGINE, handed in. This file imports @rpgm-tools/neo-angband-core for
 * TYPES ONLY, and that is not a style choice. The same source is built to the
 * `plugin.js` that ships in this mod's own repository, and a module fetched from a
 * folder cannot resolve a bare specifier - nor should it, because a bundled copy of
 * core would give the plugin its own registries and singletons while the game ran
 * on another set, which is a failure with no error message anywhere. See
 * src/mod-plugin.ts's header for the full argument.
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

import type { CaveCmdDeps, ModHooks } from "@rpgm-tools/neo-angband-core";

/**
 * The engine, as a type. `typeof import(...)` is type-only syntax, so this pulls
 * in no runtime dependency and the built plugin.js contains no import at all.
 */
type CoreApi = typeof import("@rpgm-tools/neo-angband-core");

/**
 * What this plugin needs from the host's context, structurally.
 *
 * Declared here rather than imported from src/mod-plugin.ts on purpose: this file
 * has to compile in a standalone mod repository that has no copy of the host. A
 * structural subset also states exactly what the mod touches, which is the honest
 * form of "the mod uses no private path".
 */
interface HookCtx {
  readonly flags: Readonly<Record<string, boolean>>;
  readonly core: CoreApi;
  /**
   * This mod's own storage, kept OUTSIDE the character's save - the host's
   * `ctx.prefs`. Optional here because a host older than the one that added it
   * hands over nothing, and a mod that assumed otherwise would throw at boot on
   * a game the manifest's `engine` range should simply have refused. Belt and
   * braces: the range is the gate, this is the seatbelt.
   */
  readonly prefs?: {
    get(): unknown;
    set(value: unknown): void;
  };
  /** Whether this character was created this session rather than loaded. */
  readonly newCharacter?: boolean;
  /** The live game, when there is one. Absent during content composition. */
  readonly state?: {
    options?: OptionStateLike;
  };
  /** Emit a diagnostic line; the host decides where it goes. */
  readonly log?: (msg: string) => void;
}

/**
 * The part of core's OptionState this mod uses, structurally - same reason as
 * HookCtx: the mod names what it touches instead of importing a host type.
 */
interface OptionStateLike {
  get(name: string): boolean;
  set(name: string, value: boolean): boolean;
  isBirth(name: string): boolean;
  isCheat(name: string): boolean;
  isScore(name: string): boolean;
  hitpointWarn: number;
  delayFactor: number;
  lazymoveDelay: number;
}

/** What this mod keeps in ctx.prefs. Versioned, so a later shape can migrate. */
interface RememberedSettings {
  /** The shape of this object, not the mod's version. */
  readonly v: 1;
  /** Option name -> value, for the options this mod is allowed to remember. */
  readonly values: Record<string, boolean>;
  readonly hitpointWarn: number;
  readonly delayFactor: number;
  readonly lazymoveDelay: number;
}

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
function mayRemember(opts: OptionStateLike, name: string, cheats: boolean): boolean {
  if (opts.isBirth(name)) return false;
  if (opts.isCheat(name) || opts.isScore(name)) return cheats;
  return true;
}

export default {
  api: 1,

  hooks(ctx: HookCtx): ModHooks {
    const { flags, core } = ctx;
    const hooks: ModHooks = {};

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
        if (!core.movementTunnelTest(state, grid)) return null;
        /* deps is the live CaveCmdDeps the session built; core types it as unknown
         * so ModHooks does not drag the cave-command types into every consumer. */
        core.tunnelAux(state, grid, deps as CaveCmdDeps);
        return state.z.moveEnergy;
      };
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
      const prefs = ctx.prefs;
      if (!prefs) {
        /* The engine range in manifest.json should have refused this pairing.
         * If it somehow did not, say so - a silently inert mod is the failure
         * this project keeps finding. */
        ctx.log?.("this game is too old to remember settings (no ctx.prefs)");
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
         * Built from ctx.core rather than from a list kept here, so a name that
         * changes category in a future engine changes category for this mod on
         * the same day.
         */
        const classifier = new core.OptionState();
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
          prefs.set(remembered);
        };
      }
    }

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
   * The registry host is untouched. This mod declares no capabilities, so every
   * facade on it would throw - and it needs none of them.
   */
  register(_host: unknown, ctx: HookCtx): void {
    if (ctx.flags["qol.rememberSettings"] !== true) return;
    if (ctx.newCharacter !== true) return;
    const opts = ctx.state?.options;
    const stored = ctx.prefs?.get();
    if (!opts || !stored || typeof stored !== "object") return;

    const remembered = stored as Partial<RememberedSettings>;
    /* An unknown shape is IGNORED, not guessed at. This is the only version
     * there has ever been; the field exists so that the day there is a second
     * one, the first does not get read as if it were. */
    if (remembered.v !== 1) {
      ctx.log?.(`stored settings are version ${String(remembered.v)}; ignoring them`);
      return;
    }

    const cheats = ctx.flags["qol.rememberCheats"] === true;
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
    if (typeof remembered.hitpointWarn === "number") {
      opts.hitpointWarn = remembered.hitpointWarn;
    }
    if (typeof remembered.delayFactor === "number") {
      opts.delayFactor = remembered.delayFactor;
    }
    if (typeof remembered.lazymoveDelay === "number") {
      opts.lazymoveDelay = remembered.lazymoveDelay;
    }
    ctx.log?.(`restored ${String(applied)} remembered option(s) onto the new character`);
  },
};
