/**
 * The `qol` mod's behaviour, as the mod's OWN code.
 *
 * Nothing in this file is compiled into core. Delete this folder and the game
 * loses auto-dig entirely - there is no `qol.autoDig` string, and no dig-on-walk
 * branch, anywhere in packages/core. That is the whole point of the mod being a
 * mod: making something a mod means excluding it from the core game (2026-07-29).
 *
 * ------------------------------------------------------------------
 * ENTRY POINT CONTRACT - one shape, for every mod and every front end
 * ------------------------------------------------------------------
 *
 * A mod that runs code default-exports a ModPlugin (src/mod-plugin.ts):
 *
 *   export default { api: 1, hooks(ctx) { ... } }
 *
 * `ctx.flags` is the host's RESOLVED per-patch choice map: every `rules[].flag`
 * this mod declares in its manifest.json, mapped to the value the player's toggles
 * settled on (manifest `default` unless they changed it). The host calls `hooks`
 * ONCE per enabled mod, in load order, and folds the results with composeModHooks
 * (core/mod/hooks.ts) into the single ModHooks core holds.
 *
 * `ctx.core` is the ENGINE, handed in. This file imports @rpgm-tools/neo-angband-core for
 * TYPES ONLY, and that is not a style choice. The same source is built to the
 * `plugin.js` that ships in this mod's own repository, and a module fetched from a
 * folder cannot resolve a bare specifier - nor should it, because a bundled copy of
 * core would give the plugin its own registries and singletons while the game ran
 * on another set, which is a failure with no error message anywhere. See
 * src/mod-plugin.ts's header for the full argument.
 *
 * Three rules make the shape work:
 *
 *  1. THE MOD READS ITS OWN FLAGS. Core never sees a flag name. A hook is
 *     installed only if the patch that needs it is on, so a patch the player
 *     switched off is not merely inert - its hook is ABSENT, and core takes the
 *     faithful path with one undefined check.
 *  2. NEVER RETURN A FUNCTION THAT SELF-DISABLES. `walkBlockedByDiggable: () =>
 *     flags.x ? ... : null` would be wrong even though it behaves the same: an
 *     installed hook is a promise to core that something wants that point, and
 *     composeModHooks would let it shadow a later mod's handler.
 *  3. A DISABLED MOD IS NEVER CALLED AT ALL. The host does not invoke this
 *     function for a mod the player has not enabled, so returning `{}` here
 *     means "enabled, but every patch off".
 *
 * The mod uses core's public API - the same API a third-party mod has. It touches
 * no private path and no test hook.
 */

import type { CaveCmdDeps, GameState, ModHooks } from "@rpgm-tools/neo-angband-core";

/**
 * The engine, as a type. `typeof import(...)` is type-only syntax, so this pulls
 * in no runtime dependency and the built plugin.js contains no import at all.
 */
type CoreApi = typeof import("@rpgm-tools/neo-angband-core");

/**
 * What this plugin needs from the host's context, structurally.
 *
 * Declared here rather than imported from src/mod-plugin.ts on purpose: this file
 * has to compile in a standalone mod repository that has no copy of the host. A
 * structural subset also states exactly what the mod touches, which is the honest
 * form of "the mod uses no private path".
 */
/**
 * `PrefErrorPolicy` (core, visuals/prefs.ts), structurally.
 *
 * Two axes rather than one number, because one number could not say both
 * things: whether the REST of a pref file is applied after a bad line, and how
 * many errors the player is told about.
 */
interface PrefErrorPolicyLike {
  continueAfterError: boolean;
  reportLimit: number;
}

/**
 * The engine, plus the one seam this mod needs that an older engine may not
 * have.
 *
 * `setPrefErrorPolicy` arrived with the engine that removed core's own error cap
 * (#272). Declared OPTIONAL for exactly the reason `ctx.prefs` is: manifest.json's
 * `engine` range is the gate, and this is the seatbelt for the day the two
 * disagree. On an engine that has it, `CoreApi` already declares it and this
 * intersection changes nothing.
 */
type CoreWithPrefPolicy = CoreApi & {
  readonly setPrefErrorPolicy?: (policy: PrefErrorPolicyLike | null) => void;
};

