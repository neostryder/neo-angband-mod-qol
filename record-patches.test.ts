import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPackFile, loadPackRecords } from "@rpgm-tools/neo-angband-content/pack";
import {
  composePacks,
  expandSections,
  resolveSectionState,
  validateManifest,
} from "@rpgm-tools/neo-angband-mod-sdk";
import type { FileContribution, JsonRecord, PackContent } from "@rpgm-tools/neo-angband-mod-sdk";
import {
  ELEM,
  ObjRegistry,
  Rng,
  TV,
  bindConstants,
  bindPlayer,
  blankPlayer,
  gearAdd,
  makeRuneEnv,
  newGear,
  objectPrep,
  registerBookKinds,
} from "@rpgm-tools/neo-angband-core";
import type { GameState, ObjPackJson, ObjectKind, PlayerPackRecords } from "@rpgm-tools/neo-angband-core";
import { invenDamage } from "./node_modules/@rpgm-tools/neo-angband-core/dist/game/project-obj.js";

const manifest = validateManifest(JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8")));
const constants = bindConstants(loadPackFile("constants") as never);
const players = bindPlayer(Object.fromEntries(Object.entries({
  races: "p_race", classes: "class", properties: "player_property", timed: "player_timed",
  shapes: "shape", bodies: "body", history: "history", realms: "realm",
}).map(([key, file]) => [key, loadPackRecords(file)])) as unknown as PlayerPackRecords);

function records(file: string, sections: readonly string[] = []): JsonRecord[] {
  const base: PackContent = {
    manifest: { id: "core", name: "Core", version: "1.23.0-beta.4", shape: "content" },
    files: { [file]: { records: loadPackRecords(file) as JsonRecord[] } },
  };
  const mod: PackContent = {
    manifest,
    files: { [file]: JSON.parse(readFileSync(new URL(`./${file}.json`, import.meta.url), "utf8")) as FileContribution },
  };
  const state = resolveSectionState([manifest], { qol: Object.fromEntries(sections.map((id) => [id, true])) }, new Set(["core", "qol"]));
  const units = expandSections([base, mod], (id, section) => state.get(id)?.get(section) === true);
  return [...composePacks(units.map((unit) => unit.content)).get(file)!.values()].map((record) => record.value);
}

function registry(sections: readonly string[] = []): ObjRegistry {
  const reg = new ObjRegistry(Object.fromEntries(Object.entries({
    objectBase: "object_base", object: "object", egoItem: "ego_item", artifact: "artifact",
    curse: "curse", brand: "brand", slay: "slay", activation: "activation",
    objectProperty: "object_property", flavor: "flavor",
  }).map(([key, file]) => [key, file === "object_base"
    ? { ...loadPackFile(file) as object, records: records(file, sections) }
    : loadPackFile(file)])) as unknown as ObjPackJson);
  registerBookKinds(reg, players.classes);
  return reg;
}

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
        const faithful = registry();
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
