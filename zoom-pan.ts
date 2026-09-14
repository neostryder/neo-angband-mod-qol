import {
  DEFAULT_DISPLAY_PREFERENCE,
  readDisplayPreference,
  readSubwindowZoomPreference,
  withDisplayPreference,
  withSubwindowZoomPreference,
  type DisplayPreference,
} from "./preferences";
import { FONT_16X24 } from "./bitmap-font";
import { paintBitmapButtonLabel, paintBitmapLine } from "./bitmap-text";

/* Deliberately finite: 8px still leaves a readable bitmap cell, while 128px is
 * double Shockbolt's native tile resolution.  The wider final steps keep the
 * useful low-end precision without making the largest manual rungs fussy. */
export const PLAY_ZOOM_CELL_HEIGHTS = [
  8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96, 112, 128,
] as const;
/* Subwindows start at core's compact 16px default and need room to become
 * smaller without making a tiled panel's labels needlessly huge.  Their ladder
 * is deliberately independent from the play view's wider 16-48px range. */
export const SUBWINDOW_ZOOM_CELL_HEIGHTS = [10, 12, 14, 16, 18, 20, 24] as const;
export const INTERFACE_ZOOM_SCALES = [0.8, 1, 1.25, 1.5] as const;
export const MAP_DETAIL_FACTORS = [0, 4, 2, 1] as const;
export const ACCESSIBILITY_ZOOM_INDEX = 9;

/* Vanilla's fixed 80 by 24 terminal leaves 66 map columns after the classic
 * sidebar and the reserved rightmost column, and 22 map rows between its
 * message and status lines.  The responsive default starts from that same
 * complete play view, then lets the live pane decide how large its cells can
 * be. */
const DEFAULT_PLAY_MAP_COLS = 66;
const DEFAULT_PLAY_GRID_ROWS = 24;
const RESERVED_RIGHT_COLUMN = 1;

