/**
 * The `qol` mod's own tests, next to the mod's own code.
 *
 * They exercise the mod exactly as the game does: import its default entry
 * point, hand it resolved flags, install the result as GameState.modHooks, and
 * play a real turn through a real startGame. Nothing here reaches into core's
 * internals - it imports @rpgm-tools/neo-angband-core's published API, like any third-party
 * mod's tests would.
 *
 * The complementary half is in core: packages/core/src/game/auto-dig.test.ts
 * pins what the walkBlockedByDiggable SEAM promises (an absent hook bumps and
 * draws nothing; the returned energy is spent; null falls back). This file pins
 * what the MOD does with that promise.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  loadPackFile as loadJson,
  loadPackRecords as loadRecords,
} from "@rpgm-tools/neo-angband-content/pack";
import {
  DDGRID,
  FEAT,
  loc,
  squareMemorize,
  squareMonster,
  startGame,
  walkAction,
} from "@rpgm-tools/neo-angband-core";
import type { GamePack, GameState, Loc, ModHooks } from "@rpgm-tools/neo-angband-core";
import * as neoCore from "@rpgm-tools/neo-angband-core";
import { readRememberedSettings } from "./preferences";
import plugin from "./plugin";

/**
 * The mod's behaviour, driven the way the HOST drives it.
 *
 * The entry point is a ModPlugin whose `hooks` takes a context and reads the engine
 * off `ctx.core` (mods/qol/plugin.ts). The host reduces that to a function of flags
 * (src/mod-hooks.ts pluginAdapter); this is the same reduction, with the REAL core
 * namespace passed in - so these tests exercise the shipped path rather than a
 * signature only they use.
 */
const qolHooks = (flags: Readonly<Record<string, boolean>>): ModHooks =>
  plugin.hooks({ flags, core: neoCore });

describe("plugin teardown", () => {
  it("asks every QoL-owned panel feature to clean up (neo-angband #251)", () => {
    const source = readFileSync(new URL("./plugin.ts", import.meta.url), "utf8");
    const start = source.indexOf("  uninstall(): void {");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("\n  },", start));
    expect(body).toContain("uninstallMacroWizard()");
    expect(body).toContain("uninstallRepeatShortcuts()");
    expect(body).toContain("uninstallPurgeQueuedInput()");
  });
});

describe("qol.purgeQueuedInput: gating (neo-angband #35)", () => {
  type Ctx = Parameters<typeof plugin.register>[1];

  /** A display fake for the key listener used by purge queued input. */
  function fakeDisplay(onKey: NonNullable<Ctx["display"]>["onKey"]): Ctx["display"] {
    return {
      snapshot: () => ({
        mode: "play",
        grid: { cols: 80, rows: 24, cellWidth: 16, cellHeight: 24 },
        viewport: { origin: { x: 0, y: 0 }, size: { width: 66, height: 24 }, screenOrigin: { x: 0, y: 0 } },
        level: { width: 66, height: 24 },
        layout: "left",
        regions: {},
      }),
      onKey,
      setGrid: vi.fn(),
      setCamera: vi.fn(),
      setMapView: vi.fn(),
      setSidebarExtent: vi.fn(),
      setTileScaling: vi.fn(),
      setVisualFilter: vi.fn(),
      repaint: vi.fn(),
    } as unknown as Ctx["display"];
  }

  it("claims nothing when the rule is off, leaving existing behaviour unchanged", () => {
    const isBindableTriggerKey = vi.fn(() => true);
    plugin.register(menuHost([]), {
      flags: {},
      core: neoCore,
      keymaps: { isBindableTriggerKey, bind: vi.fn(() => true) },
      display: fakeDisplay(vi.fn(() => () => undefined)),
    } as Ctx);
    expect(isBindableTriggerKey).not.toHaveBeenCalled();
  });

  it("claims the trigger through ctx.display.onKey, never through ctx.keymaps.bind, when the rule is on", () => {
    const isBindableTriggerKey = vi.fn(() => true);
    const bind = vi.fn(() => true);
    const onKey = vi.fn(() => () => undefined);
    plugin.register(menuHost([]), {
      flags: { "qol.purgeQueuedInput": true },
      core: neoCore,
      keymaps: { isBindableTriggerKey, bind },
      display: fakeDisplay(onKey),
    } as Ctx);
    expect(isBindableTriggerKey).toHaveBeenCalledWith("F2");
    expect(onKey).toHaveBeenCalledOnce();
    /* Binding the trigger would make a held key's repeats unobservable to
     * ctx.keyRepeat - see purge-queued-input.ts's own header - so this must
     * never call bind() for its own trigger. */
    expect(bind).not.toHaveBeenCalled();
  });
});


