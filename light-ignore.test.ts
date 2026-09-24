import { afterEach, describe, expect, it } from "vitest";
import { installLightIgnore, uninstallLightIgnore, type LightObjectLike } from "./light-ignore";

const TV_LIGHT = 19;
const CORE = { TV: { LIGHT: TV_LIGHT } };

function light(name: string, overrides: Partial<LightObjectLike> = {}): LightObjectLike {
  return {
    tval: TV_LIGHT,
    artifact: null,
    note: null,
    kind: { name },
    ...overrides,
  };
}

const torch = (overrides: Partial<LightObjectLike> = {}): LightObjectLike =>
  light("& Wooden Torch~", overrides);
const lantern = (overrides: Partial<LightObjectLike> = {}): LightObjectLike =>
  light("& Lantern~", overrides);

/** A fresh live-game stand-in whose isIgnored starts as "nothing is ignored",
 * matching a headless engine's real default (obj/ignore.ts's own header: "the
 * settings start empty"). */
function freshState(): { isIgnored?: (obj: LightObjectLike) => boolean } {
  return { isIgnored: () => false };
}

afterEach(() => {
  uninstallLightIgnore();
});

describe("ignore torches / ignore lanterns (#267)", () => {
  it("ignoring the torch tier hides torches but leaves lanterns visible", () => {
    const state = freshState();
    installLightIgnore({ flags: { "qol.ignoreTorches": true }, core: CORE, state });
    expect(state.isIgnored?.(torch())).toBe(true);
    expect(state.isIgnored?.(lantern())).toBe(false);
  });

  it("ignoring the lantern tier hides lanterns but leaves torches visible", () => {
    const state = freshState();
    installLightIgnore({ flags: { "qol.ignoreLanterns": true }, core: CORE, state });
    expect(state.isIgnored?.(lantern())).toBe(true);
    expect(state.isIgnored?.(torch())).toBe(false);
  });

  it("both independently off leaves both visible (regression guard)", () => {
    const state = freshState();
    const original = state.isIgnored;
    installLightIgnore({
      flags: { "qol.ignoreTorches": false, "qol.ignoreLanterns": false },
      core: CORE,
      state,
    });
    expect(state.isIgnored?.(torch())).toBe(false);
    expect(state.isIgnored?.(lantern())).toBe(false);
    /* With both off this installs nothing at all - the live seam is left
     * exactly as it already was, not merely returning the same answers. */
    expect(state.isIgnored).toBe(original);
  });

  it("both toggles on hides both", () => {
    const state = freshState();
    installLightIgnore({
      flags: { "qol.ignoreTorches": true, "qol.ignoreLanterns": true },
      core: CORE,
      state,
    });
    expect(state.isIgnored?.(torch())).toBe(true);
    expect(state.isIgnored?.(lantern())).toBe(true);
  });

  it("never ignores a real artifact torch, even with the torch tier on", () => {
    const state = freshState();
    installLightIgnore({ flags: { "qol.ignoreTorches": true }, core: CORE, state });
    expect(state.isIgnored?.(torch({ artifact: { aidx: 1 } }))).toBe(false);
  });

  it("never ignores a real artifact lantern, even with the lantern tier on", () => {
    const state = freshState();
    installLightIgnore({ flags: { "qol.ignoreLanterns": true }, core: CORE, state });
    expect(state.isIgnored?.(lantern({ artifact: { aidx: 2 } }))).toBe(false);
  });

  it("never ignores an item inscribed !k or !*, even with its tier on", () => {
    const state = freshState();
    installLightIgnore({
      flags: { "qol.ignoreTorches": true, "qol.ignoreLanterns": true },
      core: CORE,
      state,
    });
    expect(state.isIgnored?.(torch({ note: "!k" }))).toBe(false);
    expect(state.isIgnored?.(lantern({ note: "!*" }))).toBe(false);
  });

  it("falls through to whatever state.isIgnored already decided for a non-light item", () => {
    const state: { isIgnored?: (obj: LightObjectLike) => boolean } = {
      isIgnored: (obj) => obj.kind.name === "junk",
    };
    installLightIgnore({ flags: { "qol.ignoreTorches": true }, core: CORE, state });
    expect(state.isIgnored?.(light("junk", { tval: 5 }))).toBe(true);
    expect(state.isIgnored?.(light("not junk", { tval: 5 }))).toBe(false);
  });

  it("clears the wrap when the mod unloads, restoring the prior seam untouched", () => {
    const state = freshState();
    const original = state.isIgnored;
    installLightIgnore({ flags: { "qol.ignoreTorches": true }, core: CORE, state });
    expect(state.isIgnored).not.toBe(original);
    uninstallLightIgnore();
    expect(state.isIgnored).toBe(original);
  });

  it("logs rather than going silently inert when there is no live game at register time", () => {
    const log: string[] = [];
    installLightIgnore({
      flags: { "qol.ignoreTorches": true },
      core: CORE,
      log: (message) => log.push(message),
    });
    expect(log).toEqual(["ignore torches/lanterns: no live game at register time"]);
  });

  it("migrates an existing save's single combined light quality tier sanely: nothing crashes and the old choice survives untouched when both new toggles are off", () => {
    /* A save from before this feature existed already has SOME state.isIgnored
     * built from the single combined ITYPE.LIGHT quality tier - simulated here
     * as a predicate that already hides every plain (non-artifact) light,
     * torch or lantern alike, the way "ignore average lights" always has. */
    const legacyIgnored = (obj: LightObjectLike): boolean =>
      obj.tval === TV_LIGHT && !obj.artifact;
    const state: { isIgnored?: (obj: LightObjectLike) => boolean } = {
      isIgnored: legacyIgnored,
    };

    expect(() =>
      installLightIgnore({
        flags: { "qol.ignoreTorches": false, "qol.ignoreLanterns": false },
        core: CORE,
        state,
      }),
    ).not.toThrow();

    /* Untouched: the old combined-tier choice still hides both, exactly as it
     * did before this mod's own two toggles existed. */
    expect(state.isIgnored).toBe(legacyIgnored);
    expect(state.isIgnored?.(torch())).toBe(true);
    expect(state.isIgnored?.(lantern())).toBe(true);
    /* And it still respects the artifact exemption it always had. */
    expect(state.isIgnored?.(torch({ artifact: { aidx: 3 } }))).toBe(false);
  });

  it("layers on top of an existing save's prior choice rather than replacing it", () => {
    /* Same legacy save, but the player now also turns on "always ignore
     * torches" - lanterns should keep behaving exactly as the old combined
     * tier already decided (still hidden here), while torches are hidden for
     * the SAME reason as before, not a new one that could disagree with it. */
    const legacyIgnored = (obj: LightObjectLike): boolean =>
      obj.tval === TV_LIGHT && !obj.artifact;
    const state: { isIgnored?: (obj: LightObjectLike) => boolean } = {
      isIgnored: legacyIgnored,
    };
    installLightIgnore({ flags: { "qol.ignoreTorches": true }, core: CORE, state });
    expect(state.isIgnored?.(torch())).toBe(true);
    expect(state.isIgnored?.(lantern())).toBe(true);
    expect(state.isIgnored?.(lantern({ artifact: { aidx: 4 } }))).toBe(false);
  });
});
