/**
 * The `qol` mod's API 2 entry point: what it declares to the game for each
 * flag, and what its `start` does with a live game.
 *
 * The policy tables are applied by the game, and their behaviour (a dig on
 * walking into rubble, a pref file read past a mistake, a torch ignored) is
 * tested there and played in the lab. What this file pins is the half the game
 * cannot know: which tables THIS mod asks for, under which flags, and that each
 * one is a table the game accepts.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  api2PolicyEffects,
  apiRangeVerdict,
  checkApi2Policies,
  matchCapability,
  validateManifest,
} from "@rpgm-tools/neo-angband-mod-sdk";
import type { Api2Hooks, Api2Policies, JsonValue, ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";
import * as neoCore from "@rpgm-tools/neo-angband-core";
import { readHideRepeatShortcuts, readRememberedSettings } from "./preferences";
import plugin from "./plugin";

const manifestDocument = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8")) as unknown;
const manifest = validateManifest(manifestDocument, { code: ["plugin.js"] });

const allRuleFlags = (): Record<string, boolean> =>
  Object.fromEntries((manifest.rules ?? []).map((rule) => [rule.flag, true]));
const hooksFor = (flags: Readonly<Record<string, boolean>>): Api2Hooks => plugin.hooks({ id: "qol", flags }) ?? {};
const policiesFor = (flags: Readonly<Record<string, boolean>>): Api2Policies => plugin.policies({ id: "qol", flags }) ?? {};

describe("the qol mod's entry point", () => {
  it("is a schema 2 manifest on API 2, run in process", () => {
    expect((manifestDocument as { schemaVersion: number }).schemaVersion).toBe(2);
    expect(manifest.manifestSchema).toBe(2);
    expect(manifest.api).toBe(plugin.api);
    expect(manifest.api).toBe(">=2.0.0 <3.0.0");
    expect(manifest.runtime).toBe("in-process");
    expect(manifest.entry).toBe("plugin.js");
    expect(manifest.dependencies).toEqual({ core: "*" });
  });

  it("declares a range this game runs", () => {
    expect(apiRangeVerdict(plugin.api)).toEqual({ ok: true });
  });

  it("requests the grant each declaration and panel needs, and nothing else", () => {
    expect(manifest.capabilities).toEqual([
      "backup:folder",
      "ui:panel.mount",
      "keymap:write",
      "registry:menu",
      "registry:command",
      "registry:ui-entry",
      "registry:message",
    ]);
    for (const capability of manifest.capabilities ?? []) {
      expect(matchCapability(capability), capability).not.toBeNull();
    }
  });

  it("declares separate, opt-in accessibility accommodations", () => {
    const accommodations = (manifest.rules ?? [])
      .filter((rule) => rule.flag.startsWith("qol.accessibility"))
      .map(({ flag, title, default: isDefault }) => ({ flag, title, default: isDefault }));

    expect(accommodations).toEqual([
      { flag: "qol.accessibilityMacroWizard", title: "Accessibility: activation shortcut helper", default: false },
      { flag: "qol.accessibilityRepeatShortcuts", title: "Accessibility: repeated-action shortcuts", default: false },
    ]);
  });

  it("contributes nothing when the mod is enabled but every patch is off", () => {
    expect(hooksFor({})).toEqual({});
    expect(hooksFor({ "qol.rememberSettings": false, "qol.accessibilityMacroWizard": false })).toEqual({});
    expect(policiesFor({})).toEqual({});
    expect(policiesFor({ "qol.autoDig": false, "qol.miscNiceties": false })).toEqual({});
  });

  it("ignores flags that are not its own", () => {
    expect(hooksFor({ "bugfix.stairsReachable": true })).toEqual({});
    expect(policiesFor({ "bugfix.stairsReachable": true })).toEqual({});
  });

  it("is a mod with no engine access needed to declare anything", () => {
    /* hooks and policies are asked without the engine domain, so a public-tier install keeps every declared feature. */
    const all = { ...allRuleFlags(), "qol.miscNiceties": true };
    expect(() => plugin.hooks({ id: "qol", flags: all })).not.toThrow();
    expect(() => plugin.policies({ id: "qol", flags: all })).not.toThrow();
  });
});