const pack: GamePack = {
  constants: loadJson("constants"),
  terrain: loadRecords("terrain"),
  roomTemplates: loadRecords("room_template"),
  vaults: loadRecords("vault"),
  dungeonProfiles: loadRecords("dungeon_profile"),
  projection: loadRecords("projection"),
  trap: loadRecords("trap"),
  names: loadRecords("names"),
  quest: loadRecords("quest"),
  obj: {
    objectBase: loadJson("object_base"),
    object: loadJson("object"),
    egoItem: loadJson("ego_item"),
    artifact: loadJson("artifact"),
    curse: loadJson("curse"),
    brand: loadJson("brand"),
    slay: loadJson("slay"),
    activation: loadJson("activation"),
    objectProperty: loadJson("object_property"),
    flavor: loadJson("flavor"),
  } as GamePack["obj"],
  mon: {
    pain: loadRecords("pain"),
    blowMethods: loadRecords("blow_methods"),
    blowEffects: loadRecords("blow_effects"),
    monsterSpells: loadRecords("monster_spell"),
    monsterBases: loadRecords("monster_base"),
    monsters: loadRecords("monster"),
    summons: loadRecords("summon"),
    pits: loadRecords("pit"),
  },
  player: {
    races: loadRecords("p_race"),
    classes: loadRecords("class"),
    properties: loadRecords("player_property"),
    timed: loadRecords("player_timed"),
    shapes: loadRecords("shape"),
    bodies: loadRecords("body"),
    history: loadRecords("history"),
    realms: loadRecords("realm"),
  },
} as unknown as GamePack;

/* Only the auto-dig rule. NOT every rule - the mod has three now, and the two
 * "remember my settings" ones need a prefs store to install anything. */
const DIG_ON = { "qol.autoDig": true };

/** One menu action accepted by the real registry-host facade. */
interface RegisteredMenuAction {
  readonly id: "core:game-menu";
  readonly action: string;
  readonly label: string;
  readonly handler: () => void | Promise<void>;
}

/**
 * The front end owns the concrete menu registry, but a plugin receives this
 * exact registry-host seam. Keep the recorder at that boundary while each
 * test still boots a real game for the register() context.
 */
function menuHost(actions: RegisteredMenuAction[]): Parameters<typeof plugin.register>[0] {
  return {
    menus: {
      addAction(id, action, label, handler): void {
        actions.push({ id, action, label, handler });
      },
    },
  };
}

/**
 * A real game with a diggable wall next to the player and a digger strong enough
 * that the roll always succeeds. Returns the direction to walk and the grid.
 *
 * The direction is SEARCHED rather than assumed: a real generated level can put a
 * monster next to the player, and walking into a monster is an attack, not a
 * blocked walk. Picking the first monster-free orthogonal neighbour keeps this
 * test about digging even if the generation stream shifts.
 */
function dugGame(feat: number = FEAT.RUBBLE, digging = 200): {
  state: GameState;
  registry: ReturnType<typeof startGame>["registry"];
  dir: number;
  grid: Loc;
} {
  const { state, registry } = startGame(pack, { seed: 20260729, depth: 2 });
  let chosen: { dir: number; grid: Loc } | null = null;
  for (const dir of [6, 4, 2, 8]) {
    const d = DDGRID[dir] as Loc;
    const grid = loc(state.actor.grid.x + d.x, state.actor.grid.y + d.y);
    if (!state.chunk.inBoundsFully(grid)) continue;
    if (squareMonster(state, grid)) continue;
    chosen = { dir, grid };
    break;
  }
  if (!chosen) throw new Error("no monster-free neighbour to dig into");
  state.chunk.setFeat(chosen.grid, feat);
  squareMemorize(state, chosen.grid); // square_isknown gate
  /* The DIGGING skill the roll actually uses. In a live session it comes from
   * player_best_digger (player-util.c L744) through this seam, which temporarily
   * wields the pack's best digger - so setting combat.skills directly would be
   * ignored, exactly as it is in the real game. */
  state.bestDiggerDigging = (): number => digging;
  return { state, registry, dir: chosen.dir, grid: chosen.grid };
}