export interface Pixels {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DisplaySnapshotLike {
  /** "store" is a shop screen and "modal" is every other full-screen takeover
   * (the Options Menu, an item-selection screen, ...): both must hide this
   * sidebar the same as "map" does, rather than paint the responsive status
   * column over a screen that owns the whole terminal (neo-angband #234,
   * #250). */
  readonly mode: "play" | "map" | "store" | "modal";
  readonly grid: {
    readonly cols: number;
    readonly rows: number;
    readonly cellWidth: number;
    readonly cellHeight: number;
  };
  readonly viewport: {
    readonly origin: { readonly x: number; readonly y: number };
    readonly size: { readonly width: number; readonly height: number };
    readonly screenOrigin?: { readonly x: number; readonly y: number };
  };
  readonly surface?: Pixels;
  readonly level: { readonly width: number; readonly height: number };
  readonly layout: "left" | "top" | "none";
  readonly regions: {
    readonly sidebar?: {
      readonly cells?: { readonly col: number; readonly row: number; readonly cols: number; readonly rows: number };
      readonly pixels?: Pixels;
    };
    readonly map?: {
      readonly cells?: { readonly col: number; readonly row: number; readonly cols: number; readonly rows: number };
      readonly pixels?: Pixels;
    };
  };
}

export interface DisplayLike {
  snapshot(): DisplaySnapshotLike;
  onKey(listener: (event: KeyboardEvent) => void): () => void;
  setGrid(request: {
    readonly cellHeight: number;
    readonly minCols: number;
    readonly minRows: number;
    readonly snapViewportToEven: boolean;
  } | null): void;
  setCamera(origin: { readonly x: number; readonly y: number } | null): void;
  setMapView(view: {
    readonly origin: { readonly x: number; readonly y: number };
    readonly size: { readonly width: number; readonly height: number };
  } | null): void;
  setSidebarExtent(extent: { readonly columns: number; readonly topRows: number } | null): void;
  setTileScaling(mode: "auto" | "crisp"): void;
  setFullMapOverview?(enabled: boolean): void;
  setStoreItemNameEllipsis?(enabled: boolean): void;
  setStoreSelectionDescription?(enabled: boolean): void;
  setVisualFilter(filter: string | null): void;
  repaint(): void;
}

export interface SubwindowInfoLike {
  readonly id: string;
  readonly bounds: Pixels;
  readonly focused: boolean;
  readonly grid: {
    readonly cols: number;
    readonly rows: number;
    readonly cellWidth: number;
    readonly cellHeight: number;
  };
}

export interface SubwindowControlLike {
  readonly glyph: string;
  readonly title?: string;
  onActivate(): void;
}

export interface SubwindowsLike {
  list(): readonly SubwindowInfoLike[];
  setGrid(id: string, request: {
    readonly cellHeight: number;
    readonly minCols: number;
    readonly minRows: number;
    readonly snapViewportToEven: boolean;
  } | null): void;
  addControl(id: string, key: string, control: SubwindowControlLike): () => void;
}

interface PreferenceStoreLike {
  get(): unknown;
  set(value: unknown): void;
}

export interface ZoomPanContext {
  readonly flags: Readonly<Record<string, boolean>>;
  readonly prefs?: PreferenceStoreLike | undefined;
  readonly display?: DisplayLike | undefined;
  /** Optional while no tiled subwindow shell is mounted. */
  readonly subwindows?: SubwindowsLike | undefined;
  readonly state?: {
    readonly actor?: { readonly grid?: { readonly x: number; readonly y: number } };
  } | undefined;
  readonly log?: ((message: string) => void) | undefined;
}

interface HudRunLike {
  readonly text: string;
  readonly css: string;
}

interface HudEntryLike {
  readonly key: string;
  readonly runs: readonly HudRunLike[];
  /** The absolute terminal row this entry prints at (core's `hud-view.ts`).
   * Consecutive entries skip a row wherever core's side_handlers[] table has a
   * blank grouping row between them - that gap is what makes the column read
   * as vitals / stats / combat groups instead of one solid block. Optional
   * because a mod-supplied section (not core's own) may not carry it. */
  readonly screen?: { readonly row: number };
}

interface HudSectionLike {
  readonly entries: readonly HudEntryLike[];
  readonly region?: { readonly pixels?: Pixels };
}

interface HudFrameLike {
  readonly layout: "left" | "top" | "none";
}

interface TouchPoint {
  x: number;
  y: number;
}

interface TouchGesture {
  context: "sidebar" | "view";
  distance: number;
  center: TouchPoint;
}

interface SidebarRuntime {
  readonly host: HTMLDivElement;
  readonly body: HTMLDivElement;
  page: number;
  layout: HudFrameLike["layout"];
  entryCount: number;
  section: HudSectionLike | null;
  frame: HudFrameLike | null;
}

interface ZoomRuntime {
  readonly ctx: ZoomPanContext;
  readonly display: DisplayLike;
  preference: DisplayPreference;
  /** Until the player changes play zoom, fit the vanilla-sized play view to
   * this pane instead of treating the persisted default ladder rung as a
   * ceiling.  A manual zoom immediately returns to the established ladder. */
  useDefaultPlayFill: boolean;
  readonly cleanups: Array<() => void>;
  readonly touches: Map<number, TouchPoint>;
  gesture: TouchGesture | null;
  sidebar: SidebarRuntime | null;
  /** The layout the latest HUD frame selected, including the no-sidebar mode. */
  sidebarLayout: HudFrameLike["layout"];
  gridActive: boolean;
  bootPhase: "title" | "birth" | "name" | "game-pending";
  activationTimer: ReturnType<typeof setTimeout> | null;
  readonly activationActions: Array<() => void>;
  screenFitActive: boolean;
  screenFitTimer: ReturnType<typeof setTimeout> | null;
  /** The core-measured play surface used for the last responsive layout. */
  responsiveSurface: Pick<Pixels, "width" | "height"> | null;
  /** Polls the display's own mode so the sidebar hides for a shop screen the
   * same as it does for the map, even though nothing else in this file is
   * told when a store opens or closes: entering one is reachable by a raw
   * mouse click (click-to-pathfind) as much as by a tracked keypress, and a
   * shop's own render loop never calls back into paintSidebar the way
   * ordinary play does (neo-angband #234). */
  sidebarVisibilityTimer: ReturnType<typeof setInterval> | null;
  /** Each tiled panel has an independent rung, retained while it is hidden. */
  readonly subwindowZoomSteps: Map<string, number>;
  /** Restored zoom needs applying once when a panel first becomes visible. */
  readonly restoredSubwindowZoomPanels: Set<string>;
  /** Title-bar control unregister functions for panels visible this instant. */
  readonly subwindowControlCleanups: Map<string, readonly [() => void, () => void]>;
  subwindowControlsTimer: ReturnType<typeof setInterval> | null;
}

let runtime: ZoomRuntime | null = null;
let configuredDisplay: DisplayLike | null = null;

function markGridState(value: string): void {
  if (typeof document !== "undefined" && document.body) {
    document.body.setAttribute("data-qol-grid-state", value);
  }
}

function initialBootPhase(): ZoomRuntime["bootPhase"] {
  if (typeof location === "undefined") return "title";
  const params = new URL(location.href).searchParams;
  if (params.has("agent")) return "game-pending";
  try {
    if (sessionStorage.getItem("neo-angband-birth-done") === "1") return "game-pending";
    if (params.has("new")) return "birth";
    if (sessionStorage.getItem("neo-angband-skip-title") === "1") return "game-pending";
  } catch {
    if (params.has("new")) return "birth";
  }
  return "title";
}

export function stepIndex(index: number, direction: number, last: number): number {
  return Math.max(0, Math.min(last, index + Math.sign(direction)));
}

export function snapEven(value: number): number {
  return Math.round(value / 2) * 2;
}

export function pointInPixels(x: number, y: number, pixels: Pixels | undefined): boolean {
  return !!pixels &&
    x >= pixels.x &&
    y >= pixels.y &&
    x < pixels.x + pixels.width &&
    y < pixels.y + pixels.height;
}

function evenSpan(value: number, limit: number): number {
  if (limit <= 1) return limit;
  const clamped = Math.max(2, Math.min(limit, Math.floor(value)));
  return clamped === limit ? clamped : clamped - (clamped % 2);
}

export function mapViewFor(
  snapshot: DisplaySnapshotLike,
  detail: number,
  center: { readonly x: number; readonly y: number },
): { origin: { x: number; y: number }; size: { width: number; height: number } } | null {
  const factor = MAP_DETAIL_FACTORS[detail] ?? 0;
  if (factor === 0) return null;
  const width = evenSpan(Math.max(2, snapshot.grid.cols - 2) * factor, snapshot.level.width);
  const height = evenSpan(Math.max(2, snapshot.grid.rows - 2) * factor, snapshot.level.height);
  const maxX = Math.max(0, snapshot.level.width - width);
  const maxY = Math.max(0, snapshot.level.height - height);
  const x = Math.max(0, Math.min(maxX, snapEven(center.x - Math.floor(width / 2))));
  const y = Math.max(0, Math.min(maxY, snapEven(center.y - Math.floor(height / 2))));
  return { origin: { x, y }, size: { width, height } };
}

export function pannedOrigin(
  snapshot: DisplaySnapshotLike,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const maxX = Math.max(0, snapshot.level.width - snapshot.viewport.size.width);
  const maxY = Math.max(0, snapshot.level.height - snapshot.viewport.size.height);
  return {
    x: Math.max(0, Math.min(maxX, snapEven(snapshot.viewport.origin.x + dx))),
    y: Math.max(0, Math.min(maxY, snapEven(snapshot.viewport.origin.y + dy))),
  };
}

export function pinchDirection(previous: number, next: number): -1 | 0 | 1 {
  if (previous <= 0 || next <= 0) return 0;
  const change = Math.log2(next / previous);
  return change >= 0.18 ? 1 : change <= -0.18 ? -1 : 0;
}

export interface SidebarPagePlan {
  readonly page: number;
  readonly pages: number;
  readonly start: number;
  readonly end: number;
  readonly fontSize: number;
}

export function sidebarPagePlan(
  entryCount: number,
  layout: HudFrameLike["layout"],
  pixels: Pick<Pixels, "width" | "height">,
  scale: number,
  requestedPage: number,
): SidebarPagePlan {
  const preferredFont = Math.max(11, Math.round(14 * scale));
  let perPage = Math.max(1, entryCount);
  if (layout === "top") {
    const pagerWidth = 62;
    const entryWidth = 82 * scale;
    perPage = Math.max(1, Math.floor(Math.max(1, pixels.width - pagerWidth) / entryWidth));
  } else if (layout === "left") {
    const lineHeight = preferredFont * 1.25;
    const visibleRows = Math.max(1, Math.floor((pixels.height - preferredFont * 0.8) / lineHeight));
    perPage = entryCount > visibleRows ? Math.max(1, visibleRows - 1) : visibleRows;
  }
  const pages = Math.max(1, Math.ceil(entryCount / perPage));
  const page = Math.max(0, Math.min(pages - 1, requestedPage));
  return {
    page,
    pages,
    start: page * perPage,
    end: Math.min(entryCount, (page + 1) * perPage),
    fontSize: preferredFont,
  };
}

/**
 * How many blank rows belong between two consecutive sidebar entries.
 *
 * Core's side_handlers[] table (hud-view.ts) has four blank grouping rows -
 * they never become entries of their own, but they DO advance the terminal
 * row counter, so a gap between one entry's row and the next is exactly
 * where a blank line belongs (that is what separates the vitals, stat and
 * combat blocks in vanilla Angband instead of them reading as one block).
 * Only meaningful in the "left" column: "top" flows entries left to right
 * with no row semantics, and the first entry on a page has no previous row
 * to compare against.
 */
export function sidebarRowGap(
  layout: HudFrameLike["layout"],
  previousRow: number | null,
  row: number | undefined,
): number {
  if (layout === "top" || previousRow === null || row === undefined) return 0;
  return Math.max(0, row - previousRow - 1);
}

/** Used by the optional map hold-card path so a pinch cannot become a hold. */
export function twoFingerGestureActive(): boolean {
  return (runtime?.touches.size ?? 0) >= 2;
}

function playerCenter(rt: ZoomRuntime, snapshot: DisplaySnapshotLike): { x: number; y: number } {
  const player = rt.ctx.state?.actor?.grid;
  return player
    ? { x: player.x, y: player.y }
    : {
        x: snapshot.viewport.origin.x + Math.floor(snapshot.viewport.size.width / 2),
        y: snapshot.viewport.origin.y + Math.floor(snapshot.viewport.size.height / 2),
      };
}

function writePreference(rt: ZoomRuntime): void {
  try {
    const preferences = withDisplayPreference(rt.ctx.prefs?.get(), rt.preference);
    rt.ctx.prefs?.set(withSubwindowZoomPreference(
      preferences,
      Object.fromEntries(rt.subwindowZoomSteps),
    ));
  } catch {
    rt.ctx.log?.("could not persist the zoom and layout preference");
  }
}

/**
 * The responsive sidebar is a DOM panel with its own right padding.  Vanilla's
 * terminal sidebar is 13 cells wide but its HUD painter deliberately leaves
 * its last cell blank before the map (core's hud-view.ts).  Reserving twelve
 * cells here leaves that same one-cell visual separation instead of combining
 * the terminal reservation with the DOM padding into a wider gap.
 */
export function responsiveSidebarColumns(scale: number): number {
  return Math.max(6, Math.round(13 * scale) - 1);
}

/**
 * Largest whole-cell height that shows vanilla's normal 66 by 22 play view in
 * the actual pane.  `GlyphTerm.fitReflow()` rounds a bitmap cell's width from
 * its 16 by 24 source aspect, so use that exact rounding while choosing the
 * height; otherwise a nominally fitting width can lose one map column.
 */
export function defaultPlayFillCellHeight(
  surface: Pick<Pixels, "width" | "height">,
  sidebarColumns: number,
): number {
  let cellHeight = Math.max(
    8,
    Math.min(PLAY_ZOOM_CELL_HEIGHTS.at(-1) ?? 128, Math.floor(surface.height / DEFAULT_PLAY_GRID_ROWS)),
  );
  const requiredColumns = sidebarColumns + DEFAULT_PLAY_MAP_COLS + RESERVED_RIGHT_COLUMN;
  while (cellHeight > 8) {
    const cellWidth = Math.max(4, Math.round((FONT_16X24.w / FONT_16X24.h) * cellHeight));
    if (Math.floor(surface.width / cellWidth) >= requiredColumns) return cellHeight;
    cellHeight -= 1;
  }
  return 8;
}

function responsiveSurfaceFor(snapshot: DisplaySnapshotLike): Pick<Pixels, "width" | "height"> | null {
  return snapshot.surface
    ? { width: snapshot.surface.width, height: snapshot.surface.height }
    : typeof window !== "undefined"
      ? { width: window.innerWidth, height: window.innerHeight }
      : null;
}

function sameResponsiveSurface(
  left: Pick<Pixels, "width" | "height"> | null,
  right: Pick<Pixels, "width" | "height"> | null,
): boolean {
  return left !== null && right !== null && left.width === right.width && left.height === right.height;
}

function applyGridAndSidebar(rt: ZoomRuntime): void {
  const requestedCellHeight = PLAY_ZOOM_CELL_HEIGHTS[rt.preference.zoomIndex] ?? 28;
  const scale = INTERFACE_ZOOM_SCALES[rt.preference.interfaceZoomIndex] ?? 1;
  const snapshot = rt.display.snapshot();
  const surface = snapshot.surface;
  rt.responsiveSurface = responsiveSurfaceFor(snapshot);
  const sidebarColumns = responsiveSidebarColumns(scale);
  const sidebarVisible = rt.sidebarLayout !== "none";
  const sidebarColumnsReserved = rt.sidebarLayout === "left" ? sidebarColumns : 0;
  const narrow = surface?.width !== undefined
    ? surface.width < 480
    : typeof window !== "undefined" && window.innerWidth < 480;
  const defaultFill = !narrow && rt.useDefaultPlayFill && surface
    ? defaultPlayFillCellHeight(surface, sidebarColumnsReserved)
    : requestedCellHeight;
  const cellHeight = narrow ? Math.min(21, defaultFill) : defaultFill;
  rt.display.setGrid({
    cellHeight,
    /* The phone floor leaves room for complete short footer prompts and menu
     * labels. Roomy views keep the larger-cell 20-column zoom ceiling. */
    minCols: narrow ? 24 : 20,
    minRows: 12,
    snapViewportToEven: true,
  });
  /* null is the display API's way to release this mod's override. Zero is not
   * a valid extent - core clamps an explicit extent to at least six columns and
   * one row - so use null when the HUD frame has no sidebar at all. */
  rt.display.setSidebarExtent(sidebarVisible ? {
    columns: sidebarColumns,
    topRows: Math.max(1, Math.ceil(scale)),
  } : null);
}

function activateGameplayGrid(rt: ZoomRuntime, action?: () => void): void {
  if (action) rt.activationActions.push(action);
  if (rt.gridActive) {
    for (const pending of rt.activationActions.splice(0)) pending();
    return;
  }
  if (rt.activationTimer !== null) return;
  rt.activationTimer = setTimeout(() => {
    rt.activationTimer = null;
    if (runtime !== rt) return;
    rt.gridActive = true;
    markGridState("game");
    applyGridAndSidebar(rt);
    rt.display.repaint();
    /* 200ms is imperceptible for a screen-entry toggle and cheap enough to
     * run for the rest of this session: one snapshot() read and, at most, one
     * style write. See the field doc on sidebarVisibilityTimer for why a poll
     * is what covers this rather than another discrete event hook. */
    rt.sidebarVisibilityTimer = setInterval(() => syncSidebarVisibility(rt), 200);
    for (const pending of rt.activationActions.splice(0)) pending();
  }, 0);
}

function applyMapPreference(rt: ZoomRuntime): void {
  const snapshot = rt.display.snapshot();
  if (snapshot.mode !== "map") return;
  rt.display.setMapView(mapViewFor(snapshot, rt.preference.mapDetail, playerCenter(rt, snapshot)));
}

function zoomView(rt: ZoomRuntime, direction: number): void {
  if (!rt.gridActive) return;
  const snapshot = rt.display.snapshot();
  if (snapshot.mode === "map") {
    const next = stepIndex(rt.preference.mapDetail, direction, MAP_DETAIL_FACTORS.length - 1);
    if (next === rt.preference.mapDetail) return;
    rt.preference = { ...rt.preference, mapDetail: next };
    applyMapPreference(rt);
  } else {
    rt.useDefaultPlayFill = false;
    const next = stepIndex(
      rt.preference.zoomIndex,
      direction,
      PLAY_ZOOM_CELL_HEIGHTS.length - 1,
    );
    if (next === rt.preference.zoomIndex) return;
    rt.preference = { ...rt.preference, zoomIndex: next };
    rt.display.setCamera(null);
    applyGridAndSidebar(rt);
  }
  writePreference(rt);
}

function zoomInterface(rt: ZoomRuntime, direction: number): void {
  if (!rt.gridActive) return;
  const next = stepIndex(
    rt.preference.interfaceZoomIndex,
    direction,
    INTERFACE_ZOOM_SCALES.length - 1,
  );
  if (next === rt.preference.interfaceZoomIndex) return;
  rt.preference = { ...rt.preference, interfaceZoomIndex: next };
  applyGridAndSidebar(rt);
  writePreference(rt);
}

function subwindowZoomIndex(rt: ZoomRuntime, panel: SubwindowInfoLike): number {
  const remembered = rt.subwindowZoomSteps.get(panel.id);
  if (remembered !== undefined) return remembered;
  let closest = 0;
  for (let i = 1; i < SUBWINDOW_ZOOM_CELL_HEIGHTS.length; i++) {
    const candidate = SUBWINDOW_ZOOM_CELL_HEIGHTS[i];
    const current = SUBWINDOW_ZOOM_CELL_HEIGHTS[closest];
    if (candidate !== undefined && current !== undefined &&
      Math.abs(candidate - panel.grid.cellHeight) < Math.abs(current - panel.grid.cellHeight)) {
      closest = i;
    }
  }
  rt.subwindowZoomSteps.set(panel.id, closest);
  return closest;
}

function zoomSubwindow(rt: ZoomRuntime, id: string, direction: number): void {
  const subwindows = rt.ctx.subwindows;
  const panel = subwindows?.list().find((candidate) => candidate.id === id);
  if (!subwindows || !panel) return;
  const current = subwindowZoomIndex(rt, panel);
  const next = stepIndex(current, direction, SUBWINDOW_ZOOM_CELL_HEIGHTS.length - 1);
  if (next === current) return;
  const cellHeight = SUBWINDOW_ZOOM_CELL_HEIGHTS[next];
  if (cellHeight === undefined) return;
  rt.subwindowZoomSteps.set(id, next);
  rt.restoredSubwindowZoomPanels.add(id);
  /* These are the host's own compact-panel defaults: preserving them means a
   * zoom changes only cell size, never the panel's minimum useful text area. */
  subwindows.setGrid(id, {
    cellHeight,
    minCols: 20,
    minRows: 3,
    snapViewportToEven: false,
  });
  writePreference(rt);
}

function restoreSubwindowZoom(rt: ZoomRuntime, panel: SubwindowInfoLike): void {
  if (rt.restoredSubwindowZoomPanels.has(panel.id)) return;
  const step = rt.subwindowZoomSteps.get(panel.id);
  const cellHeight = step === undefined ? undefined : SUBWINDOW_ZOOM_CELL_HEIGHTS[step];
  if (cellHeight === undefined) return;
  rt.restoredSubwindowZoomPanels.add(panel.id);
  rt.ctx.subwindows?.setGrid(panel.id, {
    cellHeight,
    minCols: 20,
    minRows: 3,
    snapViewportToEven: false,
  });
}

function focusedSubwindow(rt: ZoomRuntime): SubwindowInfoLike | undefined {
  return rt.ctx.subwindows?.list().find((panel) => panel.focused);
}

function hoveredSubwindow(rt: ZoomRuntime, x: number, y: number): SubwindowInfoLike | undefined {
  return rt.ctx.subwindows?.list().find((panel) => pointInPixels(x, y, panel.bounds));
}

function clearSubwindowControls(rt: ZoomRuntime): void {
  for (const cleanups of rt.subwindowControlCleanups.values()) {
    for (const cleanup of cleanups) cleanup();
  }
  rt.subwindowControlCleanups.clear();
}

function syncSubwindowControls(rt: ZoomRuntime): void {
  const subwindows = rt.ctx.subwindows;
  if (!subwindows) {
    clearSubwindowControls(rt);
    return;
  }
  const panels = subwindows.list();
  const visible = new Set(panels.map((panel) => panel.id));
  for (const [id, cleanups] of rt.subwindowControlCleanups) {
    if (!visible.has(id)) {
      for (const cleanup of cleanups) cleanup();
      rt.subwindowControlCleanups.delete(id);
      rt.restoredSubwindowZoomPanels.delete(id);
    }
  }
  for (const panel of panels) {
    restoreSubwindowZoom(rt, panel);
    if (rt.subwindowControlCleanups.has(panel.id)) continue;
    const zoomOut = subwindows.addControl(panel.id, "zoom-out", {
      glyph: "-",
      title: "Zoom out",
      onActivate: () => zoomSubwindow(rt, panel.id, -1),
    });
    const zoomIn = subwindows.addControl(panel.id, "zoom-in", {
      glyph: "+",
      title: "Zoom in",
      onActivate: () => zoomSubwindow(rt, panel.id, 1),
    });
    rt.subwindowControlCleanups.set(panel.id, [zoomOut, zoomIn]);
  }
}

function installSubwindowControls(rt: ZoomRuntime): void {
  if (!rt.ctx.subwindows) return;
  syncSubwindowControls(rt);
  rt.subwindowControlsTimer = setInterval(() => syncSubwindowControls(rt), 200);
}

function panView(rt: ZoomRuntime, dx: number, dy: number): void {
  if (!rt.gridActive) return;
  let snapshot = rt.display.snapshot();
  if (snapshot.mode === "map" && rt.preference.mapDetail === 0) {
    rt.preference = { ...rt.preference, mapDetail: 1 };
    applyMapPreference(rt);
    writePreference(rt);
    snapshot = rt.display.snapshot();
  }
  const origin = pannedOrigin(snapshot, dx, dy);
  if (snapshot.mode === "map") {
    rt.display.setMapView({ origin, size: snapshot.viewport.size });
  } else {
    rt.display.setCamera(origin);
  }
}

function zoomKeyDirection(event: KeyboardEvent): number {
  if (event.key === "+" || event.key === "=" || event.key === "Add") return 1;
  if (event.key === "-" || event.key === "_" || event.key === "Subtract") return -1;
  return 0;
}

function directionKey(event: KeyboardEvent): { x: number; y: number } | null {
  const directions: Readonly<Record<string, { x: number; y: number }>> = {
    ArrowLeft: { x: -2, y: 0 },
    ArrowRight: { x: 2, y: 0 },
    ArrowUp: { x: 0, y: -2 },
    ArrowDown: { x: 0, y: 2 },
  };
  return directions[event.key] ?? null;
}

function installKeyboard(rt: ZoomRuntime): void {
  rt.cleanups.push(
    rt.display.onKey((event) => {
      const zoom = event.ctrlKey && !event.altKey && !event.metaKey
        ? zoomKeyDirection(event)
        : 0;
      const direction = event.ctrlKey && !event.altKey && !event.metaKey
        ? directionKey(event)
        : null;
      /* A saved gameplay zoom must not own title, birth or name (see
       * installResponsiveMap's own version of this guard) - only a key
       * arriving after installTitleBoundary has already advanced bootPhase to
       * "game-pending" means the player is genuinely entering play. Before
       * that, title/birth/name are still letterboxed at a fixed 80x24 and any
       * ordinary key (a bare Alt press among them) must not activate the
       * responsive grid under them. */
      if (!rt.gridActive && rt.bootPhase !== "game-pending") return;
      const focused = zoom !== 0 ? focusedSubwindow(rt) : undefined;
      if (zoom !== 0 && focused) {
        event.preventDefault();
        event.stopImmediatePropagation();
        zoomSubwindow(rt, focused.id, zoom);
        return;
      }
      if (zoom !== 0 || direction !== null) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const action = (): void => {
          if (zoom !== 0) {
            if (event.shiftKey) zoomInterface(rt, zoom);
            else zoomView(rt, zoom);
          } else if (direction) {
            panView(rt, direction.x, direction.y);
          }
        };
        if (!rt.gridActive) {
          markGridState("game-pending:display-shortcut");
          activateGameplayGrid(rt, action);
        } else {
          action();
        }
        return;
      }
      if (!rt.gridActive) {
        markGridState("game-pending:display-key");
        activateGameplayGrid(rt);
        return;
      }
      const modalKey = !event.altKey && !event.metaKey && (
        (!event.ctrlKey && ["?", "C", "i", "e", "~", "=", "Escape"].includes(event.key)) ||
        (event.ctrlKey && event.key.toLowerCase() === "p")
      );
      if (modalKey && rt.display.snapshot().mode !== "map") {
        /* Core increments modalDepth later in this same key event. The mode is
         * still "play" here, so neither the deferred screen-fit callback nor
         * the 200ms visibility poll can protect the terminal's first modal
         * frame. */
        hideSidebar(rt);
        scheduleScreenFit(rt);
      }
      if (!event.ctrlKey || event.altKey || event.metaKey) {
        if (event.key === "M") {
          setTimeout(() => {
            applyMapPreference(rt);
            syncSidebarVisibility(rt);
          }, 0);
        } else if (rt.display.snapshot().mode === "map") {
          setTimeout(() => syncSidebarVisibility(rt), 0);
        }
        return;
      }
    }),
  );
}

