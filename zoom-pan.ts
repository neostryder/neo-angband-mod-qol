import {
  DEFAULT_DISPLAY_PREFERENCE,
  readDisplayPreference,
  withDisplayPreference,
  type DisplayPreference,
} from "./preferences";

export const PLAY_ZOOM_CELL_HEIGHTS = [16, 20, 24, 28, 32, 36, 40, 48] as const;
export const INTERFACE_ZOOM_SCALES = [0.8, 1, 1.25, 1.5] as const;
export const MAP_DETAIL_FACTORS = [0, 4, 2, 1] as const;
export const ACCESSIBILITY_ZOOM_INDEX = 5;

export interface Pixels {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DisplaySnapshotLike {
  readonly mode: "play" | "map";
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
  setVisualFilter(filter: string | null): void;
  repaint(): void;
}

interface PreferenceStoreLike {
  get(): unknown;
  set(value: unknown): void;
}

export interface ZoomPanContext {
  readonly flags: Readonly<Record<string, boolean>>;
  readonly prefs?: PreferenceStoreLike | undefined;
  readonly display?: DisplayLike | undefined;
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

interface CanvasStyle {
  readonly position: string;
  readonly left: string;
  readonly top: string;
}

interface ZoomRuntime {
  readonly ctx: ZoomPanContext;
  readonly display: DisplayLike;
  preference: DisplayPreference;
  readonly cleanups: Array<() => void>;
  readonly touches: Map<number, TouchPoint>;
  gesture: TouchGesture | null;
  sidebar: SidebarRuntime | null;
  gridActive: boolean;
  bootPhase: "title" | "birth" | "name" | "game-pending";
  activationTimer: ReturnType<typeof setTimeout> | null;
  readonly activationActions: Array<() => void>;
  gridOffset: TouchPoint;
  canvas: HTMLElement | null;
  canvasStyle: CanvasStyle | null;
  screenFitActive: boolean;
  screenFitTimer: ReturnType<typeof setTimeout> | null;
}

let runtime: ZoomRuntime | null = null;

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
    rt.ctx.prefs?.set(withDisplayPreference(rt.ctx.prefs.get(), rt.preference));
  } catch {
    rt.ctx.log?.("could not persist the zoom and layout preference");
  }
}

function applyGridAndSidebar(rt: ZoomRuntime): void {
  const requestedCellHeight = PLAY_ZOOM_CELL_HEIGHTS[rt.preference.zoomIndex] ?? 28;
  const scale = INTERFACE_ZOOM_SCALES[rt.preference.interfaceZoomIndex] ?? 1;
  const narrow = typeof window !== "undefined" && window.innerWidth < 480;
  const cellHeight = narrow ? Math.min(21, requestedCellHeight) : requestedCellHeight;
  rt.display.setGrid({
    cellHeight,
    /* The phone floor leaves room for complete short footer prompts and menu
     * labels. Roomy views keep the larger-cell 20-column zoom ceiling. */
    minCols: narrow ? 24 : 20,
    minRows: 12,
    snapViewportToEven: true,
  });
  rt.display.setSidebarExtent({
    columns: Math.round(13 * scale),
    topRows: Math.max(1, Math.ceil(scale)),
  });
  centerGrid(rt);
}

function shiftedPixels(rt: ZoomRuntime, pixels: Pixels | undefined): Pixels | undefined {
  return pixels ? {
    ...pixels,
    x: pixels.x + rt.gridOffset.x,
    y: pixels.y + rt.gridOffset.y,
  } : undefined;
}

