/**
 * No lava in town, driven the way the host drives it: plugin.engineHooks
 * reads the engine off the context, and generateLevel calls levelGenerated
 * after the builder accepts the level.
 */

import { describe, expect, it } from "vitest";
import { loadPackFile as loadJson, loadPackRecords as loadRecords } from "@rpgm-tools/neo-angband-content/pack";
import {
  ArtifactState,
  FEAT,
  FeatureRegistry,
  MonAllocTable,
  ObjAllocState,
  ObjRegistry,
  Rng,
  bindConstants,
  bindMonsters,
  createDungeonProfiles,
  createRoomRegistry,
  generateLevel,
  loadRoomTemplates,
  loadVaults,
  loc,
  resolvePits,
} from "@rpgm-tools/neo-angband-core";
import type { Gen, GenDeps, MakeDeps, MonPlaceDeps } from "@rpgm-tools/neo-angband-core";
import * as neoCore from "@rpgm-tools/neo-angband-core";
import plugin from "./plugin";
import { clearTownLava, type TownLevel } from "./town-lava";

const ENGINE = {
  api: "test",
  core: neoCore,
  state: undefined,
  registries: undefined,
  registry: undefined,
};

function engineHooks(flags: Readonly<Record<string, boolean>>) {
  return plugin.engineHooks?.({ id: "qol", flags, engine: ENGINE });
}

const terrain = loadRecords("terrain");
const reg = new FeatureRegistry(terrain as never);
const constants = bindConstants(loadJson("constants") as never);
const roomTemplates = loadRoomTemplates(loadRecords("room_template") as never);
const vaults = loadVaults(loadRecords("vault") as never, constants.maxDepth);
const objPack = {
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
};
const monPack = {
  pain: loadRecords("pain"),
  blowMethods: loadRecords("blow_methods"),
  blowEffects: loadRecords("blow_effects"),
  monsterSpells: loadRecords("monster_spell"),
  monsterBases: loadRecords("monster_base"),
  monsters: loadRecords("monster"),
  summons: loadRecords("summon"),
  pits: loadRecords("pit"),
};

/** Fresh per call: a shared artifact or monster count from an earlier seed would change later draws. */
function makeDeps(): GenDeps {
  const objReg = new ObjRegistry(objPack as never);
  const objDeps: MakeDeps = {
    reg: objReg,
    alloc: new ObjAllocState(objReg, constants),
    constants,
    artifacts: new ArtifactState(objReg.artifacts.length),
    noArtifacts: false,
  };
  const monReg = bindMonsters(monPack as never, { maxSight: constants.maxSight });
  const monDeps: MonPlaceDeps = {
    table: new MonAllocTable(monReg.races, {
      maxDepth: constants.maxDepth,
      oodChance: constants.oodMonsterChance,
      oodAmount: constants.oodMonsterAmount,
    }),
    pits: resolvePits(monReg),
  };
  return {
    reg,
    constants,
    rooms: createRoomRegistry({ templates: roomTemplates, vaults }),
    profiles: createDungeonProfiles(loadRecords("dungeon_profile") as never),
    objDeps,
    monDeps,
  };
}

const townHook = engineHooks({ "qol.noTownLava": true })?.["levelGenerated"];
if (typeof townHook !== "function") throw new Error("qol.noTownLava did not install levelGenerated");
const levelGenerated = townHook as (gen: unknown, quest: boolean) => boolean;

function hookedDeps(returns: boolean[]): GenDeps {
  const deps = makeDeps();
  deps.hooks = {
    levelGenerated(gen, quest) {
      const ok = levelGenerated(gen, quest);
      returns.push(ok);
      return ok;
    },
  };
  return deps;
}

function flagsOf(g: Gen, x: number, y: number): string {
  return Array.from(g.c.info(loc(x, y)).bits).join(",");
}

function placed(g: Gen): { spot: { x: number; y: number } | null; mons: number[][]; objs: number[][] } {
  return {
    spot: g.playerSpot ? { x: g.playerSpot.x, y: g.playerSpot.y } : null,
    mons: g.monsters.map((m) => [m.grid.y, m.grid.x, m.mon.race.ridx]),
    objs: g.objects.map((o) => [o.grid.y, o.grid.x, o.obj.kind.kidx, o.obj.number]),
  };
}

function countLava(g: Gen): number {
  let lava = 0;
  for (let y = 0; y < g.c.height; y++) {
    for (let x = 0; x < g.c.width; x++) {
      if (g.c.feat(loc(x, y)) === FEAT.LAVA) lava++;
    }
  }
  return lava;
}

/** Former lava is granite. Every other square, the residents, and the RNG stay put. */
function assertTown(faithful: Gen, hooked: Gen, label: string): number {
  expect(hooked.c.height, label).toBe(faithful.c.height);
  expect(hooked.c.width, label).toBe(faithful.c.width);
  expect(hooked.c.depth, label).toBe(0);
  expect(hooked.rng.getState(), label).toEqual(faithful.rng.getState());
  expect(placed(hooked), label).toEqual(placed(faithful));
  let lava = 0;
  for (let y = 0; y < faithful.c.height; y++) {
    for (let x = 0; x < faithful.c.width; x++) {
      const grid = loc(x, y);
      const before = faithful.c.feat(grid);
      const after = hooked.c.feat(grid);
      if (before === FEAT.LAVA) {
        lava++;
        expect(after, `${label} ${String(x)},${String(y)}`).toBe(FEAT.GRANITE);
      } else {
        expect(after, `${label} ${String(x)},${String(y)}`).toBe(before);
        expect(flagsOf(hooked, x, y), `${label} flags ${String(x)},${String(y)}`).toBe(flagsOf(faithful, x, y));
      }
    }
  }
  expect(countLava(hooked), label).toBe(0);
  return lava;
}