function scheduleScreenFit(rt: ZoomRuntime): void {
  if (rt.screenFitTimer !== null) clearTimeout(rt.screenFitTimer);
  rt.screenFitTimer = setTimeout(() => {
    rt.screenFitTimer = null;
    if (runtime !== rt || !rt.gridActive) return;
    rt.screenFitActive = true;
    hideSidebar(rt);
    rt.display.setGrid(null);
  }, 0);
}

/**
 * Through `ctx.display.onKey`, NOT a raw `window` listener.
 *
 * A raw listener sees every keydown the browser delivers, including one typed
 * into an open mod panel's own `<input>` - a QoL accessibility helper's setup
 * card among them. `ctx.display.onKey` is backed by the input door
 * (input-door.ts), which withholds a key a panel already owns before it ever
 * reaches a subscriber here, the same protection installKeyboard's zoom and
 * pan bindings already had. Without it, typing a stray "n" or "l" into that
 * card's bind field while still on the title screen could flip `bootPhase`
 * straight to "birth" or "game-pending", and the next ordinary key then
 * activates gameplay reflow under a screen that is still showing the title
 * art - which is letterboxed at a fixed 80x24 and never expects a zoomed grid.
 */
function installTitleBoundary(rt: ZoomRuntime): void {
  const onKey = (event: KeyboardEvent): void => {
    if (rt.gridActive || event.ctrlKey || event.altKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (rt.bootPhase === "title") {
      if (key === "n") rt.bootPhase = "birth";
      else if (key === "l" || key === "r") rt.bootPhase = "game-pending";
      markGridState(rt.bootPhase);
      return;
    }
    if (rt.bootPhase === "birth") {
      if (key === "c") rt.bootPhase = "name";
      else if (key === "y") rt.bootPhase = "game-pending";
      markGridState(rt.bootPhase);
      return;
    }
    if (rt.bootPhase === "name" && (key === "enter" || key === "escape")) {
      rt.bootPhase = "birth";
      markGridState(rt.bootPhase);
    }
  };
  rt.cleanups.push(rt.display.onKey(onKey));
}

function installWheel(rt: ZoomRuntime): void {
  const onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey || event.deltaY === 0) return;
    /* Same title/birth/name boundary as installKeyboard: a saved gameplay
     * zoom must not own the still-letterboxed pre-game screens. */
    if (!rt.gridActive && rt.bootPhase !== "game-pending") return;
    const hovered = hoveredSubwindow(rt, event.clientX, event.clientY);
    if (hovered) {
      event.preventDefault();
      event.stopImmediatePropagation();
      zoomSubwindow(rt, hovered.id, event.deltaY < 0 ? 1 : -1);
      return;
    }
    const snapshot = rt.display.snapshot();
    const sidebar = snapshot.regions.sidebar?.pixels;
    event.preventDefault();
    event.stopImmediatePropagation();
    const direction = event.deltaY < 0 ? 1 : -1;
    const action = pointInPixels(event.clientX, event.clientY, sidebar)
      ? (): void => zoomInterface(rt, direction)
      : (): void => zoomView(rt, direction);
    if (!rt.gridActive) {
      markGridState("game-pending:wheel");
      activateGameplayGrid(rt, action);
    } else {
      action();
    }
  };
  window.addEventListener("wheel", onWheel, { capture: true, passive: false });
  rt.cleanups.push(() => window.removeEventListener("wheel", onWheel, true));
}