interface HookCtx {
  readonly flags: Readonly<Record<string, boolean>>;
  readonly core: CoreWithPrefPolicy;
  /**
   * This mod's own storage, kept OUTSIDE the character's save - the host's
   * `ctx.prefs`. Optional here because a host older than the one that added it
   * hands over nothing, and a mod that assumed otherwise would throw at boot on
   * a game the manifest's `engine` range should simply have refused. Belt and
   * braces: the range is the gate, this is the seatbelt.
   */
  readonly prefs?: {
    get(): unknown;
    set(value: unknown): void;
  };
  /** Whether this character was created this session rather than loaded. */
  readonly newCharacter?: boolean;
  /** The live game, when there is one. Absent during content composition. */
  readonly state?: {
    options?: OptionStateLike;
  };
  /** Emit a diagnostic line; the host decides where it goes. */
  readonly log?: (msg: string) => void;
}

/**
 * The part of core's OptionState this mod uses, structurally - same reason as
 * HookCtx: the mod names what it touches instead of importing a host type.
 */
interface OptionStateLike {
  get(name: string): boolean;
  set(name: string, value: boolean): boolean;
  isBirth(name: string): boolean;
  isCheat(name: string): boolean;
  isScore(name: string): boolean;
  hitpointWarn: number;
  delayFactor: number;
  lazymoveDelay: number;
}

/** What this mod keeps in ctx.prefs. Versioned, so a later shape can migrate. */
interface RememberedSettings {
  /** The shape of this object, not the mod's version. */
  readonly v: 1;
  /** Option name -> value, for the options this mod is allowed to remember. */
  readonly values: Record<string, boolean>;
  readonly hitpointWarn: number;
  readonly delayFactor: number;
  readonly lazymoveDelay: number;
}

/**
 * The option snapshot core hands to `optionsChanged`, structurally.
 */
interface OptionSnapshot {
  values: Record<string, boolean>;
  hitpointWarn: number;
  delayFactor: number;
  lazymoveDelay: number;
}

/**
 * Whether this mod may remember `name`.
 *
 * THREE EXCLUSIONS, and each is a decision rather than a limitation:
 *
 *  - BIRTH options are locked into a character at creation and `set()` refuses
 *    them afterwards, so remembering one here could never apply it. They already
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
 */
/**
 * How many parse errors one pref file may report before the rest go unmentioned.
 *
 * TWENTY, which is the number core itself used to carry as `PARSE_ERROR_LIMIT`
 * before #272 established it had no counterpart in Angband 4.2.6 and moved it
 * here. Kept at the familiar value rather than picked afresh: a player who had
 * a mangled pref file under the old engine sees the same message run.
 *
 * It is a REPORT cap only. Core keeps applying the file either way, which is the
 * half of the old behaviour that was actually worth having - the old cap threw
 * away everything below the twentieth error, and nobody wanted that.
 */
const PREF_ERROR_REPORT_LIMIT = 20;

function mayRemember(opts: OptionStateLike, name: string, cheats: boolean): boolean {
  if (opts.isBirth(name)) return false;
  if (opts.isCheat(name) || opts.isScore(name)) return cheats;
  return true;
}

/*
 * "Hover cards on the Map overview" (qol.mapHoverCards): inspect one cell of
 * the (M)ap overview without leaving it.
 *
 * WHAT IT SHOWS. Every resolvable cave cell: terrain, creature, item, trap,
 * shop entrance, or the player's own grid. Text comes from describeLookGrid
 * (the same knowledge gate as the main-screen look command). The card also
 * tries to show a magnified tile snapshot cropped from the graphics overview
 * overlay when one is mounted, otherwise a magnified sample of the terminal
 * cell on #game.
 *
 * INPUT. Mouse: dwell on one grid for HOVER_DWELL_MS, then show; leaving that
 * grid closes the card. Touch/pen: hold one grid for TOUCH_HOLD_MS, then show;
 * the card stays until a tap elsewhere. Both paths stop the overview's own
 * window-capture pointerdown dismiss while the pointer is over a map cell, so
 * a click or hold inspects instead of closing the map (keys still dismiss).
 *
 * WHY THIS IS RAW DOM RATHER THAN A `regions()` DECLARATION. A mod's own
 * declared region only paints while the shell's main render loop runs, and
 * the (M)ap overview holds the terminal without going through it - core
 * draws the box once (paintLevelMapOnTerminal, overlay.ts) and does not
 * repaint on mouse movement, so a region's `paint()` never fires while the
 * overview is open. The overview's own dismiss handlers are raw
 * `window`/`document` listeners for the same reason - this mirrors that, the
 * way neo-angband-mod-forge's own overlay does for the same class of problem.
 * No manifest capability gates this: none exists for it, by that same mod's
 * own reasoning ("a ui:dom.overlay capability would add a consent string and
 * no containment").
 *
 * WHY "IS THE OVERVIEW OPEN" IS A GUESS. Nothing in the mod ABI publishes
 * which screen is currently on top - only `frontend()` (a full renderer
 * replacement, wildly disproportionate to a hover card) ever sees that. This
 * arms on an 'M' keydown and disarms on any other key (the overview's key
 * dismiss) or on a pointerdown outside the map box. A player who types a
 * capital M elsewhere (naming a character) can arm this briefly; nothing is
 * drawn unless the pointer also resolves to a cave grid.
 *
 * WHY THE PIXEL<->CELL MATH IS REPLICATED RATHER THAN IMPORTED. A mod
 * cannot import packages/web (only packages/core, and only for types) - the
 * game's own `GlyphTerm.cellAt` (term.ts) is unreachable. The formula below
 * mirrors its FIXED-mode branch (term.ts `fitFixed`/`cellAt`): the terminal
 * is TERM_COLS x TERM_ROWS and the default bitmap glyph is GLYPH_W x GLYPH_H.
 */

