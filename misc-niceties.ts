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
}

/** Clear the display choices this bundled toggle owns before the mod unloads. */
export function uninstallMiscNiceties(): void {
  const display = configuredDisplay;
  configuredDisplay = null;
  display?.setStoreItemNameEllipsis?.(false);
}