function touchPair(rt: ZoomRuntime): [TouchPoint, TouchPoint] | null {
  const points = [...rt.touches.values()];
  return points.length === 2 && points[0] && points[1] ? [points[0], points[1]] : null;
}

function pairMetrics(pair: [TouchPoint, TouchPoint]): { distance: number; center: TouchPoint } {
  const [a, b] = pair;
  return {
    distance: Math.hypot(b.x - a.x, b.y - a.y),
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  };
}

function installTouch(rt: ZoomRuntime): void {
  const onDown = (event: PointerEvent): void => {
    if (event.pointerType !== "touch") return;
    rt.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pair = touchPair(rt);
    if (!pair) return;
    const metrics = pairMetrics(pair);
    const sidebar = rt.display.snapshot().regions.sidebar?.pixels;
    rt.gesture = {
      context: pointInPixels(metrics.center.x, metrics.center.y, sidebar) ? "sidebar" : "view",
      ...metrics,
    };
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const onMove = (event: PointerEvent): void => {
    if (!rt.touches.has(event.pointerId)) return;
    rt.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pair = touchPair(rt);
    const gesture = rt.gesture;
    if (!pair || !gesture) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const next = pairMetrics(pair);
    const pinch = pinchDirection(gesture.distance, next.distance);
    if (pinch !== 0) {
      if (gesture.context === "sidebar") zoomInterface(rt, pinch);
      else zoomView(rt, pinch);
      gesture.distance = next.distance;
    }
    const dx = next.center.x - gesture.center.x;
    const dy = next.center.y - gesture.center.y;
    if (gesture.context === "sidebar") {
      if (rt.sidebar && (Math.abs(dx) >= 32 || Math.abs(dy) >= 32)) {
        turnSidebarPage(rt, Math.abs(dx) >= Math.abs(dy) ? -Math.sign(dx) : -Math.sign(dy));
        gesture.center = next.center;
      }
      return;
    }
    const snapshot = rt.display.snapshot();
    const cellX = Math.abs(dx) >= snapshot.grid.cellWidth * 1.25
      ? snapEven(-dx / snapshot.grid.cellWidth)
      : 0;
    const cellY = Math.abs(dy) >= snapshot.grid.cellHeight * 1.25
      ? snapEven(-dy / snapshot.grid.cellHeight)
      : 0;
    if (cellX !== 0 || cellY !== 0) {
      panView(rt, cellX, cellY);
      gesture.center = next.center;
    }
  };
  const onEnd = (event: PointerEvent): void => {
    rt.touches.delete(event.pointerId);
    if (rt.touches.size < 2) rt.gesture = null;
  };
  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointermove", onMove, { capture: true, passive: false });
  window.addEventListener("pointerup", onEnd, true);
  window.addEventListener("pointercancel", onEnd, true);
  rt.cleanups.push(() => {
    window.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onEnd, true);
    window.removeEventListener("pointercancel", onEnd, true);
  });
}