describe("the qol mod's entry point", () => {
  it("requests only capabilities used by remaining features", () => {
    const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8")) as {
      capabilities: string[];
    };
    expect(manifest.capabilities).toEqual([
      "backup:folder",
      "ui:panel.mount",
      "keymap:write",
      "registry:menu",
    ]);
  });

  it("declares separate, opt-in accessibility accommodations", () => {
    const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8")) as {
      rules: { flag: string; title: string; default: boolean }[];
    };
    const accommodations = manifest.rules
      .filter((rule) => rule.flag.startsWith("qol.accessibility"))
      .map(({ flag, title, default: isDefault }) => ({ flag, title, default: isDefault }));

    expect(accommodations).toEqual([
      {
        flag: "qol.accessibilityMacroWizard",
        title: "Accessibility: activation shortcut helper",
        default: false,
      },
      {
        flag: "qol.accessibilityRepeatShortcuts",
        title: "Accessibility: repeated-action shortcuts",
        default: false,
      },
    ]);
  });

  it("contributes nothing when the mod is enabled but every patch is off", () => {
    /* The host still calls an enabled mod, so "{}" is the honest answer, and
     * composeModHooks turns a set of empty contributions back into `undefined` -
     * leaving GameState.modHooks absent. */
    expect(qolHooks({})).toEqual({});
    expect(qolHooks({ "qol.autoDig": false })).toEqual({});
  });

  it("installs walkBlockedByDiggable, and ONLY that, for qol.autoDig", () => {
    const hooks = qolHooks(DIG_ON);
    expect(Object.keys(hooks)).toEqual(["walkBlockedByDiggable"]);
  });

  it("ignores flags that are not its own", () => {
    /* The host slices the flag map per mod, but a mod must not act on a foreign
     * flag even if one arrives. */
    expect(qolHooks({ "bugfix.stairsReachable": true })).toEqual({});
  });
});

/**
 * qol.forgivingPrefFiles, the half of #272 that came back as a mod.
 *
 * Core's own tests (packages/core/src/visuals/prefs.test.ts) pin what the SEAM
 * does - that a policy of `{continueAfterError: true}` really does apply the
 * lines after a bad one, and that core's default really does stop. This file
 * pins what the MOD asks for, which is the half core cannot know about.
 *
 * The seam is RECORDED rather than driven, because it landed in the engine after
 * the published one these tests import by default. A test that drove the real
 * `setPrefErrorPolicy` would pass or fail depending on which engine happened to
 * be installed, which is a test that measures the wrong thing.
 */
