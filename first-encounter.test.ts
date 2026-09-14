import { afterEach, describe, expect, it, vi } from "vitest";
import {
  artifactCardContent,
  carriedKnownArtifacts,
  characterKey,
  classifyMonsterThreat,
  installFirstEncounter,
  monsterCardContent,
  newArtifactFinds,
  newMonsterSightings,
  readFirstEncounterNotebook,
  withFirstEncounterNotebook,
  uninstallFirstEncounter,
  type ArtifactLike,
  type GameObjectLike,
  type MonsterRaceLike,
} from "./first-encounter";
import {
  readHideRepeatShortcuts,
  readRememberedSettings,
  withDisplayPreference,
  withHideRepeatShortcuts,
  withRememberedSettings,
} from "./preferences";

afterEach(() => {
  uninstallFirstEncounter();
  vi.useRealTimers();
});

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
  it("is stable for the same save-persisted birth facts and differs when any one changes", () => {
    const base = {
      raceName: "Hobbit",
      clsName: "Rogue",
      auBirth: 100,
      htBirth: 40,
      wtBirth: 60,
    };
    expect(characterKey(base)).toBe(characterKey({ ...base }));
    expect(characterKey(base)).not.toBe(characterKey({ ...base, auBirth: 101 }));
    expect(characterKey(base)).not.toBe(characterKey({ ...base, htBirth: 41 }));
    expect(characterKey(base)).not.toBe(characterKey({ ...base, wtBirth: 61 }));
  });

  it("keeps the notebook when the host's roster name is absent after a reload (#259)", () => {
    /* The web host keeps the displayed name in roster metadata. It can be
     * present while a character is being played but absent from the Player
     * exposed to a later plugin registration. Height, weight, and birth gold
     * are save fields, so they are deliberately still part of this identity. */
    const beforeReload = {
      fullName: "Frodo",
      raceName: "Hobbit",
      clsName: "Rogue",
      auBirth: 100,
      htBirth: 40,
      wtBirth: 60,
    };
    const afterReload = { ...beforeReload, fullName: "" };
    const beforeKey = characterKey(beforeReload);
    const afterKey = characterKey(afterReload);
    const stored = withFirstEncounterNotebook({ v: 2 }, beforeKey, {
      monsters: new Set([1]),
      artifacts: new Set([9]),
    });

    expect(afterKey).toBe(beforeKey);
    expect(readFirstEncounterNotebook(stored, afterKey)).toEqual({
      monsters: new Set([1]),
      artifacts: new Set([9]),
    });
  });
});

describe("installFirstEncounter", () => {
  it("reads the live player from state.actor.player, not state.player", () => {
    /* GameState.actor: PlayerActor, PlayerActor.player: Player - the player
     * is never a direct field of state. installFirstEncounter threw
     * "Cannot read properties of undefined (reading 'fullName')" in a real
     * boot when this file's own state typing skipped the actor level. */
    const ctx = {
      core: {
        monsterListCollect: () => ({ entries: [] }),
        liveObjectIsKnownArtifact: () => false,
        fmtDepth: (depth: number) => `${depth}ft`,
        colorToCss: () => "#fff",
      },
      state: {
        chunk: { depth: 5 },
        gear: { store: new Map() },
        actor: {
          player: {
            race: { name: "Hobbit" },
            cls: { name: "Rogue" },
            auBirth: 100,
            htBirth: 40,
            wtBirth: 60,
          },
        },
      },
      ui: { openPanel: () => ({ root: {} as ShadowRoot, closed: Promise.resolve(), close: () => {} }) },
    };
    expect(() => installFirstEncounter(ctx)).not.toThrow();
  });

  it("stops polling before a departing plugin can open another card (neo-angband #251)", () => {
    vi.useFakeTimers();
    const openPanel = vi.fn();
    installFirstEncounter({
      core: {
        monsterListCollect: () => ({ entries: [{ race: race() }] }),
        liveObjectIsKnownArtifact: () => false,
        fmtDepth: (depth: number) => `${depth}ft`,
        colorToCss: () => "#fff",
      },
      state: {
        chunk: { depth: 5 },
        gear: { store: new Map() },
        actor: {
          player: {
            race: { name: "Hobbit" },
            cls: { name: "Rogue" },
            auBirth: 100,
            htBirth: 40,
            wtBirth: 60,
          },
        },
      },
      ui: { openPanel },
    });
    uninstallFirstEncounter();
    vi.advanceTimersByTime(750);
    expect(openPanel).not.toHaveBeenCalled();
  });
});