function installResponsiveMap(rt: ZoomRuntime): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const onResize = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (runtime !== rt) return;
      if (!rt.gridActive) {
        /* A saved gameplay zoom must not own title or birth, but the fixed
         * terminal still needs an explicit refit when the shell viewport changes. */
        rt.display.setGrid(null);
        return;
      }
      if (rt.screenFitActive) {
        rt.display.setGrid(null);
        return;
      }
      const snapshot = rt.display.snapshot();
      const surface = responsiveSurfaceFor(snapshot);
      /* Electron can emit resize while refocusing without changing the game
       * surface.  Reapplying at that moment accepts a transient measurement as
       * a new zoom, so only a changed core-measured surface gets a refit. */
      if (sameResponsiveSurface(surface, rt.responsiveSurface)) return;
      if (snapshot.mode === "map") {
        rt.responsiveSurface = surface;
        const center = {
          x: snapshot.viewport.origin.x + Math.floor(snapshot.viewport.size.width / 2),
          y: snapshot.viewport.origin.y + Math.floor(snapshot.viewport.size.height / 2),
        };
        rt.display.setMapView(mapViewFor(snapshot, rt.preference.mapDetail, center));
      } else {
        applyGridAndSidebar(rt);
        rt.display.repaint();
      }
    }, 0);
  };
  window.addEventListener("resize", onResize);
  rt.cleanups.push(() => {
    window.removeEventListener("resize", onResize);
    if (timer !== null) clearTimeout(timer);
  });
}