describe("qol.forgivingPrefFiles: reading a pref file past a mistake", () => {
  type Policy = { continueAfterError: boolean; reportLimit: number } | null;

  /** The engine, with the #272 seam replaced by a recorder. */
  function coreWithSeam(): { core: typeof neoCore; asked: Policy[] } {
    const asked: Policy[] = [];
    const core = {
      ...neoCore,
      setPrefErrorPolicy: (p: Policy): void => {
        asked.push(p);
      },
    };
    return { core: core as typeof neoCore, asked };
  }

  /** An engine from before the seam existed. */
  function coreWithoutSeam(): typeof neoCore {
    const core: Record<string, unknown> = { ...neoCore };
    delete core["setPrefErrorPolicy"];
    return core as unknown as typeof neoCore;
  }

  it("asks core to keep reading, and to report the first 20 mistakes", () => {
    const { core, asked } = coreWithSeam();
    plugin.hooks({ flags: { "qol.forgivingPrefFiles": true }, core });
    /* 20 is the number core itself used to carry as PARSE_ERROR_LIMIT. The
     * difference from that cap is `continueAfterError`: the old one stopped
     * applying the file as well as stopping the report. */
    expect(asked).toEqual([{ continueAfterError: true, reportLimit: 20 }]);
  });

  it("asks for nothing at all when the toggle is off", () => {
    /* "A disabled mod's patches DO NOT EXIST". Off must not install a policy
     * that says "behave like core would have anyway" - it must not call. */
    const off = coreWithSeam();
    plugin.hooks({ flags: { "qol.forgivingPrefFiles": false }, core: off.core });
    expect(off.asked).toEqual([]);

    const absent = coreWithSeam();
    plugin.hooks({ flags: {}, core: absent.core });
    expect(absent.asked).toEqual([]);
  });

  it("adds no ModHooks member, because this is not a hook", () => {
    const { core } = coreWithSeam();
    expect(plugin.hooks({ flags: { "qol.forgivingPrefFiles": true }, core })).toEqual({});
  });

  it("is inert, and says so, on an engine without the seam", () => {
    /* manifest.json's engine range should have refused this pairing. If it
     * somehow does not, the mod must not throw at boot - and must not be
     * silently inert either, which is the failure this project keeps finding. */
    const said: string[] = [];
    expect(() =>
      plugin.hooks({
        flags: { "qol.forgivingPrefFiles": true },
        core: coreWithoutSeam(),
        log: (m) => said.push(m),
      }),
    ).not.toThrow();
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/too old/);
  });
});

describe("qol.autoDig: walking into diggable terrain", () => {
  it("digs once, spends a move, and does not step onto the grid", () => {
    const { state, dir, grid } = dugGame();
    state.modHooks = qolHooks(DIG_ON);
    const before = loc(state.actor.grid.x, state.actor.grid.y);

    const spent = walkAction(state, { code: "walk", dir });

    expect(spent).toBe(state.z.moveEnergy);
    expect(state.actor.grid).toEqual(before); // source fork: dig, don't step
    expect(state.chunk.isRubble(grid)).toBe(false); // dug out (skill 200)
  });

  it("declines an unknown grid, drawing no RNG - the faithful bump", () => {
    const { state, grid } = dugGame();
    state.known.feat[grid.y * state.chunk.width + grid.x] = -1; // un-memorize it (-1 = unknown)
    const hook = qolHooks(DIG_ON).walkBlockedByDiggable!;
    const rngBefore = JSON.stringify(state.rng.getState());

    expect(hook(state, grid, { env: {} })).toBeNull();

    /* Declining has to be free of observable effect: faithful core bumps the wall
     * without drawing, so a decline that rolled first would desynchronise the
     * stream and a seed would stop meaning the same game. */
    expect(JSON.stringify(state.rng.getState())).toBe(rngBefore);
    expect(state.chunk.isRubble(grid)).toBe(true);
  });

  it("declines permanent rock, drawing no RNG", () => {
    const { state, grid } = dugGame(FEAT.PERM);
    const hook = qolHooks(DIG_ON).walkBlockedByDiggable!;
    const rngBefore = JSON.stringify(state.rng.getState());
    expect(hook(state, grid, { env: {} })).toBeNull();
    expect(JSON.stringify(state.rng.getState())).toBe(rngBefore);
  });

  it("declines terrain no digger could get through at this skill", () => {
    const { state, grid } = dugGame(FEAT.GRANITE, 20); // granite chance = (20-40) -> 0
    const hook = qolHooks(DIG_ON).walkBlockedByDiggable!;
    expect(hook(state, grid, { env: {} })).toBeNull();
  });

  it("spends the move even when the attempt FAILS (one attempt per walk)", () => {
    /* A weak digger with a positive chance: movementTunnelTest passes, so the mod
     * commits to the walk, tunnelAux rolls and (at this skill, on granite)
     * essentially always fails. The turn is still spent - that is the source
     * fork's behaviour, and it is what makes repeated walks dig through a vein. */
    const { state, dir, grid } = dugGame(FEAT.GRANITE, 45); // chance = (45-40) > 0
    state.modHooks = qolHooks(DIG_ON);
    const spent = walkAction(state, { code: "walk", dir });
    expect(spent).toBe(state.z.moveEnergy);
    expect(state.chunk.feat(grid)).toBe(FEAT.GRANITE); // still there
  });
});