function centerGrid(rt: ZoomRuntime): void {
  if (!rt.gridActive || typeof document === "undefined" || typeof window === "undefined") return;
  const snapshot = rt.display.snapshot();
  const x = Math.max(0, Math.floor((window.innerWidth - snapshot.grid.cols * snapshot.grid.cellWidth) / 2));
  const y = Math.max(0, Math.floor((window.innerHeight - snapshot.grid.rows * snapshot.grid.cellHeight) / 2));
  rt.gridOffset = { x, y };
  const canvas = rt.canvas ?? document.querySelector<HTMLElement>("#game");
  if (!canvas) return;
  if (!rt.canvasStyle) {
    rt.canvasStyle = {
      position: canvas.style.position,
      left: canvas.style.left,
      top: canvas.style.top,
    };
  }
  rt.canvas = canvas;
  Object.assign(canvas.style, {
    position: "fixed",
    left: `${String(x)}px`,
    top: `${String(y)}px`,
  });
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
          rt.bootPhase = "game-pending";
          markGridState("game-pending:display-shortcut");
          activateGameplayGrid(rt, action);
        } else {
          action();
        }
        return;
      }
      if (!rt.gridActive) {
        rt.bootPhase = "game-pending";
        markGridState("game-pending:display-key");
        activateGameplayGrid(rt);
        return;
      }
      const modalKey = !event.altKey && !event.metaKey && (
        (!event.ctrlKey && ["?", "C", "i", "e", "~", "=", "Escape"].includes(event.key)) ||
        (event.ctrlKey && event.key.toLowerCase() === "p")
      );
      if (modalKey && rt.display.snapshot().mode !== "map") scheduleScreenFit(rt);
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
    if (rt.sidebar) rt.sidebar.host.style.display = "none";
    rt.gridOffset = { x: 0, y: 0 };
    if (rt.canvas) {
      rt.canvas.style.left = "0px";
      rt.canvas.style.top = "0px";
    }
    rt.display.setGrid(null);
  }, 0);
}