function createSidebar(rt: ZoomRuntime): SidebarRuntime | null {
  if (typeof document === "undefined" || !document.body) return null;
  /* Core tiles the main terminal by moving #game-view. It is an absolute,
   * overflow-hidden leaf, so putting this DOM overlay inside that same element
   * is the one containment boundary that remains correct while a tile is moved
   * before the next HUD paint supplies fresh pixel geometry. */
  const playView = document.getElementById("game-view");
  if (!playView) return null;
  const host = document.createElement("div");
  host.setAttribute("data-qol-responsive-sidebar", "");
  host.setAttribute("role", "complementary");
  host.setAttribute("aria-label", "Character status");
  Object.assign(host.style, {
    position: "absolute",
    zIndex: "1",
    boxSizing: "border-box",
    overflow: "hidden",
    overscrollBehavior: "contain",
    pointerEvents: "auto",
    background: "rgba(0,0,0,0.96)",
    color: "#c8c8d4",
    scrollbarWidth: "none",
  });
  const body = document.createElement("div");
  host.appendChild(body);
  playView.appendChild(host);
  rt.cleanups.push(() => host.remove());
  return {
    host,
    body,
    page: 0,
    layout: "none",
    entryCount: 0,
    section: null,
    frame: null,
  };
}

/** "map", "store" and "modal" all replace or cover the play viewport this
 * sidebar overlays; none leaves anywhere for the responsive status column to
 * sit. */