/**
 * Cloud backup is registered at the same live-game register() seam the host
 * uses. The menu implementation belongs to the web front end, so this records
 * the one public registry call rather than duplicating the front end's menu.
 */
describe("cloud backup folder", () => {
  it("registers the Game-menu picker and writes the save files the host supplies", async () => {
    const { state } = startGame(pack, { seed: 165, depth: 2 });
    const actions: RegisteredMenuAction[] = [];
    const writes: Array<{ name: string; text: string }> = [];
    let onSave: ((file: { readonly name: string; readonly text: string }) => void) | undefined;
    let chooses = 0;
    const backupFolder = {
      async choose(): Promise<string | null> {
        chooses++;
        return null; // cancellation is a normal no-op
      },
      async write(name: string, text: string): Promise<boolean> {
        writes.push({ name, text });
        return true;
      },
      onSave(fn: (file: { readonly name: string; readonly text: string }) => void): void {
        onSave = fn;
      },
    };

    /* The host composes hooks before it registers the live game. Keep that
     * order here so this exercises both halves as they are actually wired. */
    plugin.hooks({ flags: {}, core: neoCore, backupFolder });
    plugin.register(menuHost(actions), { flags: {}, core: neoCore, state, backupFolder });

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      id: "core:game-menu",
      action: "choose-backup-folder",
      label: "Choose cloud-backup folder...",
    });
    await expect(actions[0]!.handler()).resolves.toBeUndefined();
    expect(chooses).toBe(1);

    onSave?.({ name: "Bilbo-abcdef12.neochar", text: "save bytes" });
    expect(writes).toEqual([{ name: "Bilbo-abcdef12.neochar", text: "save bytes" }]);
  });

  it("does not add a dead row when the host has no backup-folder capability", () => {
    const { state } = startGame(pack, { seed: 166, depth: 2 });
    const actions: RegisteredMenuAction[] = [];

    expect(() => plugin.register(menuHost(actions), { flags: {}, core: neoCore, state })).not.toThrow();
    expect(actions).toEqual([]);
  });

  it("contains a rejected picker so the Game menu can close normally", async () => {
    const { state } = startGame(pack, { seed: 167, depth: 2 });
    const actions: RegisteredMenuAction[] = [];
    plugin.register(menuHost(actions), {
      flags: {},
      core: neoCore,
      state,
      backupFolder: {
        choose: async () => Promise.reject(new Error("picker closed")),
        write: async () => false,
        onSave: () => undefined,
      },
    });

    await expect(actions[0]!.handler()).resolves.toBeUndefined();
  });

  /* neo-angband#24: after a successful choose(), the row also reports how
   * many characters are already sitting in the folder just picked - useful
   * confirmation on a second machine, where the folder is an existing
   * Dropbox full of characters rather than an empty one. */
  describe("reporting what list() finds after choosing (#24)", () => {
    function register(
      list: (() => Promise<
        readonly { name: string; lineage?: string; characterName: string; level: number }[]
      >) | undefined,
    ): { actions: RegisteredMenuAction[]; logs: string[] } {
      const { state } = startGame(pack, { seed: 168, depth: 2 });
      const actions: RegisteredMenuAction[] = [];
      const logs: string[] = [];
      plugin.register(menuHost(actions), {
        flags: {},
        core: neoCore,
        state,
        log: (msg) => logs.push(msg),
        backupFolder: {
          choose: async () => "NeoAngband",
          write: async () => true,
          onSave: () => undefined,
          ...(list ? { list } : {}),
        },
      });
      return { actions, logs };
    }

    it("names the folder and counts the identified characters already there", async () => {
      const { actions, logs } = register(async () => [
        { name: "Bilbo-abcdef12.neochar", lineage: "lin-bilbo", characterName: "Bilbo", level: 12 },
        { name: "Frodo-00112233.neochar", lineage: "lin-frodo", characterName: "Frodo", level: 5 },
      ]);
      await actions[0]!.handler();
      expect(logs).toEqual(['Using backup folder "NeoAngband" (2 characters already there).']);
    });

    it("uses the singular for exactly one, and does not count an unreadable entry", async () => {
      const { actions, logs } = register(async () => [
        { name: "Bilbo-abcdef12.neochar", lineage: "lin-bilbo", characterName: "Bilbo", level: 12 },
        { name: "garbage.neochar", characterName: "", level: 0 }, // no lineage: unreadable
      ]);
      await actions[0]!.handler();
      expect(logs).toEqual(['Using backup folder "NeoAngband" (1 character already there).']);
    });

    it("names the folder alone when the folder is empty", async () => {
      const { actions, logs } = register(async () => []);
      await actions[0]!.handler();
      expect(logs).toEqual(['Using backup folder "NeoAngband".']);
    });

    it("still names the folder when the host's backupFolder has no list() at all", async () => {
      /* An older host: everything else on backupFolder works, this method
       * does not exist. Guarded with `?.()`, never a crash. */
      const { actions, logs } = register(undefined);
      await actions[0]!.handler();
      expect(logs).toEqual(['Using backup folder "NeoAngband".']);
    });

    it("logs nothing on a cancelled pick - there is nothing to report", async () => {
      const { state } = startGame(pack, { seed: 169, depth: 2 });
      const actions: RegisteredMenuAction[] = [];
      const logs: string[] = [];
      plugin.register(menuHost(actions), {
        flags: {},
        core: neoCore,
        state,
        log: (msg) => logs.push(msg),
        backupFolder: {
          choose: async () => null,
          write: async () => true,
          onSave: () => undefined,
          list: async () => [],
        },
      });
      await actions[0]!.handler();
      expect(logs).toEqual([]);
    });
  });
});

