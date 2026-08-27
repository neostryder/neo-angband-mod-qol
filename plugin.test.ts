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

import { describe, expect, it } from "vitest";
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
import plugin, {
  hoverCardContent,
  hoverCardText,
  hoverCaveGrid,
  hoverCellAt,
  HOVER_DWELL_MS,
  TOUCH_HOLD_MS,
} from "./plugin";

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
  dir: number;
  grid: Loc;
} {
  const { state } = startGame(pack, { seed: 20260729, depth: 2 });
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
  return { state, dir: chosen.dir, grid: chosen.grid };
}

describe("the qol mod's entry point", () => {
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
    plugin.register(null, ctxFor(next, ON, { prefs, newCharacter: true }));
    expect(next.get("use_sound")).toBe(true);
    expect(next.hitpointWarn).toBe(7);
    expect(next.delayFactor).toBe(12);
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
    plugin.register(null, ctxFor(loaded, ON, { prefs, newCharacter: false }));
    expect(loaded.get("use_sound")).toBe(false);
  });

  it("does nothing when the host cannot say whether it is new", () => {
    const prefs = fakePrefs();
    const first = new neoCore.OptionState();
    first.set("use_sound", true);
    change(first, ON, prefs);

    const next = new neoCore.OptionState();
    plugin.register(null, ctxFor(next, ON, { prefs }));
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

    const stored = prefs.get() as { values: Record<string, boolean> };
    expect(stored.values).not.toHaveProperty("cheat_live");
    expect(stored.values).not.toHaveProperty("score_live");
    expect(stored.values["use_sound"]).toBe(true);

    const next = new neoCore.OptionState();
    plugin.register(null, ctxFor(next, ON, { prefs, newCharacter: true }));
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
    plugin.register(null, ctxFor(next, WITH_CHEATS, { prefs, newCharacter: true }));
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
    expect((prefs.get() as { values: Record<string, boolean> }).values["cheat_live"]).toBe(true);

    const next = new neoCore.OptionState();
    plugin.register(null, ctxFor(next, ON, { prefs, newCharacter: true }));
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
    const stored = prefs.get() as { values: Record<string, boolean> };
    expect(stored.values).not.toHaveProperty("birth_force_descend");
  });

  it("ignores a stored blob it does not understand", () => {
    const prefs = fakePrefs();
    prefs.set({ v: 99, values: { use_sound: true } });
    const next = new neoCore.OptionState();
    plugin.register(null, ctxFor(next, ON, { prefs, newCharacter: true }));
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
      plugin.register(null, ctxFor(next, ON, { prefs, newCharacter: true })),
    ).not.toThrow();
    expect(next.get("use_sound")).toBe(true);
  });

  it("is inert on a host too old to have ctx.prefs", () => {
    /* The engine range should refuse this pairing outright; if it somehow does
     * not, the mod must not throw at boot. */
    const opts = new neoCore.OptionState();
    expect(plugin.hooks({ flags: ON, core: neoCore }).optionsChanged).toBeUndefined();
    expect(() =>
      plugin.register(null, {
        flags: ON,
        core: neoCore,
        state: { options: opts },
        newCharacter: true,
      }),
    ).not.toThrow();
  });
});

/**
 * qol.mapHoverCards: the pure geometry and content classifier, tested
 * directly - the DOM wiring itself (installMapHoverCards) is not unit-tested,
 * the same split this game's own mapview.ts draws between pure scan/scale
 * arithmetic and the main.ts wiring around it.
 */