export function hidesSidebar(mode: DisplaySnapshotLike["mode"]): boolean {
  return mode === "map" || mode === "store" || mode === "modal";
}

function syncSidebarVisibility(rt: ZoomRuntime): void {
  if (!rt.sidebar) return;
  rt.sidebar.host.style.display = hidesSidebar(rt.display.snapshot().mode) ? "none" : "block";
}

function hideSidebar(rt: ZoomRuntime): void {
  if (rt.sidebar) rt.sidebar.host.style.display = "none";
}

function turnSidebarPage(rt: ZoomRuntime, direction: number): void {
  const sidebar = rt.sidebar;
  if (!sidebar?.section || !sidebar.frame) return;
  const pixels = sidebar.section.region?.pixels;
  if (!pixels) return;
  const scale = INTERFACE_ZOOM_SCALES[rt.preference.interfaceZoomIndex] ?? 1;
  const plan = sidebarPagePlan(sidebar.entryCount, sidebar.layout, pixels, scale, sidebar.page);
  if (plan.pages <= 1) return;
  sidebar.page = (plan.page + Math.sign(direction) + plan.pages) % plan.pages;
  paintSidebar(rt, sidebar.section, sidebar.frame);
}

function paintSidebar(rt: ZoomRuntime, section: HudSectionLike, frame: HudFrameLike): void {
  const layoutChanged = rt.sidebarLayout !== frame.layout;
  rt.sidebarLayout = frame.layout;
  if (!rt.gridActive) {
    /* Core paints gameplay HUD frames behind title and birth screens. The boot
     * key boundary marks when the player has asked to enter the actual game;
     * only a HUD presentation after that boundary may enable gameplay reflow. */
    if (rt.bootPhase === "game-pending") activateGameplayGrid(rt);
    return;
  }
  if (layoutChanged) {
    applyGridAndSidebar(rt);
    rt.display.repaint();
  }
  if (rt.screenFitActive) {
    rt.screenFitActive = false;
    applyGridAndSidebar(rt);
    rt.display.repaint();
    return;
  }
  rt.sidebar ??= createSidebar(rt);
  const sidebar = rt.sidebar;
  const pixels = section.region?.pixels;
  /* Core publishes `section.region.pixels` in viewport coordinates, while the
   * sidebar is an absolute child of the tiled main view. Translate to that
   * surface's local coordinate system before applying it. The parent tile's
   * overflow clipping then prevents any stale or oversized panel from reaching
   * a neighbouring subwindow. */
  const surface = rt.display.snapshot().surface;
  if (!sidebar || !pixels || !surface || frame.layout === "none" || hidesSidebar(rt.display.snapshot().mode)) {
    if (sidebar) sidebar.host.style.display = "none";
    return;
  }
  const scale = INTERFACE_ZOOM_SCALES[rt.preference.interfaceZoomIndex] ?? 1;
  if (sidebar.layout !== frame.layout || sidebar.entryCount !== section.entries.length) {
    sidebar.page = 0;
  }
  sidebar.layout = frame.layout;
  sidebar.entryCount = section.entries.length;
  sidebar.section = section;
  sidebar.frame = frame;
  const plan = sidebarPagePlan(section.entries.length, frame.layout, pixels, scale, sidebar.page);
  sidebar.page = plan.page;
  const visible = section.entries.slice(plan.start, plan.end);

  /* Glyphs are blitted at an exact pixel size (unlike a CSS font, there is no
   * layout engine to reflow them), so the size that fits is computed up
   * front instead of painting, measuring, and shrinking in a loop. Row
   * height keeps the 1.25 line-height this sidebar always used; row width
   * comes straight from FONT_16X24's own 16x24 aspect ratio, so a glyph is
   * never stretched or squashed relative to how core itself draws it. */
  let cellHeight = plan.fontSize * 1.25;
  let cellWidth = cellHeight * (FONT_16X24.w / FONT_16X24.h);
  if (frame.layout !== "top") {
    let totalRows = 0;
    let maxChars = 0;
    let scanRow: number | null = null;
    for (const entry of visible) {
      totalRows += sidebarRowGap(frame.layout, scanRow, entry.screen?.row) + 1;
      if (entry.screen) scanRow = entry.screen.row;
      maxChars = Math.max(maxChars, entry.runs.reduce((n, run) => n + [...run.text].length, 0));
    }
    const heightScale = pixels.height / Math.max(1, totalRows * cellHeight);
    const widthScale = pixels.width / Math.max(1, maxChars * cellWidth);
    const shrink = Math.min(1, heightScale, widthScale);
    if (shrink < 1) {
      cellHeight *= shrink;
      cellWidth *= shrink;
    }
  }
  Object.assign(sidebar.host.style, {
    display: "block",
    left: `${String(pixels.x - surface.x)}px`,
    top: `${String(pixels.y - surface.y)}px`,
    width: `${String(pixels.width)}px`,
    height: `${String(pixels.height)}px`,
    /* Still the em basis for the layout below's gap/padding - only the
     * glyph cells themselves are sized from cellWidth/cellHeight now. */
    fontSize: `${String(cellHeight / 1.25)}px`,
    lineHeight: "1.25",
  });
  Object.assign(sidebar.body.style, {
    display: frame.layout === "top" ? "flex" : "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    /* Rows are auto-sized (one line of vitals text each), and with no
     * alignContent a CSS grid stretches those auto tracks to fill its own
     * height:100% - which on a tall "left" sidebar spread thirteen one-line
     * rows across the whole window height instead of packing them at the
     * top the way the original terminal layout does. "start" packs each row
     * at its own content height, matching vanilla Angband's tight vitals
     * column; the "top" strip is unaffected, since flex containers were
     * never subject to this in the first place. */
    alignContent: frame.layout === "top" ? "normal" : "start",
    alignItems: "center",
    justifyContent: frame.layout === "top" ? "space-between" : "normal",
    gap: frame.layout === "top" ? "0 0.55em" : "0.2em",
    padding: frame.layout === "top" ? "0.25em 0.5em" : "0.4em 0.55em",
    width: "100%",
    height: "100%",
    minWidth: "0",
    overflow: "hidden",
    boxSizing: "border-box",
  });
  sidebar.body.replaceChildren();
  const dpr = window.devicePixelRatio || 1;
  let previousRow: number | null = null;
  for (const entry of visible) {
    const skipped = sidebarRowGap(frame.layout, previousRow, entry.screen?.row);
    for (let i = 0; i < skipped; i++) {
      const spacer = document.createElement("div");
      spacer.setAttribute("aria-hidden", "true");
      spacer.style.height = "1em";
      sidebar.body.appendChild(spacer);
    }
    if (entry.screen) previousRow = entry.screen.row;
    const row = document.createElement("div");
    row.setAttribute("data-qol-vital", entry.key);
    row.title = entry.key;
    Object.assign(row.style, {
      minWidth: "0",
      overflow: "hidden",
      flex: "0 1 auto",
    });
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, { display: "block" });
    paintBitmapLine(canvas, entry.runs, cellWidth, cellHeight, dpr);
    row.appendChild(canvas);
    /* The visible pixels are a canvas blit, not text, so a screen reader
     * needs its own copy of what the row says - the standard visually-hidden
     * pattern, not `aria-label` on the row, so it reads the same runs a
     * sighted player sees rather than a second, hand-written description. */
    const label = document.createElement("span");
    label.textContent = entry.runs.map((run) => run.text).join("");
    Object.assign(label.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      overflow: "hidden",
      clip: "rect(0,0,0,0)",
      whiteSpace: "nowrap",
    });
    row.appendChild(label);
    sidebar.body.appendChild(row);
  }
  if (plan.pages > 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-qol-sidebar-page", "");
    button.setAttribute("aria-label", `Show status page ${String((plan.page + 1) % plan.pages + 1)} of ${String(plan.pages)}`);
    Object.assign(button.style, {
      appearance: "none",
      background: "transparent",
      border: "1px solid #686878",
      borderRadius: "2px",
      cursor: "pointer",
      flex: "0 0 auto",
      lineHeight: "inherit",
      padding: "0 0.35em",
    });
    paintBitmapButtonLabel(
      button,
      `${String(plan.page + 1)}/${String(plan.pages)} >`,
      "#d8d87c",
      cellWidth,
      cellHeight,
      dpr,
    );
    button.addEventListener("click", () => turnSidebarPage(rt, 1));
    sidebar.body.appendChild(button);
  }
}

