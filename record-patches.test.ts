import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPackFile, loadPackRecords } from "@rpgm-tools/neo-angband-content/pack";
import {
  api2PolicyEffects,
  composePacks,
  expandSections,
  resolveSectionState,
  validateManifest,
  recordKey,
} from "@rpgm-tools/neo-angband-mod-sdk";
import type { FileContribution, JsonRecord, PackContent } from "@rpgm-tools/neo-angband-mod-sdk";
import {
  ELEM,
  EffectRegistry,
  FlavorKnowledge,
  StoreBehaviourRegistry,
  NOOP_FLAVOR_AWARE_DEPS,
  attachGameEnv,
  basicPlayerActor,
  buildObjectEffectChain,
  buildRuneList,
  objectRunesKnown,
  registerCoreHandlers,
  registerItemHandlers,
  sourcePlayer,
  storeCreateRandom,
  tvalFindName,
  ArtifactState,
  FEAT,
  KF,
  ObjAllocState,
  ObjRegistry,
  Rng,
  TV,
  StoreRegistry,
  bindConstants,
  bindPlayer,
  bindProjections,
  bindStoreRuntime,
  doRandart,
  blankPlayer,
  gearAdd,
  makeRuneEnv,
  newGear,
  objectPrep,
  registerBookKinds,
  storeSell,
} from "@rpgm-tools/neo-angband-core";
import type { GameState, MakeDeps, ObjPackJson, ObjectKind, PlayerPackRecords, StoreRecordJson } from "@rpgm-tools/neo-angband-core";
import { invenDamage } from "./node_modules/@rpgm-tools/neo-angband-core/dist/game/project-obj.js";
import plugin from "./plugin";