describe("policy tables", () => {
  const cases: readonly (readonly [flag: string, tables: readonly string[]])[] = [
    ["qol.autoDig", ["walkBlockedByDiggable"]],
    ["qol.forgivingPrefFiles", ["prefErrors"]],
    ["qol.ignoreTorches", ["ignore"]],
    ["qol.ignoreLanterns", ["ignore"]],
    ["qol.miscNiceties", ["displayOptions", "messageText"]],
    ["qol.purgeQueuedInput", ["purgeInput"]],
  ];

  it("asks for exactly the tables each flag needs, and every one is a valid table", () => {
    for (const [flag, tables] of cases) {
      const policies = policiesFor({ [flag]: true });
      expect(Object.keys(policies).sort(), flag).toEqual([...tables].sort());
      expect(checkApi2Policies(policies), flag).toBeNull();
    }
  });

  it("is valid with every flag on at once", () => {
    const all = { ...allRuleFlags(), "qol.miscNiceties": true };
    const policies = policiesFor(all);
    expect(checkApi2Policies(policies)).toBeNull();
    expect(Object.keys(policies).sort()).toEqual(
      ["displayOptions", "ignore", "messageText", "prefErrors", "purgeInput", "walkBlockedByDiggable"],
    );
  });

  it("digs without stepping and spends a full move (the fork's behaviour, kept exactly)", () => {
    expect(policiesFor({ "qol.autoDig": true }).walkBlockedByDiggable).toEqual({
      kind: "walk-blocked-by-diggable",
      attempt: "tunnel",
      energy: "move",
      step: false,
    });
  });

  it("keeps reading a pref file and reports the first 20 mistakes", () => {
    expect(policiesFor({ "qol.forgivingPrefFiles": true }).prefErrors).toEqual({
      kind: "pref-errors",
      continueAfterError: true,
      reportLimit: 20,
    });
  });

  it("ignores torches and lanterns separately", () => {
    expect(policiesFor({ "qol.ignoreTorches": true }).ignore).toEqual([{ tval: "light", kindNameContains: "Torch", ignore: true }]);
    expect(policiesFor({ "qol.ignoreLanterns": true }).ignore).toEqual([{ tval: "light", kindNameContains: "Lantern", ignore: true }]);
    expect(policiesFor({ "qol.ignoreTorches": true, "qol.ignoreLanterns": true }).ignore).toHaveLength(2);
  });

  it("turns the three display niceties on together", () => {
    expect(policiesFor({ "qol.miscNiceties": true }).displayOptions).toEqual({
      kind: "display-options",
      storeItemNameEllipsis: true,
      storeSelectionDescription: true,
      monsterListColorKey: true,
    });
  });

  it("claims F2 for a purge of three Escapes on a fresh press", () => {
    expect(policiesFor({ "qol.purgeQueuedInput": true }).purgeInput).toEqual({
      kind: "purge-input",
      trigger: "F2",
      modifiers: [],
      freshOnly: true,
      escapeCount: 3,
    });
  });

  it("rewords upstream's immobile-monster message through the game's own table walker", () => {
    const effects = api2PolicyEffects(policiesFor({ "qol.miscNiceties": true }));
    expect(effects.hooks.messageText?.("The monster can not move.")).toBe("The monster cannot move.");
    expect(effects.hooks.messageText?.("You have no room for that.")).toBe("You have no room for that.");
  });
});

describe("hooks", () => {
  it("installs abilityGained only for the activation shortcut helper", () => {
    expect(Object.keys(hooksFor({ "qol.accessibilityMacroWizard": true }))).toEqual(["abilityGained"]);
    expect(hooksFor({ "qol.accessibilityRepeatShortcuts": true })).toEqual({});
  });

  it("installs optionsChanged only for remembered settings", () => {
    expect(Object.keys(hooksFor({ "qol.rememberSettings": true }))).toEqual(["optionsChanged"]);
    expect(hooksFor({ "qol.rememberSettings": false }).optionsChanged).toBeUndefined();
  });
});

