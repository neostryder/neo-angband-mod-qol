import type { DisplayLike } from "./zoom-pan";

export interface MiscNicetiesContext {
  readonly flags: Readonly<Record<string, boolean>>;
  readonly display?: DisplayLike | undefined;
  readonly log?: ((message: string) => void) | undefined;
}

let configuredDisplay: DisplayLike | null = null;

/** Install the small independent display conveniences collected by one toggle. */
export function installMiscNiceties(ctx: MiscNicetiesContext): void {
  uninstallMiscNiceties();
  if (ctx.flags["qol.miscNiceties"] !== true) return;
  const display = ctx.display;
  if (!display) {
    ctx.log?.("this game is too old for misc. niceties");
    return;
  }
  configuredDisplay = display;
  display.setStoreItemNameEllipsis?.(true);
  display.setStoreSelectionDescription?.(true);
  display.setMonsterListColorKey?.(true);
}

/** Clear the display choices this bundled toggle owns before the mod unloads. */
export function uninstallMiscNiceties(): void {
  const display = configuredDisplay;
  configuredDisplay = null;
  display?.setStoreItemNameEllipsis?.(false);
  display?.setStoreSelectionDescription?.(false);
  display?.setMonsterListColorKey?.(false);
}

let quiverItemizationDisplay: DisplayLike | null = null;

/**
 * "Itemize the quiver in the Inventory subwindow" (qol.quiverItemization, #254):
 * lists each distinct quiver stack by name in the passive Inventory subwindow,
 * instead of core's faithful "in Quiver: N missiles" capacity summary. A
 * separate toggle from `qol.miscNiceties` (rather than folded into that
 * bundle) so it can be switched independently of the two store display
 * niceties it sits next to in the manager.
 */
export function installQuiverItemization(ctx: MiscNicetiesContext): void {
  uninstallQuiverItemization();
  if (ctx.flags["qol.quiverItemization"] !== true) return;
  const display = ctx.display;
  if (!display) {
    ctx.log?.("this game is too old to itemize the quiver");
    return;
  }
  quiverItemizationDisplay = display;
  display.setQuiverItemization?.(true);
}

/** Clear this toggle's display choice before the mod unloads. */
export function uninstallQuiverItemization(): void {
  const display = quiverItemizationDisplay;
  quiverItemizationDisplay = null;
  display?.setQuiverItemization?.(false);
}

/**
 * Clearer wording for a few of upstream Angband 4.2.6's own messages, applied at
 * the host's message sink when "Misc. niceties" is on. Keys are upstream's text
 * verbatim, as the finished message reaches the sink; anything not listed passes
 * through unchanged. Every row restates its message without changing what it
 * means. TEXT_CHANGES.md lists every row with its upstream source line.
 */
export const UPSTREAM_MESSAGE_WORDING: Readonly<Record<string, string>> = {
  /* cmd-cave.c, ordering an immobile monster to move (command monster). */
  "The monster can not move.": "The monster cannot move.",
};

/** The messageText hook: upstream's text in, the reworded text out. */
export function upstreamWordingFix(text: string): string {
  return UPSTREAM_MESSAGE_WORDING[text] ?? text;
}
