// qol - generated from plugin.ts by neo-angband-mod-build
// (@rpgm-tools/neo-angband-mod-sdk). Edit the TypeScript source, not this file.

// plugin.ts
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