/** term.ts FIXED_COLS/FIXED_ROWS - the game's terminal grid. */
const TERM_COLS = 80;
const TERM_ROWS = 24;
/** font-16x24.ts FONT_16X24 - the default bitmap glyph's native pixel size. */
const GLYPH_W = 16;
const GLYPH_H = 24;
/** Mouse dwell before a card opens (ms). */
export const HOVER_DWELL_MS = 2000;
/** Touch/pen hold before a card opens (ms). */
export const TOUCH_HOLD_MS = 1000;
/** Magnified tile preview edge length inside the card (CSS px). */
const TILE_PREVIEW_PX = 64;

/** A plain rectangle, the shape `Element.getBoundingClientRect()` answers -
 * spelled out so this stays testable without a real DOM element. */
interface ClientRectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Client-space pixel -> character-grid cell, mirroring `GlyphTerm.cellAt`'s
 * fixed-mode formula (term.ts): the largest uniformly-scaled glyph that fits
 * the box, centred (letterboxed). Null outside the grid.
 */
export function hoverCellAt(
  rect: ClientRectLike,
  clientX: number,
  clientY: number,
): { readonly col: number; readonly row: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const scale = Math.min(rect.width / (GLYPH_W * TERM_COLS), rect.height / (GLYPH_H * TERM_ROWS));
  const cellW = Math.max(4, Math.floor(GLYPH_W * scale));
  const cellH = Math.max(6, Math.floor(GLYPH_H * scale));
  const offsetX = Math.max(0, Math.floor((rect.width - cellW * TERM_COLS) / 2));
  const offsetY = Math.max(0, Math.floor((rect.height - cellH * TERM_ROWS) / 2));
  const col = Math.floor((clientX - rect.left - offsetX) / cellW);
  const row = Math.floor((clientY - rect.top - offsetY) / cellH);
  if (col < 0 || col >= TERM_COLS || row < 0 || row >= TERM_ROWS) return null;
  return { col, row };
}

/**
 * The (M)ap overview's own box: a 1-cell '+'-cornered border (window_make,
 * ui-output.c) around min(TERM_COLS-2, width) x min(TERM_ROWS-2, height)
 * content cells (see this game's overlay.ts paintLevelMapOnTerminal and
 * mapview.ts buildOverview, whose scaling this inverts). Screen cell
 * (col, row) -> the cave grid it stands for; null on the border, outside the
 * box, or off a level too small to fill it.
 */
export function hoverCaveGrid(
  col: number,
  row: number,
  width: number,
  height: number,
): { readonly x: number; readonly y: number } | null {
  if (width < 1 || height < 1) return null;
  const mapW = Math.min(TERM_COLS - 2, width);
  const mapH = Math.min(TERM_ROWS - 2, height);
  if (mapW < 1 || mapH < 1) return null;
  const bx = col - 1;
  const by = row - 1;
  if (bx < 0 || bx >= mapW || by < 0 || by >= mapH) return null;
  /* buildOverview scales cave (x,y) to floor(x*mapW/width), floor(y*mapH/height)
   * - several cave cells can land on one screen cell. This inverts it by
   * taking the CENTRE of the bucket that would have scaled here, which is
   * exact when the level fits the box and a representative pick otherwise. */
  const x = Math.min(width - 1, Math.floor(((bx + 0.5) * width) / mapW));
  const y = Math.min(height - 1, Math.floor(((by + 0.5) * height) / mapH));
  return { x, y };
}

/** What kind of content the card is describing. */
export type HoverCardKind =
  | "character"
  | "creature"
  | "item"
  | "trap"
  | "shop"
  | "terrain";

export interface HoverCardContent {
  readonly kind: HoverCardKind;
  readonly text: string;
  readonly title: string;
}

