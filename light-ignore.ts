/**
 * "Quality ignore: always ignore torches" / "...lanterns" (qol.ignoreTorches /
 * qol.ignoreLanterns, #267): quality-ignore's own "Lights" category (obj/ignore.ts
 * ITYPE.LIGHT, core/generated/ignore-types.ts) covers Wooden Torches and Lanterns
 * as one tval-keyed bucket, so a single quality tier for lights hides or shows
 * both together. That blocks a real loadout: a necromancer wearing a Lantern of
 * Shadows refills it from lanterns found on the floor, so lanterns need to stay
 * visible while torches - never worn, never refuelled from, pure floor noise -
 * disappear. Randart games sharpen the same gap: a wooden torch on the floor may
 * turn out to be an artifact, so blanket-ignoring the kind (core's own per-flavor
 * "ignore this kind" action, independent of quality but still all-or-nothing per
 * kind) gives up on ever noticing it - reported on Reddit by u/WikiWantsYourPics.
 *
 * WHY THIS IS A MOD AND NOT A CORE CHANGE. Torch and Lantern are not new
 * information: both are TV.LIGHT, and core's own QUALITY_MAPPING (obj/ignore.ts)
 * already distinguishes otherwise-identical tvals by a substring match against
 * the live `kind.name` (Chaos/Slicing/Disruption for GREAT weapons, Black/Blue/...
 * for dragon armour colours). The two TV.LIGHT kinds - "& Wooden Torch~" and
 * "& Lantern~" - are exactly as distinguishable the same way, with no new seam
 * needed. What core does not offer is a THIRD, independent quality tier per tval;
 * ITYPE_MAX is a fixed, generated enum (list-ignore-types.h) and splitting it
 * would be a core change this gap does not need.
 *
 * HOW THIS WORKS WITHOUT ONE. `state.isIgnored` (GameState, game/context.ts) is
 * the one seam obj-list.ts, floor.ts, known.ts, pickup.ts, target.ts and every
 * other ignore-aware call site already read through, rather than calling
 * ignoreItemOk directly - core's own doc comment on it says so ("Read through
 * state.isIgnored ... so worldless code stays decoupled from flavor knowledge").
 * It is a plain, mutable function property on the live game, built once by the
 * session from ignoreItemOk plus flavor awareness. This wraps it: a light whose
 * kind name matches an enabled toggle answers ignored immediately (after the
 * same artifact and !k/!*-inscription exemptions core's own engine already
 * grants everything else), and anything else falls straight through to whatever
 * state.isIgnored already did - the player's existing quality tier, kind-ignore,
 * ego-ignore and per-item choices for every OTHER item, lights included, are
 * never read, written or clobbered. A save from before this feature existed
 * needs no migration for exactly that reason: nothing here alters state.ignore,
 * so its stored quality tier for lights keeps meaning whatever it already meant.
 */

/**
 * The minimal object shape this feature reads, matching GameObject (core
 * obj/object.ts) structurally rather than importing it for types only, the same
 * convention plugin.ts's own HookCtx uses throughout. `artifact` and `note` are
 * read only to keep the same two "never auto-ignore this" exemptions core's own
 * objectIsIgnored (obj/ignore.ts) already grants: a real artifact, or an item
 * inscribed !k or !*, is untouched by this feature no matter which toggle is on.
 */
export interface LightObjectLike {
  readonly tval: number;
  readonly artifact: unknown;
  readonly note: string | null;
  readonly kind: { readonly name: string };
}

/**
 * The one field of the live game this feature reads and replaces.
 *
 * Method-shorthand syntax on purpose, matching plugin.ts's own HookCtx
 * convention for every structural host callback: TypeScript checks a method
 * signature's parameter bivariantly, so a real host state (whose isIgnored
 * takes the full GameObject) can be assigned into this narrower structural
 * slot. A property typed as an arrow-function LITERAL is checked
 * contravariantly instead and would refuse that assignment outright, since
 * LightObjectLike is not assignable to the real, much wider GameObject.
 */