function assertSameLevel(faithful: Gen, hooked: Gen, label: string): void {
  expect(hooked.c.height, label).toBe(faithful.c.height);
  expect(hooked.c.width, label).toBe(faithful.c.width);
  expect(hooked.c.depth, label).toBe(faithful.c.depth);
  expect(hooked.c.depth, label).not.toBe(0);
  expect(hooked.rng.getState(), label).toEqual(faithful.rng.getState());
  expect(placed(hooked), label).toEqual(placed(faithful));
  for (let y = 0; y < faithful.c.height; y++) {
    for (let x = 0; x < faithful.c.width; x++) {
      expect(hooked.c.feat(loc(x, y)), `${label} ${String(x)},${String(y)}`).toBe(faithful.c.feat(loc(x, y)));
      expect(flagsOf(hooked, x, y), `${label} flags ${String(x)},${String(y)}`).toBe(flagsOf(faithful, x, y));
    }
  }
}

describe("no lava in town", () => {
  it("replaces lava on a depth-0 chunk and leaves every other depth alone", () => {
    const cells: number[][] = [
      [FEAT.FLOOR, FEAT.LAVA, FEAT.GRANITE],
      [FEAT.LAVA, FEAT.PERM, FEAT.FLOOR],
    ];
    const seen: number[] = [];
    const level: TownLevel = {
      c: {
        depth: 0,
        height: 2,
        width: 3,
        feat: (grid) => cells[grid.y]?.[grid.x] ?? -1,
        setFeat: (grid, feat) => {
          const row = cells[grid.y];
          if (!row) throw new Error(`missing row ${String(grid.y)}`);
          row[grid.x] = feat;
          seen.push(feat);
        },
      },
    };
    expect(clearTownLava(level, neoCore)).toBe(true);
    expect(seen).toEqual([FEAT.GRANITE, FEAT.GRANITE]);
    expect(cells).toEqual([
      [FEAT.FLOOR, FEAT.GRANITE, FEAT.GRANITE],
      [FEAT.GRANITE, FEAT.PERM, FEAT.FLOOR],
    ]);

    const dungeon: TownLevel = {
      c: {
        depth: 5,
        height: 1,
        width: 1,
        feat: () => FEAT.LAVA,
        setFeat: () => {
          throw new Error("a dungeon square was rewritten");
        },
      },
    };
    expect(clearTownLava(dungeon, neoCore)).toBe(true);
  });

  it("installs nothing while the setting is off", () => {
    expect(engineHooks({})).toBeUndefined();
    expect(engineHooks({ "qol.noTownLava": false })).toBeUndefined();
    expect(engineHooks({ "qol.gearComparison": true })).toBeUndefined();
  });

  it("strips town lava across seeds and leaves the unmodded stream alone", () => {
    const returns: boolean[] = [];
    let hookedRuns = 0;
    let lavaTown: Gen | null = null;
    let lavaSquares = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const faithful = generateLevel(new Rng(seed), 0, makeDeps());
      const hooked = generateLevel(new Rng(seed), 0, hookedDeps(returns));
      hookedRuns++;
      const lava = assertTown(faithful, hooked, `town seed ${String(seed)}`);
      lavaSquares += lava;
      if (lava > 0 && lavaTown === null) lavaTown = faithful;
    }
    expect(lavaSquares, "no sampled town contained lava").toBeGreaterThan(0);
    expect(lavaTown).not.toBeNull();

    const nightFaithful = generateLevel(new Rng(7), 0, makeDeps(), { daytime: false });
    const nightHooked = generateLevel(new Rng(7), 0, hookedDeps(returns), { daytime: false });
    hookedRuns++;
    assertTown(nightFaithful, nightHooked, "town seed 7 at night");

    const stored = lavaTown as Gen;
    const lavaBefore = countLava(stored);
    const againFaithful = generateLevel(new Rng(99), 0, makeDeps(), { townLayout: stored.c });
    const againHooked = generateLevel(new Rng(99), 0, hookedDeps(returns), { townLayout: stored.c });
    hookedRuns++;
    expect(countLava(stored), "re-entry rewrote the stored town").toBe(lavaBefore);
    const againLava = assertTown(againFaithful, againHooked, "town re-entry");
    expect(againLava).toBe(lavaBefore);

    const dungeons: readonly [number, number][] = [
      [1, 100],
      [15, 200],
      [15, 300],
      [15, 400],
    ];
    for (const [depth, seed] of dungeons) {
      const faithful = generateLevel(new Rng(seed), depth, makeDeps());
      const hooked = generateLevel(new Rng(seed), depth, hookedDeps(returns));
      hookedRuns++;
      assertSameLevel(faithful, hooked, `d${String(depth)} seed ${String(seed)}`);
    }

    expect(returns).toHaveLength(hookedRuns);
    expect(returns).not.toContain(false);
  }, 60_000);
});
