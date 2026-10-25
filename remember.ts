/**
 * "Remember my settings": which options are worth carrying to the next
 * character, and how they go onto one.
 *
 * Pure functions over plain data, so the same rules serve the hook that
 * captures a change and the start that applies it, and so a test can run them
 * without a game.
 */

import type { RememberedSettings } from "./preferences";

/** The option store of the live game, as far as this mod touches it. */
export interface OptionStoreLike {
  set(name: string, value: boolean): boolean;
  isBirth?(name: string): boolean;
  hitpointWarn: number;
  delayFactor: number;
  lazymoveDelay: number;
}

/** The option snapshot the game hands to `optionsChanged`. */
export interface OptionSnapshotLike {
  readonly values: Readonly<Record<string, boolean>>;
  readonly hitpointWarn: number;
  readonly delayFactor: number;
  readonly lazymoveDelay: number;
  readonly birth?: Readonly<Record<string, boolean>>;
}

/**
 * Whether this mod may remember `name`.
 *
 * THREE EXCLUSIONS, and each is a decision rather than a limitation:
 *
 *  - BIRTH options are locked into a character at creation and `set()` refuses
 *    them afterwards, so remembering one could never apply it. They already
 *    carry forward by a different route: the game seeds the '=' birth editor
 *    with the previous character's choices, which is where a birth option can
 *    actually still be changed.
 *  - CHEAT options are excluded unless the player asks for them, because turning
 *    one on forces its `score_` twin and permanently bars that character from
 *    the score list. Inheriting that silently is the one case where remembering
 *    a setting does damage.
 *  - SCORE options are excluded on exactly the same terms and by the same
 *    toggle: they are the record of having cheated, so carrying one onto a fresh
 *    character would mark a character that never did.
 *
 * The three kinds are told apart by the game's own option names, which 4.2.6
 * prefixes `birth_`, `cheat_` and `score_`; the snapshot's `birth` map is the
 * second witness for a birth option.
 */
export function mayRemember(
  name: string,
  cheats: boolean,
  birth?: Readonly<Record<string, boolean>>,
): boolean {
  if (name.startsWith("birth_") || (birth !== undefined && name in birth)) return false;
  if (name.startsWith("cheat_") || name.startsWith("score_")) return cheats;
  return true;
}

/** What to write down after the player changes an option. */
export function rememberedFrom(snapshot: OptionSnapshotLike, cheats: boolean): RememberedSettings {
  const values: Record<string, boolean> = {};
  for (const [name, value] of Object.entries(snapshot.values)) {
    if (mayRemember(name, cheats, snapshot.birth)) values[name] = value;
  }
  return {
    v: 1,
    values,
    hitpointWarn: snapshot.hitpointWarn,
    delayFactor: snapshot.delayFactor,
    lazymoveDelay: snapshot.lazymoveDelay,
  };
}

/**
 * Put remembered settings onto a new character's options; answers how many
 * options were set.
 *
 * Filtered on the way IN as well as on the way out. The two toggles can change
 * between the write and the read: a player who remembered their cheat options
 * and then turned that toggle off must not keep inheriting them from what is
 * already stored. `set()` answers false for an option this game does not have,
 * which is what happens to a stored name after an upgrade removes one; that is
 * not an error, there is nothing to restore.
 */
export function applyRemembered(
  options: OptionStoreLike,
  remembered: RememberedSettings,
  cheats: boolean,
): number {
  let applied = 0;
  for (const [name, value] of Object.entries(remembered.values ?? {})) {
    if (!mayRemember(name, cheats) || options.isBirth?.(name) === true) continue;
    if (options.set(name, value)) applied++;
  }
  if (typeof remembered.hitpointWarn === "number") options.hitpointWarn = remembered.hitpointWarn;
  if (typeof remembered.delayFactor === "number") options.delayFactor = remembered.delayFactor;
  if (typeof remembered.lazymoveDelay === "number") options.lazymoveDelay = remembered.lazymoveDelay;
  return applied;
}
