// qol - built from packages/web/mods/qol/plugin.ts by
// packages/web/scripts/build-mod-plugins.mjs in the Neo Angband repository.
// Generated: edit the TypeScript source, not this file.

// packages/web/mods/qol/plugin.ts
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
    return hooks;
  }
};
export {
  plugin_default as default
};
