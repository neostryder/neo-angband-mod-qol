import { describe, expect, it, vi } from "vitest";
import * as neoCore from "@rpgm-tools/neo-angband-core";
import {
  api2NotGranted,
  api2Ok,
  api2Refused,
  api2Unavailable,
  type Api2Failure,
  type JsonValue,
  type ModApi2,
} from "@rpgm-tools/neo-angband-mod-sdk";
import { createAdapter as createApi1Adapter } from "./core-adapter";
import { createAdapter } from "./core-adapter-api2";

function adapters(initial: JsonValue | null = null, newCharacter?: boolean) {
  const flags = { "qol.autoDig": true, "qol.rememberCheats": false };
  const api1Log = vi.fn();
  const api2Log = vi.fn();
  let api1Prefs: JsonValue | null = structuredClone(initial);
  let api2Prefs: JsonValue | null = structuredClone(initial);
  const api1Bindings = new Map([["F2", "existing"]]);
  const api2Bindings = new Map(api1Bindings);
  const unused = async () => api2Unavailable("unused domain");
  const mod: ModApi2 = {
    meta: {
      id: "qol", api: "2.0.0", engine: "test", tier: "first-party", flags,
      newCharacter: newCharacter === true,
      granted: () => true, log: api2Log,
      settings: unused, setSetting: unused, mods: unused,
    },
    store: {
      prefs: {
        get: async () => api2Ok(structuredClone(api2Prefs)),
        set: async (value) => {
          api2Prefs = structuredClone(value);
          return api2Ok(null);
        },
      },
      character: { get: unused, set: unused },
    },
    ui: {
      mount: unused, patch: unused,
      keys: {
        bind: async (trigger, action) => {
          if (api2Bindings.has(trigger)) return api2Refused("trigger-taken", "key is taken");
          api2Bindings.set(trigger, action);
          return api2Ok(null);
        },
        list: unused, remove: unused,
      },
    },
    view: { world: unused, player: unused, monsters: unused, level: unused, input: unused, isCurrent: unused },
    act: {
      submit: unused, answer: unused,
      controller: { owns: unused, setStatus: unused, markNondeterministic: unused, release: unused },
    },
    content: { own: unused, asset: unused, records: unused, lookup: unused },
    hooks: { available: [], active: [] },
    events: { on: unused, off: unused },
  };
  const api1 = createApi1Adapter({
    core: neoCore, flags, log: api1Log,
    ...(newCharacter === undefined ? {} : { newCharacter }),
    prefs: {
      get: () => structuredClone(api1Prefs),
      set: (value) => { api1Prefs = structuredClone(value) as JsonValue | null; },
    },
    keymaps: {
      isBindableTriggerKey: (trigger) => !api1Bindings.has(trigger),
      bind: (trigger, action) => {
        if (api1Bindings.has(trigger)) return false;
        api1Bindings.set(trigger, action);
        return true;
      },
    },
  });
  return { api1, api2: createAdapter(mod), mod, api1Log, api2Log, api1Bindings, api2Bindings };
}

describe("the API 2 adapter twin", () => {
  it("reads the same flags", () => {
    const { api1, api2 } = adapters();
    expect(api2.meta.flags).toEqual(api1.meta.flags);
  });

  it.each([true, false, undefined])("reads the same new-character status for %s", (newCharacter) => {
    const { api1, api2 } = adapters(null, newCharacter);
    expect(api2.meta.newCharacter).toBe(api1.meta.newCharacter);
  });

  it("writes the same diagnostic", () => {
    const { api1, api2, api1Log, api2Log } = adapters();
    api1.meta.log("restored settings");
    api2.meta.log("restored settings");
    expect(api2Log.mock.calls).toEqual(api1Log.mock.calls);
  });

  it.each<JsonValue | null>([
    null, false, 7, "value", [1, "two"],
    { v: 1, values: { use_sound: false }, hitpointWarn: 3, delayFactor: 2, lazymoveDelay: 0 },
    { v: 2, options: { v: 1, values: { use_sound: true } }, hideRepeatShortcuts: true },
  ])("reads the same stored JSON for %j", async (value) => {
    const { api1, api2 } = adapters(value);
    const read = await api2.store.prefs.get();
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value).toEqual(api1.store.prefs?.get());
  });

  it("writes and clears the same preferences", async () => {
    const { api1, api2 } = adapters();
    const value = { v: 2, hideRepeatShortcuts: true };
    for (const stored of [value, null]) {
      api1.store.prefs?.set(stored);
      expect(await api2.store.prefs.set(stored)).toEqual(api2Ok(null));
      const read = await api2.store.prefs.get();
      expect(read.ok).toBe(true);
      if (read.ok) expect(read.value).toEqual(api1.store.prefs?.get());
    }
  });

  it.each(["F1", "F2"])("makes the same binding decision for %s", async (trigger) => {
    const { api1, api2, api1Bindings, api2Bindings } = adapters();
    const bound = api1.ui.keys?.bind(trigger, "R&[Enter]");
    const result = await api2.ui.keys.bind(trigger, "R&[Enter]");
    expect(result.ok).toBe(bound);
    if (!bound) expect(result).toEqual(api2Refused("trigger-taken", "key is taken"));
    expect(api2Bindings).toEqual(api1Bindings);
  });

  const failures: Api2Failure[] = [
    api2NotGranted("keymap:write"),
    api2Unavailable("no game"),
    api2Refused("trigger-taken", "key is taken"),
  ];
  it.each(failures)("keeps a $reason result from every async counterpart", async (failure) => {
    const { api2, mod } = adapters();
    const get = vi.spyOn(mod.store.prefs, "get").mockResolvedValue(failure);
    const set = vi.spyOn(mod.store.prefs, "set").mockResolvedValue(failure);
    const bind = vi.spyOn(mod.ui.keys, "bind").mockResolvedValue(failure);
    expect(await api2.store.prefs.get()).toBe(failure);
    expect(await api2.store.prefs.set(null)).toBe(failure);
    expect(await api2.ui.keys.bind("F1", "A")).toBe(failure);
    expect(get).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith(null);
    expect(bind).toHaveBeenCalledWith("F1", "A");
  });

  it("omits the exports without API 2 counterparts", () => {
    const { api2 } = adapters();
    expect(Object.keys(api2).sort()).toEqual(["meta", "store", "ui"]);
    expect(Object.keys(api2.ui)).toEqual(["keys"]);
    expect(Object.keys(api2.ui.keys)).toEqual(["bind"]);
  });

  it("keeps live options inside the API 1 adapter", () => {
    const options = new neoCore.OptionState();
    const adapter = createApi1Adapter({ core: neoCore, flags: {}, state: { options } });
    expect(adapter.engine).not.toHaveProperty("liveOptions");
    expect(Object.keys(adapter.engine.newOptionState()).sort()).toEqual(["isBirth", "isCheat", "isScore"]);
    const starting = adapter.engine.startingOptions;
    expect(starting).not.toBe(options);
    expect(starting?.set("use_sound", false)).toBe(true);
    starting?.setNumbers({ hitpointWarn: 4, delayFactor: 2 });
    expect(options.get("use_sound")).toBe(false);
    expect(options.hitpointWarn).toBe(4);
    expect(options.delayFactor).toBe(2);
    expect(starting).not.toHaveProperty("get");
  });
});