describe("qol.mapHoverCards: pixel/cell/cave geometry", () => {
  it("maps a client point to a cell, centred in a box with room to spare", () => {
    /* 800x480 box: scale = min(800/(16*80), 480/(24*24)) = min(0.625, 0.833) =
     * 0.625 -> cellW = floor(16*0.625) = 10, cellH = floor(24*0.625) = 15.
     * Grid is 80*10=800 wide (offsetX 0) and 24*15=360 tall (offsetY (480-360)/2=60). */
    const rect = { left: 100, top: 200, width: 800, height: 480 };
    expect(hoverCellAt(rect, 100, 260)).toEqual({ col: 0, row: 0 });
    expect(hoverCellAt(rect, 105, 265)).toEqual({ col: 0, row: 0 });
    expect(hoverCellAt(rect, 115, 275)).toEqual({ col: 1, row: 1 });
  });

  it("is null outside the box, including the letterboxed margin", () => {
    const rect = { left: 100, top: 200, width: 800, height: 480 };
    expect(hoverCellAt(rect, 100, 205)).toBeNull(); // inside the top margin
    expect(hoverCellAt(rect, 50, 260)).toBeNull(); // left of the canvas rect
    expect(hoverCellAt(rect, 100 + 800, 260)).toBeNull(); // past the last column
  });

  it("is null for a degenerate (zero-size) rect", () => {
    expect(hoverCellAt({ left: 0, top: 0, width: 0, height: 100 }, 0, 0)).toBeNull();
  });

  it("inverts buildOverview's scaling for a level that fits the box", () => {
    /* width=40,height=20 both fit under TERM_COLS-2=78 / TERM_ROWS-2=22, so the
     * box IS the level 1:1 (mapW=40, mapH=20) - screen cell (c+1, r+1) is
     * exactly cave (c, r). */
    expect(hoverCaveGrid(1, 1, 40, 20)).toEqual({ x: 0, y: 0 });
    expect(hoverCaveGrid(40, 20, 40, 20)).toEqual({ x: 39, y: 19 });
  });

  it("is null on the border or outside the box", () => {
    expect(hoverCaveGrid(0, 1, 40, 20)).toBeNull(); // left border column
    expect(hoverCaveGrid(1, 0, 40, 20)).toBeNull(); // top border row
    expect(hoverCaveGrid(41, 1, 40, 20)).toBeNull(); // past the level's own width
  });

  it("is null off a zero-size level", () => {
    expect(hoverCaveGrid(1, 1, 0, 20)).toBeNull();
  });

  it("picks a representative cave cell when several collapse onto one screen cell", () => {
    /* width=200 > TERM_COLS-2=78, so mapW=78 and several cave columns share a
     * screen column. Screen col 1 (bx=0) covers the bucket floor(x*78/200)=0,
     * i.e. cave x in [0, 2]; this picks the bucket's centre. */
    const grid = hoverCaveGrid(1, 1, 200, 20);
    expect(grid).not.toBeNull();
    expect(grid!.x).toBeGreaterThanOrEqual(0);
    expect(grid!.x).toBeLessThan(3);
  });
});

describe("qol.mapHoverCards: context-sensitive content", () => {
  const grid = { x: 5, y: 5 };

  it("keeps the published dwell and hold timings", () => {
    expect(HOVER_DWELL_MS).toBe(2000);
    expect(TOUCH_HOLD_MS).toBe(1000);
  });

  it("shows terrain for plain ground", () => {
    const core = {
      describeLookGrid: () => ({ text: "You see a granite wall.", mon: null }),
      knownPile: () => [],
    };
    expect(hoverCardContent(core, {} as GameState, grid)).toEqual({
      kind: "terrain",
      title: "Terrain",
      text: "You see a granite wall.",
    });
    expect(hoverCardText(core, {} as GameState, grid)).toBe("You see a granite wall.");
  });

  it("labels an obvious monster as a creature", () => {
    const core = {
      describeLookGrid: () => ({
        text: "You see a wounded jackal, 3 S, 1 W of you.",
        mon: { name: "jackal" },
      }),
      knownPile: () => [],
    };
    expect(hoverCardContent(core, {} as GameState, grid)).toEqual({
      kind: "creature",
      title: "Creature",
      text: "You see a wounded jackal, 3 S, 1 W of you.",
    });
  });

  it("labels a remembered floor object as an item", () => {
    const core = {
      describeLookGrid: () => ({ text: "You see a Dagger, 2 S of you.", mon: null }),
      knownPile: () => [{ kind: "dagger" }],
    };
    expect(hoverCardContent(core, {} as GameState, grid)).toEqual({
      kind: "item",
      title: "Item",
      text: "You see a Dagger, 2 S of you.",
    });
  });

  it("labels the player's own grid as character", () => {
    const core = {
      describeLookGrid: () => ({ text: "You are on an open floor.", mon: null }),
      knownPile: () => [],
    };
    const state = { actor: { grid: { x: 5, y: 5 } } } as unknown as GameState;
    expect(hoverCardContent(core, state, grid)?.kind).toBe("character");
  });

  it("labels a shop entrance when the feature carries a shopnum", () => {
    const core = {
      describeLookGrid: () => ({ text: "You see the General Store.", mon: null }),
      knownPile: () => [],
    };
    const state = {
      chunk: { width: 10, height: 10, feature: () => ({ shopnum: 1 }) },
    } as unknown as GameState;
    expect(hoverCardContent(core, state, grid)?.kind).toBe("shop");
  });

  it("labels a visible trap when the engine exposes the predicate", () => {
    const core = {
      describeLookGrid: () => ({ text: "You see a pit trap.", mon: null }),
      knownPile: () => [],
      squareIsVisibleTrap: () => true,
    };
    expect(hoverCardContent(core, {} as GameState, grid)?.kind).toBe("trap");
  });

  it("returns null when the look API has nothing to say", () => {
    const core = {
      describeLookGrid: () => ({ text: "  ", mon: null }),
      knownPile: () => [],
    };
    expect(hoverCardContent(core, {} as GameState, grid)).toBeNull();
  });
});