describe("shared first-encounter preference envelope", () => {
  it("starts empty when nothing is stored", () => {
    const notebook = readFirstEncounterNotebook(undefined, "frodo-key");
    expect([...notebook.monsters]).toEqual([]);
    expect([...notebook.artifacts]).toEqual([]);
  });

  it("writes a notebook without clobbering the other preference groups", () => {
    const options = {
      v: 1 as const,
      values: { use_sound: true },
      hitpointWarn: 5,
      delayFactor: 3,
      lazymoveDelay: 0,
    };
    const display = { v: 2 as const, zoomIndex: 8, interfaceZoomIndex: 2, mapDetail: 1 };
    const existing = withHideRepeatShortcuts(withRememberedSettings({ v: 2, display }, options), true);
    const written = withFirstEncounterNotebook(existing, "frodo-key", {
      monsters: new Set([1, 2]),
      artifacts: new Set([9]),
    });
    const read = readFirstEncounterNotebook(written, "frodo-key");
    expect([...read.monsters].sort()).toEqual([1, 2]);
    expect([...read.artifacts]).toEqual([9]);
    expect(written.display).toEqual(display);
    expect(readRememberedSettings(written)).toEqual(options);
    expect(readHideRepeatShortcuts(written)).toBe(true);
  });

  it("keeps a stored notebook when every other preference writer runs", () => {
    const written = withFirstEncounterNotebook({ v: 2 }, "frodo-key", {
      monsters: new Set([1]),
      artifacts: new Set([9]),
    });
    const options = {
      v: 1 as const,
      values: { use_sound: true },
      hitpointWarn: 5,
      delayFactor: 3,
      lazymoveDelay: 0,
    };
    const withDisplay = withDisplayPreference(written, {
      v: 2,
      zoomIndex: 4,
      interfaceZoomIndex: 2,
      mapDetail: 1,
    });
    const withOptions = withRememberedSettings(withDisplay, options);
    const withHidden = withHideRepeatShortcuts(withOptions, true);
    expect(readFirstEncounterNotebook(withHidden, "frodo-key")).toEqual({
      monsters: new Set([1]),
      artifacts: new Set([9]),
    });
  });

  it("starts fresh when the stored data belongs to a different character", () => {
    const written = withFirstEncounterNotebook({ v: 2 }, "frodo-key", {
      monsters: new Set([1]),
      artifacts: new Set([9]),
    });
    const read = readFirstEncounterNotebook(written, "sam-key");
    expect([...read.monsters]).toEqual([]);
    expect([...read.artifacts]).toEqual([]);
  });

  it("reads the former v1-only notebook and moves it into the shared envelope on save", () => {
    const legacy = { v: 1, characterKey: "frodo-key", monsters: [1, "bad", 2], artifacts: [9] };
    expect(readFirstEncounterNotebook(legacy, "frodo-key")).toEqual({
      monsters: new Set([1, 2]),
      artifacts: new Set([9]),
    });
    const migrated = withFirstEncounterNotebook(legacy, "frodo-key", {
      monsters: new Set([1, 2]),
      artifacts: new Set([9]),
    });
    expect(migrated).toEqual({
      v: 2,
      firstEncounter: { characterKey: "frodo-key", monsters: [1, 2], artifacts: [9] },
    });
  });

  it("reads a v2-only envelope as an empty notebook without disturbing it on save", () => {
    const v2Only = {
      v: 2,
      display: { v: 2, zoomIndex: 6, interfaceZoomIndex: 1, mapDetail: 0 },
      hideRepeatShortcuts: true,
    };
    expect(readFirstEncounterNotebook(v2Only, "frodo-key")).toEqual({
      monsters: new Set(),
      artifacts: new Set(),
    });
    expect(withFirstEncounterNotebook(v2Only, "frodo-key", {
      monsters: new Set([1]),
      artifacts: new Set(),
    })).toMatchObject({ display: v2Only.display, hideRepeatShortcuts: true });
  });

  it("ignores an unrecognized value rather than throwing", () => {
    expect(readFirstEncounterNotebook({ v: 2, whatever: true }, "frodo-key").monsters.size).toBe(0);
    expect(readFirstEncounterNotebook("not an object", "frodo-key").monsters.size).toBe(0);
    expect(readFirstEncounterNotebook(null, "frodo-key").monsters.size).toBe(0);
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