/** An in-memory store slot and the result envelope the host wraps every call in. */
function slot(initial: JsonValue | null = null): { get(): Promise<unknown>; set(v: JsonValue | null): Promise<unknown>; peek(): JsonValue | null } {
  let value = initial;
  return {
    get: () => Promise.resolve({ ok: true, value }),
    set: (v) => {
      value = v;
      return Promise.resolve({ ok: true, value: null });
    },
    peek: () => value,
  };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface FakeModOptions {
  readonly flags: Readonly<Record<string, boolean>>;
  readonly newCharacter?: boolean;
  readonly prefs?: ReturnType<typeof slot>;
  readonly options?: neoCore.OptionState | null;
  readonly backupFolder?: unknown;
}

function fakeMod(opts: FakeModOptions): { mod: ModApi2; logs: string[]; prefs: ReturnType<typeof slot> } {
  const logs: string[] = [];
  const prefs = opts.prefs ?? slot();
  const mod = {
    meta: {
      flags: opts.flags,
      newCharacter: opts.newCharacter ?? false,
      log: (line: string) => logs.push(line),
    },
    store: { prefs },
    ui: {
      mount: () => Promise.resolve({ ok: true, value: { panelId: "x" } }),
      unmount: () => Promise.resolve({ ok: true, value: null }),
      patch: () => Promise.resolve({ ok: true, value: { panelId: "x" } }),
      keys: {
        isBindableTriggerKey: () => Promise.resolve({ ok: true, value: true }),
        bind: () => Promise.resolve({ ok: true, value: null }),
      },
    },
    ...(opts.options === null ? {} : { engine: { state: { options: opts.options ?? new neoCore.OptionState() } } }),
    ...(opts.backupFolder ? { backupFolder: opts.backupFolder } : {}),
  } as unknown as ModApi2;
  return { mod, logs, prefs };
}

/** The snapshot the game hands to `optionsChanged`, built from a real option store. */
function snapshot(options: neoCore.OptionState): Parameters<NonNullable<Api2Hooks["optionsChanged"]>>[0] {
  const s = options.snapshot();
  return { values: s.values, hitpointWarn: s.hitpointWarn, delayFactor: s.delayFactor, lazymoveDelay: s.lazymoveDelay, birth: {} };
}

describe("remember my settings", () => {
  const ON = { "qol.rememberSettings": true, "qol.rememberCheats": false };
  const WITH_CHEATS = { "qol.rememberSettings": true, "qol.rememberCheats": true };

  /** Run `start` on a live fake, then fire the capture half the way the game does. */
  async function change(
    options: neoCore.OptionState,
    flags: Record<string, boolean>,
    prefs: ReturnType<typeof slot>,
  ): Promise<void> {
    const { mod } = fakeMod({ flags, prefs });
    await plugin.start(mod);
    plugin.hooks({ id: "qol", flags }).optionsChanged?.(snapshot(options));
    await settle();
    plugin.stop();
  }

  it("stores what the player chose, and applies it to the next character", async () => {
    const prefs = slot();
    const first = new neoCore.OptionState();
    expect(first.get("use_sound")).toBe(false);
    first.set("use_sound", true);
    first.hitpointWarn = 7;
    first.delayFactor = 12;
    await change(first, ON, prefs);

    const next = new neoCore.OptionState();
    expect(next.get("use_sound")).toBe(false);
    const { mod, logs } = fakeMod({ flags: ON, newCharacter: true, prefs, options: next });
    await plugin.start(mod);
    plugin.stop();
    expect(next.get("use_sound")).toBe(true);
    expect(next.hitpointWarn).toBe(7);
    expect(next.delayFactor).toBe(12);
    expect(logs.some((line) => line.startsWith("restored "))).toBe(true);
  });

  it("does nothing before the game is running", async () => {
    const prefs = slot();
    const options = new neoCore.OptionState();
    options.set("use_sound", true);
    plugin.hooks({ id: "qol", flags: ON }).optionsChanged?.(snapshot(options));
    await settle();
    expect(prefs.peek()).toBeNull();
  });

  it("leaves a LOADED character exactly as its save had it", async () => {
    const prefs = slot();
    const first = new neoCore.OptionState();
    first.set("use_sound", true);
    await change(first, ON, prefs);

    const loaded = new neoCore.OptionState();
    const { mod } = fakeMod({ flags: ON, newCharacter: false, prefs, options: loaded });
    await plugin.start(mod);
    plugin.stop();
    expect(loaded.get("use_sound")).toBe(false);
  });

  it("never remembers a cheat or score option by default", async () => {
    const prefs = slot();
    const first = new neoCore.OptionState();
    first.set("cheat_hear", true);
    await change(first, ON, prefs);
    const stored = readRememberedSettings(prefs.peek());
    expect(stored).not.toBeNull();
    expect(Object.keys(stored!.values).some((name) => name.startsWith("cheat_") || name.startsWith("score_"))).toBe(false);

    const next = new neoCore.OptionState();
    const { mod } = fakeMod({ flags: ON, newCharacter: true, prefs, options: next });
    await plugin.start(mod);
    plugin.stop();
    expect(next.get("cheat_hear")).toBe(false);
    expect(next.anyScoreSet()).toBe(false);
  });

  it("remembers cheat options when the player asks for them", async () => {
    const prefs = slot();
    const first = new neoCore.OptionState();
    first.set("cheat_hear", true);
    await change(first, WITH_CHEATS, prefs);

    const next = new neoCore.OptionState();
    const { mod } = fakeMod({ flags: WITH_CHEATS, newCharacter: true, prefs, options: next });
    await plugin.start(mod);
    plugin.stop();
    expect(next.get("cheat_hear")).toBe(true);
  });

  it("stops applying stored cheats the moment the toggle goes off", async () => {
    const prefs = slot();
    const first = new neoCore.OptionState();
    first.set("cheat_hear", true);
    await change(first, WITH_CHEATS, prefs);

    const next = new neoCore.OptionState();
    const { mod } = fakeMod({ flags: ON, newCharacter: true, prefs, options: next });
    await plugin.start(mod);
    plugin.stop();
    expect(next.get("cheat_hear")).toBe(false);
  });

  it("never stores a birth option, because it could never apply one", async () => {
    const prefs = slot();
    const first = new neoCore.OptionState();
    await change(first, ON, prefs);
    const stored = readRememberedSettings(prefs.peek());
    expect(Object.keys(stored!.values).some((name) => name.startsWith("birth_"))).toBe(false);

    const hooks = plugin.hooks({ id: "qol", flags: ON });
    const { mod } = fakeMod({ flags: ON, prefs });
    await plugin.start(mod);
    hooks.optionsChanged?.({ values: { birth_randarts: true, use_sound: true }, hitpointWarn: 3, delayFactor: 0, lazymoveDelay: 0, birth: { birth_randarts: true } });
    await settle();
    plugin.stop();
    expect(Object.keys(readRememberedSettings(prefs.peek())!.values)).toEqual(["use_sound"]);
  });

  it("ignores a stored blob it does not understand", async () => {
    const prefs = slot({ v: 99, values: { use_sound: true } });
    const next = new neoCore.OptionState();
    const { mod, logs } = fakeMod({ flags: ON, newCharacter: true, prefs, options: next });
    await plugin.start(mod);
    plugin.stop();
    expect(next.get("use_sound")).toBe(false);
    expect(logs).toContain("stored settings are version 99; ignoring them");
  });

  it("survives an option name this game no longer has", async () => {
    const prefs = slot({ v: 2, options: { v: 1, values: { no_such_option: true, use_sound: true }, hitpointWarn: 4, delayFactor: 0, lazymoveDelay: 0 } });
    const next = new neoCore.OptionState();
    const { mod } = fakeMod({ flags: ON, newCharacter: true, prefs, options: next });
    await expect(plugin.start(mod)).resolves.toBeUndefined();
    plugin.stop();
    expect(next.get("use_sound")).toBe(true);
    expect(next.hitpointWarn).toBe(4);
  });

  it("says so, and changes nothing, when the mod has no access to the game's options", async () => {
    const prefs = slot({ v: 2, options: { v: 1, values: { use_sound: true }, hitpointWarn: 4, delayFactor: 0, lazymoveDelay: 0 } });
    const { mod, logs } = fakeMod({ flags: ON, newCharacter: true, prefs, options: null });
    await plugin.start(mod);
    plugin.stop();
    expect(logs.some((line) => line.includes("gap QOL-1"))).toBe(true);
  });

  it("restores nothing when the toggle is off", async () => {
    const prefs = slot({ v: 2, options: { v: 1, values: { use_sound: true }, hitpointWarn: 4, delayFactor: 0, lazymoveDelay: 0 } });
    const next = new neoCore.OptionState();
    const { mod } = fakeMod({ flags: { "qol.rememberSettings": false }, newCharacter: true, prefs, options: next });
    await plugin.start(mod);
    plugin.stop();
    expect(next.get("use_sound")).toBe(false);
  });

  it("brings a pre-versioned preference blob forward and drops what moved out", () => {
    const old = { v: 1, values: { use_sound: true }, hitpointWarn: 5, delayFactor: 1, lazymoveDelay: 0, display: { zoom: 2 } };
    const migrated = plugin.prefs.migrate(old as unknown as JsonValue, 0) as { v: number; options?: unknown; display?: unknown };
    expect(migrated.v).toBe(2);
    expect(migrated.options).toEqual({ v: 1, values: { use_sound: true }, hitpointWarn: 5, delayFactor: 1, lazymoveDelay: 0 });
    expect(migrated.display).toBeUndefined();
    expect(plugin.prefs.migrate({ nonsense: true }, 0)).toBeNull();
    expect(readHideRepeatShortcuts(plugin.prefs.migrate({ v: 2, hideRepeatShortcuts: true }, 0))).toBe(true);
  });
});

describe("cloud backup folder", () => {
  const action = plugin.actions[0]!;

  function folder(overrides: Record<string, unknown> = {}) {
    const written: { name: string; text: string }[] = [];
    let listener: ((file: { name: string; text: string }) => void) | undefined;
    const backupFolder = {
      choose: vi.fn(() => Promise.resolve({ ok: true, value: "Dropbox" })),
      list: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
      write: vi.fn((name: string, text: string) => {
        written.push({ name, text });
        return Promise.resolve({ ok: true, value: true });
      }),
      onSave: vi.fn((fn: (file: { name: string; text: string }) => void) => {
        listener = fn;
        return Promise.resolve({ ok: true, value: { id: "s" } });
      }),
      ...overrides,
    };
    return { backupFolder, written, save: (file: { name: string; text: string }) => listener?.(file) };
  }

  it("registers the Game-menu picker", () => {
    expect(plugin.actions).toHaveLength(1);
    expect(action).toMatchObject({ menu: "core:game-menu", action: "choose-backup-folder", label: "Choose cloud-backup folder..." });
  });

  it("writes every save the game makes into the chosen folder", async () => {
    const f = folder();
    const { mod } = fakeMod({ flags: {}, backupFolder: f.backupFolder });
    await plugin.start(mod);
    plugin.stop();
    f.save({ name: "hero.sav", text: "data" });
    expect(f.written).toEqual([{ name: "hero.sav", text: "data" }]);
  });

  it("does not subscribe on a host with no backup folder", async () => {
    const { mod, logs } = fakeMod({ flags: {} });
    await expect(plugin.start(mod)).resolves.toBeUndefined();
    plugin.stop();
    expect(logs).toEqual([]);
  });

  it("names the folder after a pick, and counts the characters already there (#24)", async () => {
    const f = folder({
      list: vi.fn(() =>
        Promise.resolve({
          ok: true,
          value: [
            { name: "a.sav", lineage: "L1", characterName: "A", level: 3 },
            { name: "b.sav", characterName: "B", level: 1 },
            { name: "c.sav", lineage: "L3", characterName: "C", level: 9 },
          ],
        }),
      ),
    });
    const { mod, logs } = fakeMod({ flags: {}, backupFolder: f.backupFolder });
    await action.run(mod);
    expect(logs).toEqual(['Using backup folder "Dropbox" (2 characters already there).']);
  });

  it("names the folder alone when it is empty", async () => {
    const f = folder();
    const { mod, logs } = fakeMod({ flags: {}, backupFolder: f.backupFolder });
    await action.run(mod);
    expect(logs).toEqual(['Using backup folder "Dropbox".']);
  });

  it("says nothing for a cancelled pick, and contains a rejected one", async () => {
    const cancelled = folder({ choose: vi.fn(() => Promise.resolve({ ok: true, value: null })) });
    const first = fakeMod({ flags: {}, backupFolder: cancelled.backupFolder });
    await action.run(first.mod);
    expect(first.logs).toEqual([]);

    const rejected = folder({ choose: vi.fn(() => Promise.reject(new Error("no picker"))) });
    const second = fakeMod({ flags: {}, backupFolder: rejected.backupFolder });
    await expect(action.run(second.mod)).resolves.toBeUndefined();
  });

  it("reports a host that cannot choose, instead of a dead row doing nothing", async () => {
    const { mod, logs } = fakeMod({ flags: {} });
    await action.run(mod);
    expect(logs).toEqual(["this host cannot choose a backup folder"]);
  });
});

describe("teardown", () => {
  it("closes both shortcut panels when the mod stops", async () => {
    const unmount = vi.fn(() => Promise.resolve({ ok: true, value: null }));
    const { mod } = fakeMod({
      flags: { "qol.accessibilityRepeatShortcuts": true },
    });
    (mod.ui as { unmount: unknown }).unmount = unmount;
    await plugin.start(mod);
    plugin.stop();
    expect(unmount).toHaveBeenCalledWith("repeated-action-shortcuts");
  });
});