/** The subset of ctx.core this feature calls, structurally - see this file's
 * header on why a mod names what it touches rather than importing the whole
 * shape for a cast. Public exports of the engine (game/target-loop.ts,
 * game/known.ts); trap/feature helpers are optional so an older engine still
 * gets text, just with coarser kind labels. */
interface LookApi {
  describeLookGrid(
    state: GameState,
    grid: { x: number; y: number },
    mode: number,
  ): { text: string; mon: unknown };
  knownPile(state: GameState, grid: { x: number; y: number }): readonly unknown[];
  squareIsVisibleTrap?(state: GameState, grid: { x: number; y: number }): boolean;
}

/** Live state fields the card classifier reads beyond describeLookGrid. */
interface HoverState {
  readonly actor?: { readonly grid?: { readonly x: number; readonly y: number } };
  readonly chunk?: {
    readonly width: number;
    readonly height: number;
    feature?(grid: { x: number; y: number }): { shopnum?: number };
  };
}

const KIND_TITLE: Readonly<Record<HoverCardKind, string>> = {
  character: "Character",
  creature: "Creature",
  item: "Item",
  trap: "Trap",
  shop: "Shop",
  terrain: "Terrain",
};

/**
 * Context-sensitive card content for one cave grid. Always knowledge-gated
 * through describeLookGrid. Returns null only when the look API answers with
 * an empty string (nothing known / nothing to say).
 */
export function hoverCardContent(
  core: LookApi,
  state: HoverState & GameState,
  grid: { x: number; y: number },
): HoverCardContent | null {
  const result = core.describeLookGrid(state, grid, 0);
  const text = result?.text?.trim() ?? "";
  if (!text) return null;

  const player = state.actor?.grid;
  let kind: HoverCardKind;
  if (player && player.x === grid.x && player.y === grid.y) {
    kind = "character";
  } else if (result.mon) {
    kind = "creature";
  } else if (core.knownPile(state, grid).length > 0) {
    kind = "item";
  } else if (core.squareIsVisibleTrap?.(state, grid)) {
    kind = "trap";
  } else if ((state.chunk?.feature?.(grid)?.shopnum ?? 0) > 0) {
    kind = "shop";
  } else {
    kind = "terrain";
  }
  return { kind, text, title: KIND_TITLE[kind] };
}

/**
 * Back-compat text helper: the card body string, or null when there is none.
 * Prefer hoverCardContent when the kind label matters.
 */
export function hoverCardText(
  core: LookApi,
  state: GameState,
  grid: { x: number; y: number },
): string | null {
  return hoverCardContent(core, state, grid)?.text ?? null;
}

let hoverCardsWired = false;

/** Style + position the card element, clamped to the viewport, near the
 * cursor rather than exactly under it (so the cursor is not hidden by it). */
function positionHoverCard(el: HTMLElement, clientX: number, clientY: number): void {
  const GAP = 14;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let left = clientX + GAP;
  let top = clientY + GAP;
  if (left + w > vw) left = clientX - GAP - w;
  if (top + h > vh) top = clientY - GAP - h;
  el.style.left = `${String(Math.max(0, left))}px`;
  el.style.top = `${String(Math.max(0, top))}px`;
}

function buildHoverCardElement(): {
  root: HTMLDivElement;
  title: HTMLDivElement;
  img: HTMLCanvasElement;
  body: HTMLDivElement;
} {
  const root = document.createElement("div");
  root.setAttribute("data-qol-map-hover-card", "");
  Object.assign(root.style, {
    position: "fixed",
    zIndex: "2100",
    pointerEvents: "none",
    display: "none",
    maxWidth: "360px",
    padding: "8px 10px",
    borderRadius: "6px",
    font: "13px monospace",
    lineHeight: "1.35",
    background: "rgba(12,12,16,0.94)",
    color: "#e8e8e8",
    border: "1px solid #777",
    boxShadow: "0 4px 16px rgba(0,0,0,0.45)",
  });

  const title = document.createElement("div");
  Object.assign(title.style, {
    fontWeight: "700",
    marginBottom: "6px",
    color: "#f0d878",
    letterSpacing: "0.02em",
  });

  const row = document.createElement("div");
  Object.assign(row.style, {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
  });

  const img = document.createElement("canvas");
  img.width = TILE_PREVIEW_PX;
  img.height = TILE_PREVIEW_PX;
  Object.assign(img.style, {
    width: `${String(TILE_PREVIEW_PX)}px`,
    height: `${String(TILE_PREVIEW_PX)}px`,
    imageRendering: "pixelated",
    flex: "0 0 auto",
    background: "#000",
    border: "1px solid #555",
  });

  const body = document.createElement("div");
  Object.assign(body.style, {
    whiteSpace: "pre-wrap",
    flex: "1 1 auto",
    minWidth: "0",
  });

  row.appendChild(img);
  row.appendChild(body);
  root.appendChild(title);
  root.appendChild(row);
  document.body.appendChild(root);
  return { root, title, img, body };
}