export interface LightIgnoreGameLike {
  isIgnored?(obj: LightObjectLike): boolean;
}

export interface LightIgnoreContext {
  readonly flags: Readonly<Record<string, boolean>>;
  /** Only TV.LIGHT is read; structural rather than the whole TV table. */
  readonly core: { readonly TV: { readonly LIGHT: number } };
  /** The live game, absent during content composition (mirrors HookCtx.state). */
  readonly state?: LightIgnoreGameLike | undefined;
  readonly log?: ((message: string) => void) | undefined;
}

/** "& Wooden Torch~" (content pack/object.json): the raw, un-pluralised kind
 * name every Wooden Torch object carries, "&"/"~" placeholders and all - the
 * same raw form core's own QUALITY_MAPPING substring-matches against, never the
 * display-formatted name. */
const TORCH_NAME_FRAGMENT = "Torch";
/** "& Lantern~" (content pack/object.json). */
const LANTERN_NAME_FRAGMENT = "Lantern";

/** The same two blanket exemptions objectIsIgnored (obj/ignore.ts) grants
 * everything: a real artifact is never auto-ignored, and neither is anything
 * inscribed !k (never ignore by kind/quality) or !* (never ignore at all). */
function isExemptFromAutoIgnore(obj: LightObjectLike): boolean {
  if (obj.artifact) return true;
  const note = obj.note;
  return note !== null && (note.includes("!k") || note.includes("!*"));
}

/** The previously-installed wrap, so a second install (a reload, or a test
 * re-registering) can cleanly restore what it replaced before deciding whether
 * to wrap again - the same reset-then-maybe-install shape misc-niceties.ts uses
 * for its own display seam. */
let installed: { readonly state: LightIgnoreGameLike; readonly original: LightIgnoreGameLike["isIgnored"] } | null = null;

/**
 * Install (or reinstall) the torch/lantern auto-ignore wrap for the current
 * game. Safe to call every register(), including across a reload: it always
 * un-wraps its own previous installation first, then re-wraps only if the live
 * game is present and at least one of the two toggles is on. With both off, this
 * is a total no-op - state.isIgnored is left exactly as it already was, which is
 * the regression guard for every other ignore choice the player has made.
 */
export function installLightIgnore(ctx: LightIgnoreContext): void {
  uninstallLightIgnore();

  const ignoreTorches = ctx.flags["qol.ignoreTorches"] === true;
  const ignoreLanterns = ctx.flags["qol.ignoreLanterns"] === true;
  if (!ignoreTorches && !ignoreLanterns) return;

  const state = ctx.state;
  if (!state) {
    ctx.log?.("ignore torches/lanterns: no live game at register time");
    return;
  }

  const lightTval = ctx.core.TV?.LIGHT;
  if (typeof lightTval !== "number") {
    ctx.log?.("ignore torches/lanterns: this game is too old to report TV.LIGHT");
    return;
  }

  const original = state.isIgnored;
  const wrapped = (obj: LightObjectLike): boolean => {
    if (obj.tval === lightTval && !isExemptFromAutoIgnore(obj)) {
      const name = obj.kind.name;
      if (ignoreTorches && name.includes(TORCH_NAME_FRAGMENT)) return true;
      if (ignoreLanterns && name.includes(LANTERN_NAME_FRAGMENT)) return true;
    }
    return original?.(obj) ?? false;
  };

  state.isIgnored = wrapped;
  installed = { state, original };
}

/** Restore whatever state.isIgnored was before installLightIgnore wrapped it. */
export function uninstallLightIgnore(): void {
  if (!installed) return;
  const { state, original } = installed;
  installed = null;
  /* exactOptionalPropertyTypes: assigning `undefined` to an optional property
   * is a type error distinct from the property being ABSENT, so an absent
   * original is restored by deleting the wrap rather than writing it. */
  if (original) {
    state.isIgnored = original;
  } else {
    delete state.isIgnored;
  }
}
