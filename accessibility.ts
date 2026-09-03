export const COLORBLIND_FILTER_ID = "qol-accessibility-colorblind";

const HIGH_CONTRAST_FILTER = "contrast(1.55) saturate(1.2)";
/* A deuteranopia-oriented daltonization matrix. It carries green-channel error
 * into red and blue, giving common red/green collisions a second visible cue. */
const COLORBLIND_MATRIX = "0.812 0.199 -0.011 0 0 0 1 0 0 0 -0.188 0.199 0.989 0 0 0 0 0 1 0";

interface VisualFilterDisplay {
  setVisualFilter(filter: string | null): void;
}

export interface AccessibilityContext {
  readonly flags: Readonly<Record<string, boolean>>;
  readonly display?: VisualFilterDisplay | undefined;
  readonly log?: ((message: string) => void) | undefined;
}

/** The one combined canvas and DOM filter requested by the selected accommodations. */
export function accessibilityFilter(flags: Readonly<Record<string, boolean>>): string | null {
  const parts: string[] = [];
  if (flags["qol.accessibilityColorblind"] === true) {
    parts.push(`url("#${COLORBLIND_FILTER_ID}")`);
  }
  if (flags["qol.accessibilityHighContrast"] === true) parts.push(HIGH_CONTRAST_FILTER);
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * SVG is required here: CSS contrast and grayscale functions cannot express the
 * non-diagonal color matrix a real daltonization correction needs.
 */
function ensureColorblindFilter(): void {
  if (typeof document === "undefined" || document.getElementById(COLORBLIND_FILTER_ID)) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
  filter.setAttribute("id", COLORBLIND_FILTER_ID);
  const matrix = document.createElementNS("http://www.w3.org/2000/svg", "feColorMatrix");
  matrix.setAttribute("type", "matrix");
  matrix.setAttribute("values", COLORBLIND_MATRIX);
  filter.appendChild(matrix);
  svg.appendChild(filter);
  document.body?.appendChild(svg);
}

/** The responsive sidebar is DOM, not a terminal cell, so give it the same treatment. */
function setSidebarVisualFilter(filter: string | null): void {
  if (typeof document === "undefined") return;
  const existing = document.getElementById("qol-accessibility-sidebar-filter");
  if (!filter) {
    existing?.remove();
    return;
  }
  const style = existing ?? document.createElement("style");
  style.id = "qol-accessibility-sidebar-filter";
  style.textContent = `[data-qol-responsive-sidebar], [data-qol-map-hover-card] { filter: ${filter}; }`;
  if (!existing) document.head?.appendChild(style);
}

/** Apply the selected accommodation filters to the complete rendered frame. */
export function installAccessibilityAccommodations(ctx: AccessibilityContext): void {
  const wantsFilter =
    ctx.flags["qol.accessibilityHighContrast"] === true ||
    ctx.flags["qol.accessibilityColorblind"] === true;
  if (!wantsFilter) {
    ctx.display?.setVisualFilter(null);
    setSidebarVisualFilter(null);
    return;
  }
  if (!ctx.display) {
    ctx.log?.("this game is too old for visual accessibility filters");
    return;
  }
  if (ctx.flags["qol.accessibilityColorblind"] === true) ensureColorblindFilter();
  const filter = accessibilityFilter(ctx.flags);
  ctx.display.setVisualFilter(filter);
  setSidebarVisualFilter(filter);
}