/**
 * Crop one cave cell from the graphics overview overlay (overlay.ts
 * mountGraphicsOverview) when present; otherwise sample the matching
 * terminal cell from #game. Returns false when neither source has pixels.
 */
function paintTilePreview(
  canvas: HTMLCanvasElement,
  grid: { x: number; y: number },
  chunk: { width: number; height: number },
  termCell: { col: number; row: number } | null,
): boolean {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) return false;
  ctx2d.imageSmoothingEnabled = false;
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);

  const overlays = Array.from(
    document.querySelectorAll<HTMLCanvasElement>('body > canvas[aria-hidden="true"]'),
  );
  for (const src of overlays) {
    if (src === canvas || src.id === "game") continue;
    if (src.width < 1 || src.height < 1) continue;
    if (chunk.width < 1 || chunk.height < 1) continue;
    const cellW = src.width / chunk.width;
    const cellH = src.height / chunk.height;
    if (cellW < 1 || cellH < 1) continue;
    try {
      ctx2d.drawImage(
        src,
        grid.x * cellW,
        grid.y * cellH,
        cellW,
        cellH,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      return true;
    } catch {
      /* Cross-origin or zero-size draw - try the next source. */
    }
  }

  const game = document.getElementById("game");
  if (!(game instanceof HTMLCanvasElement) || !termCell) return false;
  if (game.width < 1 || game.height < 1) return false;
  const cellW = game.width / TERM_COLS;
  const cellH = game.height / TERM_ROWS;
  if (cellW < 1 || cellH < 1) return false;
  try {
    ctx2d.drawImage(
      game,
      termCell.col * cellW,
      termCell.row * cellH,
      cellW,
      cellH,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Wire the feature up, once, for the lifetime of this page - see this
 * section's header for why register() (which sees ctx.state) rather than
 * hooks() (which never does).
 */
function installMapHoverCards(ctx: HookCtx): void {
  if (ctx.flags["qol.mapHoverCards"] !== true) return;
  if (hoverCardsWired) return;
  if (typeof document === "undefined" || typeof window === "undefined") return;
  hoverCardsWired = true;

  const core = ctx.core as unknown as LookApi;
  const card = buildHoverCardElement();
  let mapOpenGuess = false;
  let touchPinned = false;
  let dwellTimer: ReturnType<typeof setTimeout> | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let dwellGridKey: string | null = null;
  let holdPointerId: number | null = null;
  let shownGridKey: string | null = null;
  let lastClientX = 0;
  let lastClientY = 0;

  const gridKey = (g: { x: number; y: number }): string => `${String(g.x)},${String(g.y)}`;

  const clearDwell = (): void => {
    if (dwellTimer !== null) clearTimeout(dwellTimer);
    dwellTimer = null;
    dwellGridKey = null;
  };

  const clearHold = (): void => {
    if (holdTimer !== null) clearTimeout(holdTimer);
    holdTimer = null;
    holdPointerId = null;
  };

  const hide = (): void => {
    card.root.style.display = "none";
    shownGridKey = null;
    touchPinned = false;
  };

  const resolveCaveGrid = (
    clientX: number,
    clientY: number,
  ): {
    grid: { x: number; y: number };
    cell: { col: number; row: number };
    chunk: { width: number; height: number };
  } | null => {
    const game = document.getElementById("game");
    if (!game) return null;
    const cell = hoverCellAt(game.getBoundingClientRect(), clientX, clientY);
    if (!cell) return null;
    const state = ctx.state as unknown as (HoverState & GameState) | undefined;
    const chunk = state?.chunk;
    if (!chunk || chunk.width < 1 || chunk.height < 1) return null;
    const grid = hoverCaveGrid(cell.col, cell.row, chunk.width, chunk.height);
    if (!grid) return null;
    return { grid, cell, chunk };
  };

  const showAt = (
    clientX: number,
    clientY: number,
    resolved: {
      grid: { x: number; y: number };
      cell: { col: number; row: number };
      chunk: { width: number; height: number };
    },
  ): boolean => {
    const state = ctx.state as unknown as (HoverState & GameState) | undefined;
    if (!state) return false;
    const content = hoverCardContent(core, state, resolved.grid);
    if (!content) return false;
    card.title.textContent = content.title;
    card.body.textContent = content.text;
    const painted = paintTilePreview(card.img, resolved.grid, resolved.chunk, resolved.cell);
    card.img.style.display = painted ? "block" : "none";
    card.root.style.display = "block";
    positionHoverCard(card.root, clientX, clientY);
    shownGridKey = gridKey(resolved.grid);
    return true;
  };

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "M") {
      mapOpenGuess = true;
      return;
    }
    mapOpenGuess = false;
    clearDwell();
    clearHold();
    hide();
  });

  /*
   * Capture-phase, registered at boot: runs BEFORE the overview's own
   * window-capture pointerdown dismiss (which is added when M opens). Stopping
   * that dismiss while the pointer is over a map cell is what makes hover/hold
   * usable; a tap outside the box still closes the map.
   */
  window.addEventListener(
    "pointerdown",
    (ev: PointerEvent) => {
      if (!mapOpenGuess) return;
      const resolved = resolveCaveGrid(ev.clientX, ev.clientY);

      if (touchPinned) {
        const same =
          resolved !== null && shownGridKey !== null && gridKey(resolved.grid) === shownGridKey;
        if (same) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          return;
        }
        hide();
        clearHold();
        if (!resolved) {
          mapOpenGuess = false;
          return;
        }
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (ev.pointerType === "touch" || ev.pointerType === "pen") {
          holdPointerId = ev.pointerId;
          const atDown = resolved;
          holdTimer = setTimeout(() => {
            holdTimer = null;
            if (showAt(ev.clientX, ev.clientY, atDown)) touchPinned = true;
          }, TOUCH_HOLD_MS);
        }
        return;
      }

      if (!resolved) {
        mapOpenGuess = false;
        clearDwell();
        clearHold();
        hide();
        return;
      }

      ev.preventDefault();
      ev.stopImmediatePropagation();
      clearDwell();

      if (ev.pointerType === "touch" || ev.pointerType === "pen") {
        clearHold();
        holdPointerId = ev.pointerId;
        const atDown = resolved;
        holdTimer = setTimeout(() => {
          holdTimer = null;
          if (showAt(ev.clientX, ev.clientY, atDown)) touchPinned = true;
        }, TOUCH_HOLD_MS);
      }
    },
    true,
  );

  window.addEventListener("pointerup", (ev: PointerEvent) => {
    if (holdPointerId !== null && ev.pointerId === holdPointerId && holdTimer !== null) {
      clearHold();
    }
  });
  window.addEventListener("pointercancel", (ev: PointerEvent) => {
    if (holdPointerId !== null && ev.pointerId === holdPointerId) clearHold();
  });

  document.addEventListener("pointermove", (ev: PointerEvent) => {
    if (!mapOpenGuess) return;
    lastClientX = ev.clientX;
    lastClientY = ev.clientY;
    if (ev.pointerType === "touch" || ev.pointerType === "pen") {
      if (holdTimer !== null && holdPointerId === ev.pointerId) {
        const resolved = resolveCaveGrid(ev.clientX, ev.clientY);
        if (!resolved) clearHold();
      }
      return;
    }
    if (touchPinned) return;

    const resolved = resolveCaveGrid(ev.clientX, ev.clientY);
    if (!resolved) {
      clearDwell();
      if (shownGridKey !== null) hide();
      return;
    }
    const key = gridKey(resolved.grid);
    if (shownGridKey === key) {
      positionHoverCard(card.root, ev.clientX, ev.clientY);
      return;
    }
    if (shownGridKey !== null) hide();
    if (dwellGridKey === key) return;
    clearDwell();
    dwellGridKey = key;
    dwellTimer = setTimeout(() => {
      dwellTimer = null;
      const still = resolveCaveGrid(lastClientX, lastClientY);
      if (!still || gridKey(still.grid) !== key) return;
      showAt(lastClientX, lastClientY, still);
    }, HOVER_DWELL_MS);
  });
}

