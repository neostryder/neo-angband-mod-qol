import type { ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";
import type { QolAdapter } from "./core-adapter";

export interface QolApi2Adapter {
  readonly meta: QolAdapter["meta"];
  readonly store: {
    readonly prefs: ModApi2["store"]["prefs"];
  };
  readonly ui: {
    readonly keys: Pick<ModApi2["ui"]["keys"], "bind">;
  };
}

export function createAdapter(mod: ModApi2): QolApi2Adapter {
  return {
    meta: {
      flags: mod.meta.flags,
      get newCharacter() {
        return mod.meta.newCharacter;
      },
      log: (message) => mod.meta.log(message),
    },
    store: {
      prefs: {
        get: () => mod.store.prefs.get(),
        set: (value) => mod.store.prefs.set(value),
      },
    },
    ui: {
      keys: {
        bind: (trigger, action) => mod.ui.keys.bind(trigger, action),
      },
    },
  };
}
