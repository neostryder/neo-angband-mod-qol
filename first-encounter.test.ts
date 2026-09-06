import { describe, expect, it } from "vitest";
import {
  artifactCardContent,
  carriedKnownArtifacts,
  characterKey,
  classifyMonsterThreat,
  monsterCardContent,
  newArtifactFinds,
  newMonsterSightings,
  readFirstEncounterPrefs,
  toFirstEncounterPrefs,
  type ArtifactLike,
  type GameObjectLike,
  type MonsterRaceLike,
} from "./first-encounter";

function race(overrides: Partial<MonsterRaceLike> = {}): MonsterRaceLike {
  return { ridx: 1, name: "Grip, Farmer Maggot's Dog", level: 2, dChar: "C", dAttr: 4, unique: false, ...overrides };
}

function artifact(overrides: Partial<ArtifactLike> = {}): ArtifactLike {
  return { aidx: 1, name: "of Farmer Maggot", level: 3, ...overrides };
}

describe("classifyMonsterThreat", () => {
  it("marks a unique as unique regardless of depth", () => {
    expect(classifyMonsterThreat(race({ unique: true, level: 2 }), 40)).toBe("unique");
  });

  it("marks a non-unique well below the surface as deadly", () => {
    expect(classifyMonsterThreat(race({ level: 10 }), 5)).toBe("deadly");
  });

  it("marks a mildly out-of-depth non-unique as out of depth", () => {
    expect(classifyMonsterThreat(race({ level: 6 }), 5)).toBe("outOfDepth");
  });

  it("marks a monster at or below the current depth as ordinary", () => {
    expect(classifyMonsterThreat(race({ level: 5 }), 5)).toBe("ordinary");
    expect(classifyMonsterThreat(race({ level: 1 }), 5)).toBe("ordinary");
  });
});

describe("characterKey", () => {
  it("is stable for the same birth facts and differs when any one changes", () => {
    const base = {
      fullName: "Frodo",
      raceName: "Hobbit",
      clsName: "Rogue",
      auBirth: 100,
      htBirth: 40,
      wtBirth: 60,
    };
    expect(characterKey(base)).toBe(characterKey({ ...base }));
    expect(characterKey(base)).not.toBe(characterKey({ ...base, fullName: "Sam" }));
    expect(characterKey(base)).not.toBe(characterKey({ ...base, auBirth: 101 }));
  });
});

describe("readFirstEncounterPrefs / toFirstEncounterPrefs", () => {
  it("starts empty when nothing is stored", () => {
    const notebook = readFirstEncounterPrefs(undefined, "frodo-key");
    expect([...notebook.monsters]).toEqual([]);
    expect([...notebook.artifacts]).toEqual([]);
  });

  it("round-trips what was written for the same character key", () => {
    const written = toFirstEncounterPrefs("frodo-key", {
      monsters: new Set([1, 2]),
      artifacts: new Set([9]),
    });
    const read = readFirstEncounterPrefs(written, "frodo-key");
    expect([...read.monsters].sort()).toEqual([1, 2]);
    expect([...read.artifacts]).toEqual([9]);
  });

  it("starts fresh when the stored data belongs to a different character", () => {
    const written = toFirstEncounterPrefs("frodo-key", {
      monsters: new Set([1]),
      artifacts: new Set([9]),
    });
    const read = readFirstEncounterPrefs(written, "sam-key");
    expect([...read.monsters]).toEqual([]);
    expect([...read.artifacts]).toEqual([]);
  });

  it("ignores a differently-shaped or unversioned value rather than throwing", () => {
    expect(readFirstEncounterPrefs({ v: 2, whatever: true }, "frodo-key").monsters.size).toBe(0);
    expect(readFirstEncounterPrefs("not an object", "frodo-key").monsters.size).toBe(0);
    expect(readFirstEncounterPrefs(null, "frodo-key").monsters.size).toBe(0);
  });
});

describe("newMonsterSightings", () => {
  it("keeps only races absent from the notebook, once each", () => {
    const grip = race({ ridx: 1 });
    const fang = race({ ridx: 2, name: "Fang, Farmer Maggot's Other Dog" });
    const anotherGrip = race({ ridx: 1 });
    const found = newMonsterSightings([grip, fang, anotherGrip], new Set([2]));
    expect(found).toEqual([grip]);
  });

  it("finds nothing when every visible race is already known", () => {
    expect(newMonsterSightings([race({ ridx: 1 })], new Set([1]))).toEqual([]);
  });
});

describe("newArtifactFinds", () => {
  it("keeps only artifacts absent from the notebook, once each", () => {
    const maggot = artifact({ aidx: 1 });
    const found = newArtifactFinds([maggot, artifact({ aidx: 1 })], new Set());
    expect(found).toEqual([maggot]);
  });

  it("finds nothing when the artifact is already known", () => {
    expect(newArtifactFinds([artifact({ aidx: 1 })], new Set([1]))).toEqual([]);
  });
});

describe("carriedKnownArtifacts", () => {
  it("keeps only gear that is both an artifact and assessed", () => {
    const known = artifact({ aidx: 1 });
    const gear: GameObjectLike[] = [
      { artifact: known },
      { artifact: null },
      { artifact: artifact({ aidx: 2 }) },
    ];
    const isKnown = (obj: GameObjectLike): boolean => obj.artifact?.aidx === 1;
    expect(carriedKnownArtifacts(gear, isKnown)).toEqual([known]);
  });
});

describe("monsterCardContent", () => {
  const fmtDepth = (depth: number): string => `${depth * 50}' (L${depth})`;
  const colorToCss = (attr: number): string => `#${attr.toString(16).padStart(6, "0")}`;

  it("labels a unique distinctly from an ordinary or out-of-depth sighting", () => {
    expect(monsterCardContent(race({ unique: true, level: 3 }), 3, fmtDepth, colorToCss).title).toBe(
      "Unique!",
    );
    expect(monsterCardContent(race({ level: 3 }), 3, fmtDepth, colorToCss).title).toBe("First sighting");
    expect(monsterCardContent(race({ level: 5 }), 3, fmtDepth, colorToCss).title).toBe("Out of depth");
  });

  it("carries the race's own name, depth text, and glyph", () => {
    const content = monsterCardContent(race({ level: 4, dChar: "d", dAttr: 5 }), 1, fmtDepth, colorToCss);
    expect(content.kind).toBe("monster");
    expect(content.name).toBe("Grip, Farmer Maggot's Dog");
    expect(content.depthText).toBe("200' (L4)");
    expect(content.glyphChar).toBe("d");
    expect(content.glyphColor).toBe("#000005");
  });
});

describe("artifactCardContent", () => {
  it("carries the artifact's own name and depth text, with no threat tier", () => {
    const fmtDepth = (depth: number): string => `${depth * 50}' (L${depth})`;
    const content = artifactCardContent(artifact({ name: "Sting", level: 5 }), fmtDepth);
    expect(content).toEqual({
      kind: "artifact",
      title: "Artifact found!",
      name: "Sting",
      depthText: "250' (L5)",
    });
  });
});