const manifest = validateManifest(JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8")));
const constants = bindConstants(loadPackFile("constants") as never);
const players = bindPlayer(Object.fromEntries(Object.entries({
  races: "p_race", classes: "class", properties: "player_property", timed: "player_timed",
  shapes: "shape", bodies: "body", history: "history", realms: "realm",
}).map(([key, file]) => [key, loadPackRecords(file)])) as unknown as PlayerPackRecords);

function records(file: string, sections: readonly string[] = [], withMod = true): JsonRecord[] {
  const base: PackContent = {
    manifest: { id: "core", name: "Core", version: "1.23.0-beta.4", shape: "content" },
    files: { [file]: { records: loadPackRecords(file) as JsonRecord[] } },
  };
  const mod: PackContent = {
    manifest,
    files: { [file]: JSON.parse(readFileSync(new URL(`./${file}.json`, import.meta.url), "utf8")) as FileContribution },
  };
  const state = resolveSectionState([manifest], { qol: Object.fromEntries(sections.map((id) => [id, true])) }, new Set(["core", "qol"]));
  const units = expandSections(withMod ? [base, mod] : [base], (id, section) => state.get(id)?.get(section) === true);
  return [...composePacks(units.map((unit) => unit.content)).get(file)!.values()].map((record) => record.value);
}

function registry(sections: readonly string[] = [], withMod = true): ObjRegistry {
  const reg = new ObjRegistry(Object.fromEntries(Object.entries({
    objectBase: "object_base", object: "object", egoItem: "ego_item", artifact: "artifact",
    curse: "curse", brand: "brand", slay: "slay", activation: "activation",
    objectProperty: "object_property", flavor: "flavor",
  }).map(([key, file]) => [key, ["object_base", "object"].includes(file) && withMod
    ? { ...loadPackFile(file) as object, records: records(file, sections) }
    : loadPackFile(file)])) as unknown as ObjPackJson);
  registerBookKinds(reg, players.classes);
  return reg;
}

describe("Attunement devices", () => {
  const enabled = ["qol-attunement"];
  const deviceKinds = (reg: ObjRegistry) => reg.kinds.filter((kind) => kind.name === "Attunement");

  it("adds both device records only when their content setting is on", () => {
    expect(manifest.sections?.find((section) => section.id === "qol-attunement")?.default).toBe(false);
    expect(records("object")).toEqual(loadPackRecords("object"));
    expect(deviceKinds(registry())).toEqual([]);
    expect(deviceKinds(registry(enabled)).map((kind) => kind.tval)).toEqual([TV.STAFF, TV.ROD]);
    const added = records("object", enabled).filter((record) => record.name === "Attunement");
    expect(added).toMatchObject([
      { type: "staff", level: 20, cost: 1600, alloc: { common: 30, minmax: "20 to 100" }, charges: "5+d5", effect: [{ eff: "ATTUNE" }] },
      { type: "rod", level: 30, cost: 3000, alloc: { common: 15, minmax: "50 to 100" }, time: "100", effect: [{ eff: "ATTUNE" }] },
    ]);
  });

  for (const tval of [TV.STAFF, TV.ROD]) {
    it(`learns one rune per wearable use and a potion flavor through device ${String(tval)}`, () => {
      const reg = registry(enabled);
      const rng = new Rng(389);
      const p = player();
      p.objKnown.toH = 0;
      p.objKnown.toD = 0;
      const runeEnv = makeRuneEnv(() => null, (value) => rng.randcalcVaries(value));
      const flavor = new FlavorKnowledge(reg.ordinaryKindCount);
      const state = { rng, actor: { player: p }, gear: newGear(), floor: new Map(), runeEnv,
        isAware: (kind: ObjectKind) => flavor.isAware(kind) } as GameState;
      const effects = new EffectRegistry();
      registerCoreHandlers(effects);
      registerItemHandlers(effects);
      state.effectInject = { lookupEffect: (name) => effects.isRegistered(name) ? name : null };
      const device = objectPrep(rng, reg, constants, deviceKinds(reg).find((kind) => kind.tval === tval)!, 0, "average");
      const sword = objectPrep(rng, reg, constants, reg.kinds.find((kind) => kind.tval === TV.SWORD)!, 0, "average");
      sword.toH = 5;
      sword.toD = 5;
      const potion = objectPrep(rng, reg, constants, reg.kinds.find((kind) => kind.tval === TV.POTION)!, 0, "average");
      const run = (target: typeof sword | null) => effects.effectDo(buildObjectEffectChain(device.effect!, state), attachGameEnv({ rng }, {
        state, cast: { projections: bindProjections(loadPackRecords("projection") as never), maxRange: 20, playerActor: basicPlayerActor(state) },
        item: { getItem: (request) => target && request.tester(target) ? target : null },
        flavor, flavorDeps: NOOP_FLAVOR_AWARE_DEPS,
      }), { origin: sourcePlayer() });
      // effect_handler_IDENTIFY and object_learn_unknown_rune teach one rune per use.
      expect(run(sword)).toBe(true);
      expect(p.objKnown.toH + p.objKnown.toD).toBe(1);
      expect(objectRunesKnown(p, runeEnv, sword, buildRuneList(runeEnv))).toBe(false);
      expect(run(sword)).toBe(true);
      expect(p.objKnown.toH + p.objKnown.toD).toBe(2);
      expect(objectRunesKnown(p, runeEnv, sword, buildRuneList(runeEnv))).toBe(true);
      expect(run(sword)).toBe(false);
      expect(flavor.isAware(potion.kind)).toBe(false);
      expect(run(potion)).toBe(true);
      expect(flavor.isAware(potion.kind)).toBe(true);
      expect(run(potion)).toBe(false);
      expect(run(null)).toBe(false);
    });
  }

  it("excludes both bound kinds in every selling store, including the black market", () => {
    const reg = registry(enabled);
    const policies = plugin.policies({ id: "qol", flags: { "qol.attunement": true }, settings: {} })!;
    const selectors = api2PolicyEffects(policies, (capability) => manifest.capabilities?.includes(capability) === true).registrations.storeAllocationExclude!;
    expect(selectors).toHaveLength(2);
    const keys = new Set(selectors.map((selector) => selector.key));
    const behaviour = new StoreBehaviourRegistry();
    behaviour.registerAllocationFilter((kind) => !keys.has(recordKey("object", { type: tvalFindName(kind.tval), name: kind.name })!));
    for (const kind of deviceKinds(reg)) {
      for (const bound of new StoreRegistry(loadPackRecords("store") as unknown as StoreRecordJson[], reg).stores.filter((store) => store.feat !== FEAT.HOME)) {
        const rng = new Rng(389);
        const store = bindStoreRuntime(bound, rng, constants.storeInvenMax);
        store.normalTable = [kind];
        const alloc = new ObjAllocState(reg, constants);
        alloc.getObjNum = () => kind;
        const deps: MakeDeps = { reg, constants, alloc, artifacts: new ArtifactState(reg.artifacts.length), noArtifacts: true };
        const ctx = { rng, deps, maxDepth: 50, stores: [store], behaviour };
        expect(storeCreateRandom(ctx, store), `${String(kind.tval)} at ${store.featName}`).toBe(false);
        expect(store.stock).toEqual([]);
        expect(storeCreateRandom({ ...ctx, behaviour: new StoreBehaviourRegistry() }, store)).toBe(true);
        expect(store.stock[0]?.kind).toBe(kind);
      }
    }
  });
});

describe("random artifact generation from the QoL setting", () => {
  const randartRegistry = () => {
    const reg = registry([], false);
    reg.projections = bindProjections(loadPackRecords("projection") as never);
    return reg;
  };
  const generate = (multiplier?: number) => {
    const settings = Object.freeze(multiplier === undefined ? {} : { "qol.randartSetSize": multiplier });
    const policy = plugin.policies({ id: "qol", flags: {}, settings })?.randartSetSize;
    return doRandart(randartRegistry(), constants, 390, false, undefined,
      policy ? { sizeMultiplier: policy.multiplier } : undefined);
  };

  it("keeps do_randart byte-identical at 1x", () => {
    const faithful = doRandart(randartRegistry(), constants, 390, false);
    expect(JSON.stringify(generate(1))).toBe(JSON.stringify(faithful));
    expect(JSON.stringify(generate())).toBe(JSON.stringify(faithful));
  });

  it.each([2, 3, 4])("builds %sx the randomizable count with inverse allocation chances", (multiplier) => {
    const reg = registry([], false);
    const fixed = reg.artifacts.filter((art, index) => art && (index === reg.artifacts.length - 1 || art.name.includes("The One Ring") || reg.lookupKind(art.tval, art.sval)?.kindFlags.has(KF.QUEST_ART)));
    const count = reg.artifacts.filter(Boolean).length - fixed.length;
    const arts = generate(multiplier);
    expect(arts.filter(Boolean)).toHaveLength(count * multiplier + fixed.length);
    for (const art of fixed) expect(arts[art!.aidx]).toEqual(art);
    const random = arts.filter((art) => art && !fixed.some((entry) => entry!.aidx === art.aidx));
    expect(random).toHaveLength(count * multiplier);
    for (const art of random) expect(art!.allocationScale).toBe(1 / multiplier);
  });
});

function player() {
  const race = players.raceByName("Human")!;
  return blankPlayer(race, players.classByName("Warrior")!, players.bodies[race.body]!);
}

function attack(reg: ObjRegistry, kind: ObjectKind, element: number, seed = 17) {
  const rng = new Rng(seed);
  const p = player();
  const gear = newGear();
  const obj = objectPrep(rng, reg, constants, kind, 0, "minimise");
  obj.number = 5;
  const handle = gearAdd(gear, obj);
  gear.pack.push(handle);
  gear.inven = [handle];
  p.upkeep.totalWeight = obj.number * obj.weight;
  const runeEnv = makeRuneEnv(() => null, (value) => rng.randcalcVaries(value));
  const messages: string[] = [];
  // inven_damage needs these domains; no level or monster participates in pack damage.
  const state = { rng, actor: { player: p }, gear, runeEnv } as GameState;
  const killed = invenDamage(state, element, 10000, { msg: (text) => messages.push(text) });
  return { killed, messages, rng: rng.getState(), remaining: gear.store.get(handle)?.number ?? 0 };
}

describe("fragile food", () => {
  it("leaves every record unchanged by default", () => {
    expect(records("object_base")).toEqual(loadPackRecords("object_base"));
    expect(manifest.sections?.find((s) => s.id === "qol-fragile-food")?.default).toBe(false);
  });

  for (const tval of [TV.FOOD, TV.MUSHROOM]) {
    for (const element of [ELEM.FIRE, ELEM.ACID]) {
      it(`destroys ${String(tval)} with element ${String(element)} through inven_damage only when enabled`, () => {
        const faithful = registry([], false);
        const patched = registry(["qol-fragile-food"]);
        const kind = faithful.kinds.find((k) => k.tval === tval)!;
        const before = attack(faithful, kind, element);
        expect(before.killed).toBe(0);
        expect(before.messages).toEqual([]);
        expect(before.remaining).toBe(5);
        expect(attack(registry(), kind, element)).toEqual(before);
        const after = attack(patched, patched.kinds[kind.kidx]!, element);
        expect(after.killed).toBe(5);
        expect(after.remaining).toBe(0);
        expect(after.messages).toHaveLength(1);
        expect(after.rng).not.toEqual(before.rng);
      });
    }
  }
});

describe("richer weapon and armor shops", () => {
  it("defaults off and changes only the smallest purse at each named store", () => {
    expect(manifest.sections?.find((s) => s.id === "qol-richer-shops")?.default).toBe(false);
    const base = loadPackRecords("store") as unknown as StoreRecordJson[];
    expect(records("store")).toEqual(base);
    const patched = records("store", ["qol-richer-shops"]) as unknown as StoreRecordJson[];
    expect(patched).toEqual(base.map((store) => ["STORE_ARMOR", "STORE_WEAPON"].includes(store.store)
      ? { ...store, owner: store.owner.map((owner) => ({ ...owner, purse: Math.max(owner.purse, 10000) })) }
      : store));
  });

  for (const feat of [FEAT.STORE_ARMOR, FEAT.STORE_WEAPON]) {
    it(`pays the higher cap in a sale at store ${String(feat)} only when enabled`, () => {
      function sell(sections: readonly string[], withMod: boolean) {
        const reg = registry([], withMod);
        const rng = new Rng(41);
        const deps: MakeDeps = {
          reg, constants, alloc: new ObjAllocState(reg, constants),
          artifacts: new ArtifactState(reg.artifacts.length), noArtifacts: false,
        };
        const storeReg = new StoreRegistry(records("store", sections, withMod) as unknown as StoreRecordJson[], reg);
        const store = bindStoreRuntime(storeReg.stores.find((bound) => bound.feat === feat)!, rng, constants.storeInvenMax);
        const p = player();
        const gear = newGear();
        const tval = feat === FEAT.STORE_ARMOR ? TV.DRAG_ARMOR : TV.SWORD;
        const kind = reg.kinds.filter((entry) => entry.tval === tval).sort((a, b) => b.cost - a.cost)[0]!;
        const obj = objectPrep(rng, reg, constants, kind, 0, "minimise");
        obj.toH = 30;
        obj.toD = 30;
        obj.toA = 30;
        const handle = gearAdd(gear, obj);
        gear.pack.push(handle);
        p.upkeep.totalWeight = obj.weight;
        const gold = p.au;
        const result = storeSell({ rng, deps, maxDepth: 0, stores: [store] }, store, handle, 1, p, gear, {
          aware: true, noSelling: false, runesKnown: true, flagKnown: () => true,
        });
        return { result, gold: p.au - gold, stock: store.stock.map((item) => item.kind.kidx), rng: rng.getState() };
      }
      const faithful = sell([], false);
      expect(sell([], true)).toEqual(faithful);
      expect(faithful.result.ok).toBe(true);
      expect(faithful.gold).toBe(5000);
      const on = sell(["qol-richer-shops"], true);
      expect(on.result.ok).toBe(true);
      expect(on.gold).toBe(10000);
      expect(on.stock).toEqual(faithful.stock);
    });
  }
});

describe("fragile town books", () => {
  it("defaults off and changes only the four book bases", () => {
    expect(manifest.sections?.find((s) => s.id === "qol-fragile-town-books")?.default).toBe(false);
    const base = loadPackRecords("object_base") as JsonRecord[];
    const patched = records("object_base", ["qol-fragile-town-books"]);
    const changed = patched.filter((record, index) => JSON.stringify(record) !== JSON.stringify(base[index]));
    expect(changed.map((record) => (record.name as JsonRecord).tval).sort()).toEqual(
      ["magic book", "prayer book", "nature book", "shadow book"].sort(),
    );
  });

  for (const element of [ELEM.FIRE, ELEM.ACID]) {
    it(`uses class book quality to keep dungeon books safe from element ${String(element)}`, () => {
      const faithful = registry([], false);
      const off = registry();
      const on = registry(["qol-fragile-town-books"]);
      const books = new Map(players.classes.flatMap((cls) => cls.magic.books.map((book) => [book.name, book])));
      expect(books.size).toBe(20);
      for (const book of books.values()) {
        const beforeKind = faithful.kinds.find((kind) => kind.name === book.name)!;
        const before = attack(faithful, beforeKind, element);
        expect(attack(off, off.kinds[beforeKind.kidx]!, element), book.name).toEqual(before);
        const after = attack(on, on.kinds[beforeKind.kidx]!, element);
        expect(after.killed, book.name).toBe(book.dungeon ? 0 : 5);
        expect(before.killed, book.name).toBe(book.dungeon || element === ELEM.ACID ? 0 : 5);
        if (book.dungeon || element === ELEM.FIRE) expect(after, book.name).toEqual(before);
      }
    });
  }

  it("keeps the food and book sections independent", () => {
    const on = registry(["qol-fragile-town-books"]);
    const food = on.kinds.find((kind) => kind.tval === TV.FOOD)!;
    expect(attack(on, food, ELEM.FIRE).killed).toBe(0);
    const foodOnly = registry(["qol-fragile-food"]);
    const townBook = foodOnly.kinds.find((kind) => kind.name === "[First Spells]")!;
    expect(attack(foodOnly, townBook, ELEM.ACID).killed).toBe(0);
  });
});