export default {
  api: 1,

  hooks(ctx: HookCtx): ModHooks {
    const { flags, core } = ctx;
    const hooks: ModHooks = {};

    /*
     * "Auto-dig on walk" (qol.autoDig), ported from neostryder's Angband fork
     * (do_cmd_movement_tunnel_test / the move_player change): walking into known
     * diggable terrain you can actually dig begins one tunnel attempt instead of
     * faithful 4.2.6's no-energy bump.
     *
     * Both core primitives this needs are public, and using them rather than
     * reimplementing them is deliberate - a reimplemented dig roll would drift
     * from the tunnel command's:
     *
     *  - movementTunnelTest: known, not permanent rock, impassable, diggable, and
     *    diggable with a positive chance for the current weapon / best pack digger.
     *    RNG-FREE, which is what lets this decline for free.
     *  - tunnelAux: ONE do_cmd_tunnel_aux attempt with the real roll, messages and
     *    payouts (rubble finds, treasure). It DRAWS RNG, so it is reached only
     *    after the decision to handle the walk is final.
     *
     * Declining returns null BEFORE any draw, so a walk this mod does not handle
     * leaves the stream exactly where faithful core would - the hook's documented
     * contract, and what makes the mod safe to enable mid-character.
     *
     * Source-fork behaviour, kept exactly: dig, do NOT step onto the grid, and
     * spend a full move (energy_use = move_energy) whether the attempt succeeded
     * or not.
     */
    if (flags["qol.autoDig"] === true) {
      hooks.walkBlockedByDiggable = (state, grid, deps): number | null => {
        if (!core.movementTunnelTest(state, grid)) return null;
        /* deps is the live CaveCmdDeps the session built; core types it as unknown
         * so ModHooks does not drag the cave-command types into every consumer. */
        core.tunnelAux(state, grid, deps as CaveCmdDeps);
        return state.z.moveEnergy;
      };
    }

    /*
     * "Keep reading a pref file past a mistake" (qol.forgivingPrefFiles).
     *
     * Angband 4.2.6 stops dead at the first line of a pref file it cannot parse:
     * process_pref_file_named (ui-prefs.c L1225-1231) prints one error and
     * `break`s out of the read loop, so one typo on line 3 of a 900-line
     * graphics pack silently costs you lines 4 to 900. Core reproduces that,
     * because core reproduces 4.2.6.
     *
     * Until #272 the port did not: it carried a 20-error cap of its own, with an
     * environment override, which is a convenience Angband never shipped. A
     * convenience belongs in a mod, so here it is - and it is BETTER than the
     * thing it replaces, because the old cap still
     * threw the rest of the file away once it was reached. This applies the
     * whole file and only limits what you are TOLD.
     *
     * NOT A ModHooks MEMBER, and that is core's shape rather than this mod's
     * choice. The three readers this governs - the '=' menu's "Load a user pref
     * file", a mod's own `prefs` resource, and the graphics pack loader - have
     * no GameState in scope, and two of them run before there is one, so there
     * is no hooks object for them to consult. Core exposes a module-level
     * policy instead (setPrefErrorPolicy), which is the same shape as its sound
     * and rune registries.
     *
     * INSTALLED FROM hooks() rather than register(), because hooks() is the
     * earliest moment a mod runs - the host composes every enabled mod's hooks
     * before startGame - and the graphics pack is read during boot. register()
     * would be too late for it. Load order does the rest: the host calls hooks()
     * in load order, so the LAST mod to set a policy is the one that stands,
     * which is what the mod manager's row already promises the player.
     *
     * TURNING THIS OFF STILL TAKES IT AWAY. A module-level value in core would
     * outlive a mod being switched off inside one process - but switching a mod
     * off does not take effect inside one process. The manager prompts to save
     * and RELOADS, and after the reload this function is never called, so
     * nothing installs a policy and core is back on 4.2.6's.
     */
    if (flags["qol.forgivingPrefFiles"] === true) {
      const setPolicy = core.setPrefErrorPolicy;
      if (typeof setPolicy !== "function") {
        /* DELIBERATE, not a should-never-happen. `engine` stays ">=0.18.0"
         * because the other three toggles work perfectly on 0.18.0, and
         * raising the range to gate this one would refuse the whole mod and
         * cost a player auto-dig and remembered settings to buy a pref-file
         * convenience. So this pairing is allowed and this toggle degrades.
         *
         * It SAYS SO rather than going quietly inert, which is the failure
         * this project keeps finding: a switch that is on in the manager and
         * does nothing in the game is worse than one that refuses. */
        ctx.log?.("this game is too old to keep reading a pref file past a mistake");
      } else {
        setPolicy({
          continueAfterError: true,
          reportLimit: PREF_ERROR_REPORT_LIMIT,
        });
      }
    }

    /*
     * "Remember my settings" (qol.rememberSettings), the CAPTURE half.
     *
     * Angband keeps a character's options in that character's save, and nowhere
     * else - so a player who sets up the game the way they like it does it again
     * on the next character, and the one after that. Upstream's answer is the
     * pref file ('s' / 'r' in the options menu), which is a file the player has
     * to know exists and remember to write. This is the same idea with nobody
     * having to be told.
     *
     * The host fires optionsChanged when the '=' menu closes having changed
     * something. All this end does is write it down; nothing is applied here,
     * because the character in front of the player has just told the game what
     * they want and overwriting that would be absurd.
     */
    if (flags["qol.rememberSettings"] === true) {
      const prefs = ctx.prefs;
      if (!prefs) {
        /* The engine range in manifest.json should have refused this pairing.
         * If it somehow did not, say so - a silently inert mod is the failure
         * this project keeps finding. */
        ctx.log?.("this game is too old to remember settings (no ctx.prefs)");
      } else {
        /*
         * A THROWAWAY OptionState, used only to CLASSIFY names.
         *
         * `ctx.state` is not available here and never will be: the host builds
         * every mod's hooks BEFORE it starts the game, because the composed
         * ModHooks is an argument to startGame. So this half cannot read the
         * live option store - and does not need to. All it needs to know is
         * which names are birth / cheat / score options, which is a property of
         * the option TABLE, identical in every instance.
         *
         * Built from ctx.core rather than from a list kept here, so a name that
         * changes category in a future engine changes category for this mod on
         * the same day.
         */
        const classifier = new core.OptionState();
        const cheats = flags["qol.rememberCheats"] === true;
        hooks.optionsChanged = (snapshot: OptionSnapshot): void => {
          const values: Record<string, boolean> = {};
          for (const [name, value] of Object.entries(snapshot.values)) {
            if (mayRemember(classifier, name, cheats)) values[name] = value;
          }
          const remembered: RememberedSettings = {
            v: 1,
            values,
            hitpointWarn: snapshot.hitpointWarn,
            delayFactor: snapshot.delayFactor,
            lazymoveDelay: snapshot.lazymoveDelay,
          };
          prefs.set(remembered);
        };
      }
    }

    return hooks;
  },

  /*
   * "Remember my settings", the APPLY half.
   *
   * register() rather than hooks(), for one reason: this runs ONCE at boot with
   * the game already built, which is exactly the moment a new character's option
   * store exists and nothing has read it yet. A hook would have to be called by
   * something, and there is nothing in a turn that means "the character just
   * started".
   *
   * ONLY FOR A NEW CHARACTER. A loaded save carries its own options and they are
   * that character's - a player who set a save up one way must not have it
   * rewritten because they changed something on a different character last week.
   * `ctx.newCharacter` is the host's answer to that question and cannot be
   * derived here: turn 0 is not it (the game autosaves immediately after birth),
   * and neither is an empty save bag (a mod enabled mid-game has one too).
   *
   * The registry host is untouched. This mod declares no capabilities, so every
   * facade on it would throw - and it needs none of them.
   *
   * ALSO WHERE qol.mapHoverCards WIRES ITSELF UP (installMapHoverCards, above) -
   * same reason: it is the one seam that sees a live ctx.state, and unlike the
   * remember-settings apply half it is not gated on ctx.newCharacter, so it
   * runs first and unconditionally.
   */
  register(_host: unknown, ctx: HookCtx): void {
    installMapHoverCards(ctx);
    if (ctx.flags["qol.rememberSettings"] !== true) return;
    if (ctx.newCharacter !== true) return;
    const opts = ctx.state?.options;
    const stored = ctx.prefs?.get();
    if (!opts || !stored || typeof stored !== "object") return;

    const remembered = stored as Partial<RememberedSettings>;
    /* An unknown shape is IGNORED, not guessed at. This is the only version
     * there has ever been; the field exists so that the day there is a second
     * one, the first does not get read as if it were. */
    if (remembered.v !== 1) {
      ctx.log?.(`stored settings are version ${String(remembered.v)}; ignoring them`);
      return;
    }

    const cheats = ctx.flags["qol.rememberCheats"] === true;
    let applied = 0;
    for (const [name, value] of Object.entries(remembered.values ?? {})) {
      /* Filtered on the way IN as well as on the way out. The two toggles can
       * change between the write and the read - a player who remembered their
       * cheat options and then turned that toggle off must not keep inheriting
       * them from what is already stored. */
      if (!mayRemember(opts, name, cheats)) continue;
      /* set() answers false for an option this engine does not have, which is
       * what happens to a stored name after an engine upgrade removes one. Not
       * an error: the option is gone, so there is nothing to restore. */
      if (opts.set(name, value)) applied++;
    }
    if (typeof remembered.hitpointWarn === "number") {
      opts.hitpointWarn = remembered.hitpointWarn;
    }
    if (typeof remembered.delayFactor === "number") {
      opts.delayFactor = remembered.delayFactor;
    }
    if (typeof remembered.lazymoveDelay === "number") {
      opts.lazymoveDelay = remembered.lazymoveDelay;
    }
    ctx.log?.(`restored ${String(applied)} remembered option(s) onto the new character`);
  },
};