export function installZoomPan(ctx: ZoomPanContext): void {
  uninstallZoomPan();
  const display = ctx.display;
  const enabled = ctx.flags["qol.zoomPan"] === true || ctx.flags["qol.accessibilityZoom"] === true;
  const sharpenZoomedTiles = ctx.flags["qol.sharpenZoomedTiles"] === true;
  if (!display) {
    if (enabled || sharpenZoomedTiles) ctx.log?.("this game is too old for display conveniences");
    return;
  }
  display.setTileScaling(sharpenZoomedTiles ? "crisp" : "auto");
  display.setFullMapOverview?.(sharpenZoomedTiles);
  configuredDisplay = display;
  if (!enabled) return;
  const rt: ZoomRuntime = {
    ctx,
    display,
    preference: {
      ...readDisplayPreference(ctx.prefs?.get()),
      ...(ctx.flags["qol.accessibilityZoom"] === true
        ? { zoomIndex: Math.max(readDisplayPreference(ctx.prefs?.get()).zoomIndex, ACCESSIBILITY_ZOOM_INDEX) }
        : {}),
    },
    useDefaultPlayFill: ctx.flags["qol.accessibilityZoom"] !== true &&
      readDisplayPreference(ctx.prefs?.get()).zoomIndex === DEFAULT_DISPLAY_PREFERENCE.zoomIndex,
    cleanups: [],
    touches: new Map(),
    gesture: null,
    sidebar: null,
    sidebarLayout: "left",
    gridActive: false,
    bootPhase: initialBootPhase(),
    activationTimer: null,
    activationActions: [],
    screenFitActive: false,
    screenFitTimer: null,
    responsiveSurface: null,
    sidebarVisibilityTimer: null,
    subwindowZoomSteps: new Map(
      Object.entries(readSubwindowZoomPreference(ctx.prefs?.get()))
        .filter(([, step]) => step < SUBWINDOW_ZOOM_CELL_HEIGHTS.length),
    ),
    restoredSubwindowZoomPanels: new Set(),
    subwindowControlCleanups: new Map(),
    subwindowControlsTimer: null,
  };
  runtime = rt;
  markGridState(rt.bootPhase);
  if (typeof document !== "undefined" && document.body) {
    const htmlOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    const htmlBackground = document.documentElement.style.backgroundColor;
    const bodyBackground = document.body.style.backgroundColor;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.documentElement.style.backgroundColor = "#000";
    document.body.style.backgroundColor = "#000";
    rt.cleanups.push(() => {
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.backgroundColor = htmlBackground;
      document.body.style.backgroundColor = bodyBackground;
    });
  }
  installKeyboard(rt);
  installSubwindowControls(rt);
  if (typeof window !== "undefined") {
    installTitleBoundary(rt);
    installWheel(rt);
    installTouch(rt);
    installResponsiveMap(rt);
  }
}

export function zoomPanHud(ctx: ZoomPanContext): {
  sidebar?: { present(section: HudSectionLike, frame: HudFrameLike): void };
} | undefined {
  if ((ctx.flags["qol.zoomPan"] !== true && ctx.flags["qol.accessibilityZoom"] !== true) || !runtime) {
    return undefined;
  }
  const rt = runtime;
  return { sidebar: { present: (section, frame) => paintSidebar(rt, section, frame) } };
}

export function uninstallZoomPan(): void {
  const display = configuredDisplay;
  configuredDisplay = null;
  display?.setFullMapOverview?.(false);
  const rt = runtime;
  runtime = null;
  if (!rt) return;
  markGridState("off");
  if (rt.activationTimer !== null) clearTimeout(rt.activationTimer);
  if (rt.screenFitTimer !== null) clearTimeout(rt.screenFitTimer);
  if (rt.sidebarVisibilityTimer !== null) clearInterval(rt.sidebarVisibilityTimer);
  if (rt.subwindowControlsTimer !== null) clearInterval(rt.subwindowControlsTimer);
  clearSubwindowControls(rt);
  for (const cleanup of rt.cleanups.splice(0).reverse()) cleanup();
  rt.display.setMapView(null);
  rt.display.setCamera(null);
  rt.display.setSidebarExtent(null);
  rt.display.setGrid(null);
  rt.display.setTileScaling("auto");
}

export function defaultDisplayPreference(): DisplayPreference {
  return DEFAULT_DISPLAY_PREFERENCE;
}