function installTitleBoundary(rt: ZoomRuntime): void {
  const onKey = (event: KeyboardEvent): void => {
    if (rt.gridActive || event.ctrlKey || event.altKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (rt.bootPhase === "title") {
      if (key === "n") rt.bootPhase = "birth";
      else if (key === "l") rt.bootPhase = "game-pending";
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
  window.addEventListener("keydown", onKey, true);
  rt.cleanups.push(() => window.removeEventListener("keydown", onKey, true));
}

function installWheel(rt: ZoomRuntime): void {
  const onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey || event.deltaY === 0) return;
    const snapshot = rt.display.snapshot();
    const sidebar = shiftedPixels(rt, snapshot.regions.sidebar?.pixels);
    event.preventDefault();
    event.stopImmediatePropagation();
    const direction = event.deltaY < 0 ? 1 : -1;
    const action = pointInPixels(event.clientX, event.clientY, sidebar)
      ? (): void => zoomInterface(rt, direction)
      : (): void => zoomView(rt, direction);
    if (!rt.gridActive) {
      rt.bootPhase = "game-pending";
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
    const sidebar = shiftedPixels(rt, rt.display.snapshot().regions.sidebar?.pixels);
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
      if (snapshot.mode === "map") {
        const center = {
          x: snapshot.viewport.origin.x + Math.floor(snapshot.viewport.size.width / 2),
          y: snapshot.viewport.origin.y + Math.floor(snapshot.viewport.size.height / 2),
        };
        rt.display.setMapView(mapViewFor(snapshot, rt.preference.mapDetail, center));
      } else {
        applyGridAndSidebar(rt);
        rt.display.repaint();
      }
      centerGrid(rt);
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
  const host = document.createElement("div");
  host.setAttribute("data-qol-responsive-sidebar", "");
  host.setAttribute("role", "complementary");
  host.setAttribute("aria-label", "Character status");
  Object.assign(host.style, {
    position: "fixed",
    zIndex: "1",
    boxSizing: "border-box",
    overflow: "hidden",
    overscrollBehavior: "contain",
    pointerEvents: "auto",
    background: "rgba(0,0,0,0.96)",
    color: "#c8c8d4",
    fontFamily: "monospace",
    scrollbarWidth: "none",
  });
  const body = document.createElement("div");
  host.appendChild(body);
  document.body.appendChild(host);
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

function syncSidebarVisibility(rt: ZoomRuntime): void {
  if (!rt.sidebar) return;
  rt.sidebar.host.style.display = rt.display.snapshot().mode === "map" ? "none" : "block";
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

function fitSidebarText(sidebar: SidebarRuntime, preferred: number): void {
  let fontSize = preferred;
  sidebar.host.style.fontSize = `${String(fontSize)}px`;
  while (
    fontSize > 9 &&
    (sidebar.body.scrollWidth > sidebar.body.clientWidth || sidebar.body.scrollHeight > sidebar.body.clientHeight)
  ) {
    fontSize -= 1;
    sidebar.host.style.fontSize = `${String(fontSize)}px`;
  }
}

function paintSidebar(rt: ZoomRuntime, section: HudSectionLike, frame: HudFrameLike): void {
  if (!rt.gridActive) {
    /* Core paints gameplay HUD frames behind title and birth screens. The boot
     * key boundary marks when the player has asked to enter the actual game;
     * only a HUD presentation after that boundary may enable gameplay reflow. */
    if (rt.bootPhase === "game-pending") activateGameplayGrid(rt);
    return;
  }
  if (rt.screenFitActive) {
    rt.screenFitActive = false;
    applyGridAndSidebar(rt);
    rt.display.repaint();
    return;
  }
  centerGrid(rt);
  rt.sidebar ??= createSidebar(rt);
  const sidebar = rt.sidebar;
  const pixels = section.region?.pixels;
  if (!sidebar || !pixels || frame.layout === "none" || rt.display.snapshot().mode === "map") {
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
  Object.assign(sidebar.host.style, {
    display: "block",
    left: `${String(pixels.x + rt.gridOffset.x)}px`,
    top: `${String(pixels.y + rt.gridOffset.y)}px`,
    width: `${String(pixels.width)}px`,
    height: `${String(pixels.height)}px`,
    fontSize: `${String(plan.fontSize)}px`,
    lineHeight: "1.25",
  });
  Object.assign(sidebar.body.style, {
    display: frame.layout === "top" ? "flex" : "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    alignItems: "center",
    justifyContent: frame.layout === "top" ? "space-between" : "normal",
    gap: frame.layout === "top" ? "0 0.55em" : "0.2em",
    padding: frame.layout === "top" ? "0.25em 0.5em" : "0.4em 0.55em",
    whiteSpace: "nowrap",
    width: "100%",
    height: "100%",
    minWidth: "0",
    overflow: "hidden",
    boxSizing: "border-box",
  });
  sidebar.body.replaceChildren();
  for (const entry of section.entries.slice(plan.start, plan.end)) {
    const row = document.createElement("div");
    row.setAttribute("data-qol-vital", entry.key);
    row.title = entry.key;
    Object.assign(row.style, {
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      flex: "0 1 auto",
    });
    for (const run of entry.runs) {
      const span = document.createElement("span");
      span.textContent = run.text;
      span.style.color = run.css;
      row.appendChild(span);
    }
    sidebar.body.appendChild(row);
  }
  if (plan.pages > 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-qol-sidebar-page", "");
    button.setAttribute("aria-label", `Show status page ${String((plan.page + 1) % plan.pages + 1)} of ${String(plan.pages)}`);
    button.textContent = `${String(plan.page + 1)}/${String(plan.pages)} >`;
    Object.assign(button.style, {
      appearance: "none",
      background: "transparent",
      border: "1px solid #686878",
      borderRadius: "2px",
      color: "#d8d87c",
      cursor: "pointer",
      flex: "0 0 auto",
      font: "inherit",
      lineHeight: "inherit",
      padding: "0 0.35em",
    });
    button.addEventListener("click", () => turnSidebarPage(rt, 1));
    sidebar.body.appendChild(button);
  }
  fitSidebarText(sidebar, plan.fontSize);
}

export function installZoomPan(ctx: ZoomPanContext): void {
  uninstallZoomPan();
  const display = ctx.display;
  const enabled = ctx.flags["qol.zoomPan"] === true || ctx.flags["qol.accessibilityZoom"] === true;
  const crisp = ctx.flags["qol.sharpenZoomedTiles"] === true;
  if (!display) {
    if (enabled || crisp) ctx.log?.("this game is too old for zoom, pan, and responsive layout");
    return;
  }
  display.setTileScaling(crisp ? "crisp" : "auto");
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
    cleanups: [],
    touches: new Map(),
    gesture: null,
    sidebar: null,
    gridActive: false,
    bootPhase: initialBootPhase(),
    activationTimer: null,
    activationActions: [],
    gridOffset: { x: 0, y: 0 },
    canvas: null,
    canvasStyle: null,
    screenFitActive: false,
    screenFitTimer: null,
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
  const rt = runtime;
  runtime = null;
  if (!rt) return;
  markGridState("off");
  if (rt.activationTimer !== null) clearTimeout(rt.activationTimer);
  if (rt.screenFitTimer !== null) clearTimeout(rt.screenFitTimer);
  for (const cleanup of rt.cleanups.splice(0).reverse()) cleanup();
  if (rt.canvas && rt.canvasStyle) {
    Object.assign(rt.canvas.style, rt.canvasStyle);
  }
  rt.display.setMapView(null);
  rt.display.setCamera(null);
  rt.display.setSidebarExtent(null);
  rt.display.setGrid(null);
  rt.display.setTileScaling("auto");
}

export function defaultDisplayPreference(): DisplayPreference {
  return DEFAULT_DISPLAY_PREFERENCE;
}
