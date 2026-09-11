/**
 * Shared bitmap-glyph text rendering for every DOM card this mod draws, so a
 * mod dialog's own text reads as the same terminal as the game underneath it
 * rather than a generic system font (#197, #199, and the wider pass that
 * followed them). Every card in this mod paints its visible text through
 * this module instead of styling it with CSS font-family.
 *
 * An editable text input is the one exception: a player has to be able to
 * type into the trigger-key fields these cards offer, and there is no way to
 * do that through a canvas blit, so those stay native CSS/system text.
 */

import { FONT_16X24 } from "./bitmap-font";

/** Mirrors packages/web/src/term.ts's own FONT_STACK: the fallback for a
 * glyph FONT_16X24 does not cover (any code point >= 256), exactly as core's
 * own terminal falls back for the same case. A mod cannot import core's
 * constant directly (no cross-package imports), so this is a deliberate
 * copy - matched by eye at each Neo Angband release. */
export const BITMAP_FALLBACK_STACK =
  '"Cascadia Mono", "JetBrains Mono", Consolas, "DejaVu Sans Mono", monospace';

export interface BitmapRun {
  readonly text: string;
  readonly css: string;
}

/** "code:css" -> a native-resolution (16x24) canvas with glyph `code`'s set
 * pixels painted css's colour and the rest transparent, so it can be scaled
 * into a cell with nearest-neighbour sampling. Mirrors term.ts's own
 * `tintedGlyph`, which is the exact recipe being matched here. */
const glyphCache = new Map<string, HTMLCanvasElement | null>();

