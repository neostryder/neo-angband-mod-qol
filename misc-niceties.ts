export interface DisplayLike {
  setStoreItemNameEllipsis?(enabled: boolean): void;
  setStoreSelectionDescription?(enabled: boolean): void;
  setMonsterListColorKey?(enabled: boolean): void;
}

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
