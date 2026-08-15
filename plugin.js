// qol - generated from plugin.ts by neo-angband-mod-build
// (@rpgm-tools/neo-angband-mod-sdk). Edit the TypeScript source, not this file.

// plugin.ts
var PREF_ERROR_REPORT_LIMIT = 20;
function mayRemember(opts, name, cheats) {
  if (opts.isBirth(name)) return false;
  if (opts.isCheat(name) || opts.isScore(name)) return cheats;
  return true;
}
var plugin_default = {
  api: 1,
  hooks(ctx) {
    const { flags, core } = ctx;
    const hooks = {};
    if (flags["qol.autoDig"] === true) {
      hooks.walkBlockedByDiggable = (state, grid, deps) => {
        if (!core.movementTunnelTest(state, grid)) return null;
        core.tunnelAux(state, grid, deps);
        return state.z.moveEnergy;
      };
    }
    if (flags["qol.forgivingPrefFiles"] === true) {
      const setPolicy = core.setPrefErrorPolicy;
      if (typeof setPolicy !== "function") {
        ctx.log?.("this game is too old to keep reading a pref file past a mistake");
      } else {
        setPolicy({
          continueAfterError: true,
          reportLimit: PREF_ERROR_REPORT_LIMIT
        });
      }
    }
    if (flags["qol.rememberSettings"] === true) {
      const prefs = ctx.prefs;
      if (!prefs) {
        ctx.log?.("this game is too old to remember settings (no ctx.prefs)");
      } else {
        const classifier = new core.OptionState();
        const cheats = flags["qol.rememberCheats"] === true;
        hooks.optionsChanged = (snapshot) => {
          const values = {};
          for (const [name, value] of Object.entries(snapshot.values)) {
            if (mayRemember(classifier, name, cheats)) values[name] = value;
          }
          const remembered = {
            v: 1,
            values,
            hitpointWarn: snapshot.hitpointWarn,
            delayFactor: snapshot.delayFactor,
            lazymoveDelay: snapshot.lazymoveDelay
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
  register(_host, ctx) {
    if (ctx.flags["qol.rememberSettings"] !== true) return;
    if (ctx.newCharacter !== true) return;
    const opts = ctx.state?.options;
    const stored = ctx.prefs?.get();
    if (!opts || !stored || typeof stored !== "object") return;
    const remembered = stored;
    if (remembered.v !== 1) {
      ctx.log?.(`stored settings are version ${String(remembered.v)}; ignoring them`);
      return;
    }
    const cheats = ctx.flags["qol.rememberCheats"] === true;
    let applied = 0;
    for (const [name, value] of Object.entries(remembered.values ?? {})) {
      if (!mayRemember(opts, name, cheats)) continue;
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
  }
};
export {
  plugin_default as default
};