/** Parse a CSS colour (#rgb, #rrggbb, or rgb(r,g,b)) to [r,g,b], or null. */
function parseRgb(css: string): [number, number, number] | null {
  if (css.startsWith("#")) {
    const hex = css.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0]! + hex[0]!, 16),
        parseInt(hex[1]! + hex[1]!, 16),
        parseInt(hex[2]! + hex[2]!, 16),
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
    return null;
  }
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/u.exec(css);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function tintedGlyph(code: number, fg: string): HTMLCanvasElement | null {
  if (code < 0 || code >= FONT_16X24.glyphs.length) return null;
  const key = `${String(code)}:${fg}`;
  const cached = glyphCache.get(key);
  if (cached !== undefined) return cached;
  const rows = FONT_16X24.glyphs[code];
  const rgb = rows ? parseRgb(fg) : null;
  if (!rows || !rgb || rows.every((bits) => bits === 0)) {
    glyphCache.set(key, null);
    return null;
  }
  const { w, h } = FONT_16X24;
  const glyph = document.createElement("canvas");
  glyph.width = w;
  glyph.height = h;
  const gctx = glyph.getContext("2d");
  if (!gctx) {
    glyphCache.set(key, null);
    return null;
  }
  const img = gctx.createImageData(w, h);
  const [r, g, b] = rgb;
  for (let ry = 0; ry < h; ry++) {
    const mask = rows[ry] ?? 0;
    for (let rx = 0; rx < w; rx++) {
      if ((mask >> (w - 1 - rx)) & 1) {
        const o = (ry * w + rx) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
  }
  gctx.putImageData(img, 0, 0);
  glyphCache.set(key, glyph);
  return glyph;
}

/**
 * Paint one line of runs onto `canvas`, sized to fit exactly at cellWidth x
 * cellHeight CSS pixels per character, scaled by dpr for a crisp backing
 * store. Returns the CSS width actually used.
 *
 * Every cell edge is rounded in DEVICE-pixel space, mirroring term.ts's own
 * `cellBox`: a cell's right edge and the next cell's left edge are the same
 * expression, so adjacent glyphs tile with no gap and no clipped edge even
 * though cellWidth itself is rarely a whole device pixel. Rounding canvas
 * width separately from that same accumulation is exactly what clipped the
 * last character or two by a pixel before this (#199).
 *
 * A code point FONT_16X24 does not cover (any code point >= 256) falls back
 * to `BITMAP_FALLBACK_STACK` fillText, exactly as core's own terminal does
 * for the same case.
 */
export function paintBitmapLine(
  canvas: HTMLCanvasElement,
  runs: readonly BitmapRun[],
  cellWidth: number,
  cellHeight: number,
  dpr: number,
): number {
  const chars = runs.reduce((n, run) => n + [...run.text].length, 0);
  const cellWDevice = cellWidth * dpr;
  const cellHDevice = Math.max(1, Math.round(cellHeight * dpr));
  const edge = (i: number): number => Math.round(i * cellWDevice);
  const totalDevice = Math.max(1, edge(chars));
  canvas.width = totalDevice;
  canvas.height = cellHDevice;
  const cssWidth = totalDevice / dpr;
  canvas.style.width = `${String(cssWidth)}px`;
  canvas.style.height = `${String(cellHeight)}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return cssWidth;
  ctx.imageSmoothingEnabled = false;
  let col = 0;
  for (const run of runs) {
    for (const char of run.text) {
      const code = char.codePointAt(0) ?? 32;
      const left = edge(col);
      const width = edge(col + 1) - left;
      const glyph = tintedGlyph(code, run.css);
      if (glyph) {
        ctx.drawImage(glyph, left, 0, width, cellHDevice);
      } else {
        ctx.fillStyle = run.css;
        ctx.font = `${String(Math.round(cellHDevice * 0.82))}px ${BITMAP_FALLBACK_STACK}`;
        ctx.fillText(char, left, cellHDevice * 0.9);
      }
      col++;
    }
  }
  return cssWidth;
}

/**
 * Greedy word-wrap for one plain-text paragraph, breaking only at
 * whitespace. Used for the single-colour description text these cards show;
 * a mixed-colour line (like a sidebar row) is never long enough to need it.
 */
export function wrapBitmapText(text: string, maxChars: number): string[] {
  if (maxChars < 1) return [text];
  const words = text.split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if ([...candidate].length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/**
 * The multi-paragraph form: `text`'s own line breaks are kept as paragraph
 * breaks (an empty source line stays a blank line), and each paragraph is
 * word-wrapped independently. For the map hover card's own description
 * text, which core hands over already broken into short paragraphs.
 */
export function wrapBitmapParagraphs(text: string, maxChars: number): string[] {
  return text.split("\n").flatMap((paragraph) =>
    paragraph.trim() === "" ? [""] : wrapBitmapText(paragraph, maxChars),
  );
}

/** The standard visually-hidden pattern: present to a screen reader, absent
 * from the rendered page, so a canvas blit still has a real text equivalent. */
function styleAsScreenReaderOnly(el: HTMLElement): void {
  Object.assign(el.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    whiteSpace: "nowrap",
  });
}

/**
 * A ready-to-insert block of bitmap-rendered lines: one canvas per line (each
 * `aria-hidden`, since its pixels are a blit, not real text) stacked in a
 * plain wrapper div, plus one visually-hidden span carrying the same text so
 * a screen reader still reads it.
 */
export function bitmapTextBlock(
  lines: readonly (readonly BitmapRun[])[],
  cellWidth: number,
  cellHeight: number,
  dpr: number,
): HTMLDivElement {
  const wrap = document.createElement("div");
  for (const runs of lines) {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.display = "block";
    paintBitmapLine(canvas, runs, cellWidth, cellHeight, dpr);
    wrap.appendChild(canvas);
  }
  const label = document.createElement("span");
  label.textContent = lines.map((runs) => runs.map((run) => run.text).join("")).join(" ");
  styleAsScreenReaderOnly(label);
  wrap.appendChild(label);
  return wrap;
}

/**
 * Paint `text` as a button's visible label: a small canvas child plus
 * `aria-label` on the button itself (a native button already carries that,
 * so no separate hidden span is needed the way a plain div needs one).
 */
export function paintBitmapButtonLabel(
  button: HTMLButtonElement,
  text: string,
  css: string,
  cellWidth: number,
  cellHeight: number,
  dpr: number,
): void {
  button.replaceChildren();
  if (!button.hasAttribute("aria-label")) button.setAttribute("aria-label", text);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.display = "block";
  paintBitmapLine(canvas, [{ text, css }], cellWidth, cellHeight, dpr);
  button.appendChild(canvas);
}