/**
 * "Remember my settings" (qol.rememberSettings / qol.rememberCheats).
 *
 * Driven exactly as the host drives it: `hooks()` returns the optionsChanged
 * notification the '=' menu fires, and `register()` is the half that runs once
 * at boot. Both are given a real OptionState from the engine, so the birth /
 * cheat / score classification is the engine's own and not a list this file
 * keeps in step by hand.
 */
describe("remember my settings", () => {
  /** A prefs store like the host's ctx.prefs, in memory. */
  function fakePrefs(): { get(): unknown; set(v: unknown): void } {
    let value: unknown = null;
    return {
      get: () => value,
      set: (v) => {
        value = v;
      },
    };
  }

  /** The context shape the host passes, with the pieces a test wants to vary. */
  function ctxFor(
    opts: neoCore.OptionState,
    flags: Record<string, boolean>,
    extra: { prefs?: ReturnType<typeof fakePrefs>; newCharacter?: boolean } = {},
  ): Parameters<typeof plugin.register>[1] {
    return {
      flags,
      core: neoCore,
      state: { options: opts },
      log: () => undefined,
      ...(extra.prefs ? { prefs: extra.prefs } : {}),
      ...(extra.newCharacter !== undefined ? { newCharacter: extra.newCharacter } : {}),
    };
  }

  /**
   * Fire the capture half the way the host actually does it.
   *
   * NO `state`, and that is the point of this helper existing. The host composes
   * every mod's hooks BEFORE it starts the game - the composed ModHooks is an
   * argument to startGame - so `hooks()` is called with a context that has no
   * `state` on it, ever. An earlier draft of this test passed one, and the mod
   * read `ctx.state.options`: every assertion here passed against a context
   * shape the game never produces, and the feature would have been dead on
   * arrival with a green suite behind it.
   */
  function change(
    opts: neoCore.OptionState,
    flags: Record<string, boolean>,
    prefs: ReturnType<typeof fakePrefs>,
  ): void {
    const hooks = plugin.hooks({ flags, core: neoCore, prefs, log: () => undefined });
    hooks.optionsChanged?.(opts.snapshot());
  }

  const ON = { "qol.rememberSettings": true, "qol.rememberCheats": false };
  const WITH_CHEATS = { "qol.rememberSettings": true, "qol.rememberCheats": true };

  it("installs no hook at all when the toggle is off", () => {
    /* "A disabled mod's patches DO NOT EXIST": off means ABSENT, not a function
     * that checks the flag and returns. */
    const hooks = plugin.hooks({
      flags: { "qol.rememberSettings": false },
      core: neoCore,
      prefs: fakePrefs(),
    });
    expect(hooks.optionsChanged).toBeUndefined();
  });

  it("stores what the player chose, and applies it to the next character", () => {
    const prefs = fakePrefs();
    const first = new neoCore.OptionState();
    expect(first.get("use_sound")).toBe(false);
    first.set("use_sound", true);
    first.hitpointWarn = 7;
    first.delayFactor = 12;
    change(first, ON, prefs);

    /* A brand-new character: table defaults, nothing carried in memory. */
    const next = new neoCore.OptionState();
    expect(next.get("use_sound")).toBe(false);
    plugin.register(menuHost([]), ctxFor(next, ON, { prefs, newCharacter: true }));
    expect(next.get("use_sound")).toBe(true);
    expect(next.hitpointWarn).toBe(7);
    expect(next.delayFactor).toBe(12);
  });

  it("reads a pre-removal preference blob and drops moved fields on the next write", () => {
    const prefs = fakePrefs();
    const options = {
      v: 1,
      values: { use_sound: true },
      hitpointWarn: 7,
      delayFactor: 12,
      lazymoveDelay: 2,
    };
    prefs.set({
      v: 2,
      options,
      hideRepeatShortcuts: true,
      display: { v: 2, zoomIndex: 8, interfaceZoomIndex: 2, mapDetail: 1 },
      firstEncounter: { characterKey: "old", monsters: [1], artifacts: [2] },
      subwindowZoom: { inventory: { step: 3, manual: true } },
    });

    const next = new neoCore.OptionState();
    plugin.register(menuHost([]), ctxFor(next, ON, { prefs, newCharacter: true }));
    expect(next.get("use_sound")).toBe(true);
    expect(next.hitpointWarn).toBe(7);
    expect(next.delayFactor).toBe(12);
    expect(next.lazymoveDelay).toBe(2);

    change(next, ON, prefs);
    expect(prefs.get()).toEqual({
      v: 2,
      options: expect.objectContaining({
        v: 1,
        values: expect.objectContaining({ use_sound: true }),
        hitpointWarn: 7,
        delayFactor: 12,
        lazymoveDelay: 2,
      }),
      hideRepeatShortcuts: true,
    });
  });

  it("leaves a LOADED character exactly as its save had it", () => {
    /* The whole reason ctx.newCharacter exists. A player who set one character
     * up one way must not have it rewritten because they changed something on a
     * different character. */
    const prefs = fakePrefs();
    const first = new neoCore.OptionState();
    first.set("use_sound", true);
    change(first, ON, prefs);

    const loaded = new neoCore.OptionState();
    plugin.register(menuHost([]), ctxFor(loaded, ON, { prefs, newCharacter: false }));
    expect(loaded.get("use_sound")).toBe(false);
  });

  it("does nothing when the host cannot say whether it is new", () => {
    const prefs = fakePrefs();
    const first = new neoCore.OptionState();
    first.set("use_sound", true);
    change(first, ON, prefs);

    const next = new neoCore.OptionState();
    plugin.register(menuHost([]), ctxFor(next, ON, { prefs }));
    expect(next.get("use_sound")).toBe(false);
  });

  it("never remembers a cheat option by default", () => {
    /* The damage this prevents: cheat_live forces score_live, and a character
     * carrying score_live is barred from the score list for a choice the player
     * made on somebody else. */
    const prefs = fakePrefs();
    const first = new neoCore.OptionState();
    first.set("cheat_live", true);
    expect(first.get("cheat_live")).toBe(true);
    expect(first.get("score_live")).toBe(true); // the engine's own coupling
    first.set("use_sound", true);
    change(first, ON, prefs);

    const stored = readRememberedSettings(prefs.get());
    expect(stored).not.toBeNull();
    if (!stored) throw new Error("remembered settings missing");
    expect(stored.values).not.toHaveProperty("cheat_live");
    expect(stored.values).not.toHaveProperty("score_live");
    expect(stored.values["use_sound"]).toBe(true);

    const next = new neoCore.OptionState();
    plugin.register(menuHost([]), ctxFor(next, ON, { prefs, newCharacter: true }));
    expect(next.get("cheat_live")).toBe(false);
    expect(next.get("score_live")).toBe(false);
    expect(next.get("use_sound")).toBe(true);
  });

  it("remembers cheat options when the player asks for it", () => {
    const prefs = fakePrefs();
    const first = new neoCore.OptionState();
    first.set("cheat_live", true);
    change(first, WITH_CHEATS, prefs);

    const next = new neoCore.OptionState();
    plugin.register(menuHost([]), ctxFor(next, WITH_CHEATS, { prefs, newCharacter: true }));
    expect(next.get("cheat_live")).toBe(true);
    /* And the engine's coupling still applies on the way back in, so the score
     * twin is set by core rather than by anything this mod stored. */
    expect(next.get("score_live")).toBe(true);
  });

  it("stops applying stored cheats the moment the toggle goes off", () => {
    /* Filtered on the way IN as well as OUT. Turning the toggle off has to take
     * effect against what is ALREADY stored, or the player's only remedy would
     * be to find and clear the storage themselves. */
    const prefs = fakePrefs();
    const first = new neoCore.OptionState();
    first.set("cheat_live", true);
    change(first, WITH_CHEATS, prefs);
    expect(readRememberedSettings(prefs.get())?.values["cheat_live"]).toBe(true);

    const next = new neoCore.OptionState();
    plugin.register(menuHost([]), ctxFor(next, ON, { prefs, newCharacter: true }));
    expect(next.get("cheat_live")).toBe(false);
  });

  it("never stores a birth option, because it could never apply one", () => {
    /* Birth options are frozen at creation and OptionState.set refuses them.
     * They carry forward by the game's own route - the birth options editor is
     * seeded from the last character - not through here. */
    const prefs = fakePrefs();
    const first = new neoCore.OptionState({ overrides: { birth_force_descend: true } });
    expect(first.get("birth_force_descend")).toBe(true);
    change(first, ON, prefs);
    const stored = readRememberedSettings(prefs.get());
    expect(stored).not.toBeNull();
    if (!stored) throw new Error("remembered settings missing");
    expect(stored.values).not.toHaveProperty("birth_force_descend");
  });

  it("ignores a stored blob it does not understand", () => {
    const prefs = fakePrefs();
    prefs.set({ v: 99, values: { use_sound: true } });
    const next = new neoCore.OptionState();
    plugin.register(menuHost([]), ctxFor(next, ON, { prefs, newCharacter: true }));
    expect(next.get("use_sound")).toBe(false);
  });

  it("survives an option name this engine no longer has", () => {
    /* A stored name from an older engine. set() answers false and the mod moves
     * on: the option is gone, so there is nothing to restore. */
    const prefs = fakePrefs();
    prefs.set({
      v: 1,
      values: { an_option_that_was_removed: true, use_sound: true },
      hitpointWarn: 3,
      delayFactor: 40,
      lazymoveDelay: 0,
    });
    const next = new neoCore.OptionState();
    expect(() =>
      plugin.register(menuHost([]), ctxFor(next, ON, { prefs, newCharacter: true })),
    ).not.toThrow();
    expect(next.get("use_sound")).toBe(true);
  });

  it("is inert on a host too old to have ctx.prefs", () => {
    /* The engine range should refuse this pairing outright; if it somehow does
     * not, the mod must not throw at boot. */
    const opts = new neoCore.OptionState();
    expect(plugin.hooks({ flags: ON, core: neoCore }).optionsChanged).toBeUndefined();
    expect(() =>
      plugin.register(menuHost([]), {
        flags: ON,
        core: neoCore,
        state: { options: opts },
        newCharacter: true,
      }),
    ).not.toThrow();
  });
});
