// qol - generated from plugin.ts by neo-angband-mod-build
// (@rpgm-tools/neo-angband-mod-sdk). Edit the TypeScript source, not this file.

// preferences.ts
var DEFAULT_DISPLAY_PREFERENCE = {
  v: 1,
  zoomIndex: 3,
  interfaceZoomIndex: 1,
  mapDetail: 0
};
function finiteInteger(value, fallback, min, max) {
  return typeof value === "number" && Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
function readDisplayPreference(raw) {
  if (!raw || typeof raw !== "object") return DEFAULT_DISPLAY_PREFERENCE;
  const top = raw;
  const candidate = top.v === 2 ? top.display : void 0;
  if (!candidate || candidate.v !== 1) return DEFAULT_DISPLAY_PREFERENCE;
  return {
    v: 1,
    zoomIndex: finiteInteger(candidate.zoomIndex, DEFAULT_DISPLAY_PREFERENCE.zoomIndex, 0, 7),
    interfaceZoomIndex: finiteInteger(
      candidate.interfaceZoomIndex,
      DEFAULT_DISPLAY_PREFERENCE.interfaceZoomIndex,
      0,
      3
    ),
    mapDetail: finiteInteger(candidate.mapDetail, DEFAULT_DISPLAY_PREFERENCE.mapDetail, 0, 3)
  };
}
function readRememberedSettings(raw) {
  if (!raw || typeof raw !== "object") return null;
  const top = raw;
  const candidate = top.v === 2 ? top.options : top.v === 1 ? raw : void 0;
  return candidate?.v === 1 ? candidate : null;
}
function withDisplayPreference(raw, display) {
  const options = readRememberedSettings(raw);
  return { v: 2, ...options ? { options } : {}, display };
}
function withRememberedSettings(raw, options) {
  const display = readDisplayPreference(raw);
  return { v: 2, options, display };
}

// zoom-pan.ts
var PLAY_ZOOM_CELL_HEIGHTS = [16, 20, 24, 28, 32, 36, 40, 48];
var INTERFACE_ZOOM_SCALES = [0.8, 1, 1.25, 1.5];
var MAP_DETAIL_FACTORS = [0, 4, 2, 1];
var ACCESSIBILITY_ZOOM_INDEX = 5;
var runtime = null;
function markGridState(value) {
  if (typeof document !== "undefined" && document.body) {
    document.body.setAttribute("data-qol-grid-state", value);
  }
}
function initialBootPhase() {
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
function stepIndex(index, direction, last) {
  return Math.max(0, Math.min(last, index + Math.sign(direction)));
}
function snapEven(value) {
  return Math.round(value / 2) * 2;
}
function pointInPixels(x, y, pixels) {
  return !!pixels && x >= pixels.x && y >= pixels.y && x < pixels.x + pixels.width && y < pixels.y + pixels.height;
}
function evenSpan(value, limit) {
  if (limit <= 1) return limit;
  const clamped = Math.max(2, Math.min(limit, Math.floor(value)));
  return clamped === limit ? clamped : clamped - clamped % 2;
}
function mapViewFor(snapshot, detail, center) {
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
function pannedOrigin(snapshot, dx, dy) {
  const maxX = Math.max(0, snapshot.level.width - snapshot.viewport.size.width);
  const maxY = Math.max(0, snapshot.level.height - snapshot.viewport.size.height);
  return {
    x: Math.max(0, Math.min(maxX, snapEven(snapshot.viewport.origin.x + dx))),
    y: Math.max(0, Math.min(maxY, snapEven(snapshot.viewport.origin.y + dy)))
  };
}
function pinchDirection(previous, next) {
  if (previous <= 0 || next <= 0) return 0;
  const change = Math.log2(next / previous);
  return change >= 0.18 ? 1 : change <= -0.18 ? -1 : 0;
}
function sidebarPagePlan(entryCount, layout, pixels, scale, requestedPage) {
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
    fontSize: preferredFont
  };
}
function twoFingerGestureActive() {
  return (runtime?.touches.size ?? 0) >= 2;
}
function playerCenter(rt, snapshot) {
  const player = rt.ctx.state?.actor?.grid;
  return player ? { x: player.x, y: player.y } : {
    x: snapshot.viewport.origin.x + Math.floor(snapshot.viewport.size.width / 2),
    y: snapshot.viewport.origin.y + Math.floor(snapshot.viewport.size.height / 2)
  };
}
function writePreference(rt) {
  try {
    rt.ctx.prefs?.set(withDisplayPreference(rt.ctx.prefs.get(), rt.preference));
  } catch {
    rt.ctx.log?.("could not persist the zoom and layout preference");
  }
}
function applyGridAndSidebar(rt) {
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
    snapViewportToEven: true
  });
  rt.display.setSidebarExtent({
    columns: Math.round(13 * scale),
    topRows: Math.max(1, Math.ceil(scale))
  });
  centerGrid(rt);
}
function shiftedPixels(rt, pixels) {
  return pixels ? {
    ...pixels,
    x: pixels.x + rt.gridOffset.x,
    y: pixels.y + rt.gridOffset.y
  } : void 0;
}
function centerGrid(rt) {
  if (!rt.gridActive || typeof document === "undefined" || typeof window === "undefined") return;
  const snapshot = rt.display.snapshot();
  const x = Math.max(0, Math.floor((window.innerWidth - snapshot.grid.cols * snapshot.grid.cellWidth) / 2));
  const y = Math.max(0, Math.floor((window.innerHeight - snapshot.grid.rows * snapshot.grid.cellHeight) / 2));
  rt.gridOffset = { x, y };
  const canvas = rt.canvas ?? document.querySelector("#game");
  if (!canvas) return;
  if (!rt.canvasStyle) {
    rt.canvasStyle = {
      position: canvas.style.position,
      left: canvas.style.left,
      top: canvas.style.top
    };
  }
  rt.canvas = canvas;
  Object.assign(canvas.style, {
    position: "fixed",
    left: `${String(x)}px`,
    top: `${String(y)}px`
  });
}
function activateGameplayGrid(rt, action) {
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
function applyMapPreference(rt) {
  const snapshot = rt.display.snapshot();
  if (snapshot.mode !== "map") return;
  rt.display.setMapView(mapViewFor(snapshot, rt.preference.mapDetail, playerCenter(rt, snapshot)));
}
function zoomView(rt, direction) {
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
      PLAY_ZOOM_CELL_HEIGHTS.length - 1
    );
    if (next === rt.preference.zoomIndex) return;
    rt.preference = { ...rt.preference, zoomIndex: next };
    rt.display.setCamera(null);
    applyGridAndSidebar(rt);
  }
  writePreference(rt);
}
function zoomInterface(rt, direction) {
  if (!rt.gridActive) return;
  const next = stepIndex(
    rt.preference.interfaceZoomIndex,
    direction,
    INTERFACE_ZOOM_SCALES.length - 1
  );
  if (next === rt.preference.interfaceZoomIndex) return;
  rt.preference = { ...rt.preference, interfaceZoomIndex: next };
  applyGridAndSidebar(rt);
  writePreference(rt);
}
function panView(rt, dx, dy) {
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
function zoomKeyDirection(event) {
  if (event.key === "+" || event.key === "=" || event.key === "Add") return 1;
  if (event.key === "-" || event.key === "_" || event.key === "Subtract") return -1;
  return 0;
}
function directionKey(event) {
  const directions = {
    ArrowLeft: { x: -2, y: 0 },
    ArrowRight: { x: 2, y: 0 },
    ArrowUp: { x: 0, y: -2 },
    ArrowDown: { x: 0, y: 2 }
  };
  return directions[event.key] ?? null;
}
function installKeyboard(rt) {
  rt.cleanups.push(
    rt.display.onKey((event) => {
      const zoom = event.ctrlKey && !event.altKey && !event.metaKey ? zoomKeyDirection(event) : 0;
      const direction = event.ctrlKey && !event.altKey && !event.metaKey ? directionKey(event) : null;
      if (zoom !== 0 || direction !== null) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const action = () => {
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
      const modalKey = !event.altKey && !event.metaKey && (!event.ctrlKey && ["?", "C", "i", "e", "~", "=", "Escape"].includes(event.key) || event.ctrlKey && event.key.toLowerCase() === "p");
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
    })
  );
}
function scheduleScreenFit(rt) {
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
function installTitleBoundary(rt) {
  const onKey = (event) => {
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
function installWheel(rt) {
  const onWheel = (event) => {
    if (!event.ctrlKey || event.deltaY === 0) return;
    const snapshot = rt.display.snapshot();
    const sidebar = shiftedPixels(rt, snapshot.regions.sidebar?.pixels);
    event.preventDefault();
    event.stopImmediatePropagation();
    const direction = event.deltaY < 0 ? 1 : -1;
    const action = pointInPixels(event.clientX, event.clientY, sidebar) ? () => zoomInterface(rt, direction) : () => zoomView(rt, direction);
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
function touchPair(rt) {
  const points = [...rt.touches.values()];
  return points.length === 2 && points[0] && points[1] ? [points[0], points[1]] : null;
}
function pairMetrics(pair) {
  const [a, b] = pair;
  return {
    distance: Math.hypot(b.x - a.x, b.y - a.y),
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  };
}
function installTouch(rt) {
  const onDown = (event) => {
    if (event.pointerType !== "touch") return;
    rt.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pair = touchPair(rt);
    if (!pair) return;
    const metrics = pairMetrics(pair);
    const sidebar = shiftedPixels(rt, rt.display.snapshot().regions.sidebar?.pixels);
    rt.gesture = {
      context: pointInPixels(metrics.center.x, metrics.center.y, sidebar) ? "sidebar" : "view",
      ...metrics
    };
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const onMove = (event) => {
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
    const cellX = Math.abs(dx) >= snapshot.grid.cellWidth * 1.25 ? snapEven(-dx / snapshot.grid.cellWidth) : 0;
    const cellY = Math.abs(dy) >= snapshot.grid.cellHeight * 1.25 ? snapEven(-dy / snapshot.grid.cellHeight) : 0;
    if (cellX !== 0 || cellY !== 0) {
      panView(rt, cellX, cellY);
      gesture.center = next.center;
    }
  };
  const onEnd = (event) => {
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
function installResponsiveMap(rt) {
  let timer = null;
  const onResize = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (runtime !== rt) return;
      if (!rt.gridActive) {
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
          y: snapshot.viewport.origin.y + Math.floor(snapshot.viewport.size.height / 2)
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
function createSidebar(rt) {
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
    scrollbarWidth: "none"
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
    frame: null
  };
}
function syncSidebarVisibility(rt) {
  if (!rt.sidebar) return;
  rt.sidebar.host.style.display = rt.display.snapshot().mode === "map" ? "none" : "block";
}
function turnSidebarPage(rt, direction) {
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
function fitSidebarText(sidebar, preferred) {
  let fontSize = preferred;
  sidebar.host.style.fontSize = `${String(fontSize)}px`;
  while (fontSize > 9 && (sidebar.body.scrollWidth > sidebar.body.clientWidth || sidebar.body.scrollHeight > sidebar.body.clientHeight)) {
    fontSize -= 1;
    sidebar.host.style.fontSize = `${String(fontSize)}px`;
  }
}
function paintSidebar(rt, section, frame) {
  if (!rt.gridActive) {
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
    lineHeight: "1.25"
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
    boxSizing: "border-box"
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
      flex: "0 1 auto"
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
      padding: "0 0.35em"
    });
    button.addEventListener("click", () => turnSidebarPage(rt, 1));
    sidebar.body.appendChild(button);
  }
  fitSidebarText(sidebar, plan.fontSize);
}
function installZoomPan(ctx) {
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
  const rt = {
    ctx,
    display,
    preference: {
      ...readDisplayPreference(ctx.prefs?.get()),
      ...ctx.flags["qol.accessibilityZoom"] === true ? { zoomIndex: Math.max(readDisplayPreference(ctx.prefs?.get()).zoomIndex, ACCESSIBILITY_ZOOM_INDEX) } : {}
    },
    cleanups: [],
    touches: /* @__PURE__ */ new Map(),
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
    screenFitTimer: null
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
function zoomPanHud(ctx) {
  if (ctx.flags["qol.zoomPan"] !== true && ctx.flags["qol.accessibilityZoom"] !== true || !runtime) {
    return void 0;
  }
  const rt = runtime;
  return { sidebar: { present: (section, frame) => paintSidebar(rt, section, frame) } };
}
function uninstallZoomPan() {
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

// accessibility.ts
var COLORBLIND_FILTER_ID = "qol-accessibility-colorblind";
var HIGH_CONTRAST_FILTER = "contrast(1.55) saturate(1.2)";
var COLORBLIND_MATRIX = "0.812 0.199 -0.011 0 0 0 1 0 0 0 -0.188 0.199 0.989 0 0 0 0 0 1 0";
function accessibilityFilter(flags) {
  const parts = [];
  if (flags["qol.accessibilityColorblind"] === true) {
    parts.push(`url("#${COLORBLIND_FILTER_ID}")`);
  }
  if (flags["qol.accessibilityHighContrast"] === true) parts.push(HIGH_CONTRAST_FILTER);
  return parts.length > 0 ? parts.join(" ") : null;
}
function ensureColorblindFilter() {
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
function setSidebarVisualFilter(filter) {
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
function installAccessibilityAccommodations(ctx) {
  const wantsFilter = ctx.flags["qol.accessibilityHighContrast"] === true || ctx.flags["qol.accessibilityColorblind"] === true;
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

// plugin.ts
var PREF_ERROR_REPORT_LIMIT = 20;
function mayRemember(opts, name, cheats) {
  if (opts.isBirth(name)) return false;
  if (opts.isCheat(name) || opts.isScore(name)) return cheats;
  return true;
}
var TERM_COLS = 80;
var TERM_ROWS = 24;
var GLYPH_W = 16;
var GLYPH_H = 24;
var HOVER_DWELL_MS = 2e3;
var TOUCH_HOLD_MS = 1e3;
var TILE_PREVIEW_PX = 64;
function pointInRect(rect, x, y) {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}
function hoverCellAt(rect, clientX, clientY) {
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
function hoverCaveGrid(col, row, width, height) {
  if (width < 1 || height < 1) return null;
  const mapW = Math.min(TERM_COLS - 2, width);
  const mapH = Math.min(TERM_ROWS - 2, height);
  if (mapW < 1 || mapH < 1) return null;
  const bx = col - 1;
  const by = row - 1;
  if (bx < 0 || bx >= mapW || by < 0 || by >= mapH) return null;
  return hoverCaveGridInView(
    bx,
    by,
    mapW,
    mapH,
    { x: 0, y: 0 },
    { width, height }
  );
}
function hoverCaveGridInView(bucketX, bucketY, mapCols, mapRows, origin, size) {
  if (mapCols < 1 || mapRows < 1 || size.width < 1 || size.height < 1 || bucketX < 0 || bucketY < 0 || bucketX >= mapCols || bucketY >= mapRows) return null;
  return {
    x: origin.x + Math.min(size.width - 1, Math.floor((bucketX + 0.5) * size.width / mapCols)),
    y: origin.y + Math.min(size.height - 1, Math.floor((bucketY + 0.5) * size.height / mapRows))
  };
}
var KIND_TITLE = {
  character: "Character",
  creature: "Creature",
  item: "Item",
  trap: "Trap",
  shop: "Shop",
  terrain: "Terrain"
};
function hoverCardContent(core, state, grid) {
  const result = core.describeLookGrid(state, grid, 0);
  const text = result?.text?.trim() ?? "";
  if (!text) return null;
  const player = state.actor?.grid;
  let kind;
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
function hoverCardText(core, state, grid) {
  return hoverCardContent(core, state, grid)?.text ?? null;
}
var hoverCardsWired = false;
function positionHoverCard(el, clientX, clientY) {
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
function buildHoverCardElement() {
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
    boxShadow: "0 4px 16px rgba(0,0,0,0.45)"
  });
  const title = document.createElement("div");
  Object.assign(title.style, {
    fontWeight: "700",
    marginBottom: "6px",
    color: "#f0d878",
    letterSpacing: "0.02em"
  });
  const row = document.createElement("div");
  Object.assign(row.style, {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start"
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
    border: "1px solid #555"
  });
  const body = document.createElement("div");
  Object.assign(body.style, {
    whiteSpace: "pre-wrap",
    flex: "1 1 auto",
    minWidth: "0"
  });
  row.appendChild(img);
  row.appendChild(body);
  root.appendChild(title);
  root.appendChild(row);
  document.body.appendChild(root);
  return { root, title, img, body };
}
function paintTilePreview(canvas, grid, termCell, view, termSize) {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) return false;
  ctx2d.imageSmoothingEnabled = false;
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  const overlays = Array.from(
    document.querySelectorAll('body > canvas[aria-hidden="true"]')
  );
  for (const src of overlays) {
    if (src === canvas || src.id === "game") continue;
    if (src.width < 1 || src.height < 1) continue;
    if (view.size.width < 1 || view.size.height < 1) continue;
    const cellW2 = src.width / view.size.width;
    const cellH2 = src.height / view.size.height;
    if (cellW2 < 1 || cellH2 < 1) continue;
    const sourceX = grid.x - view.origin.x;
    const sourceY = grid.y - view.origin.y;
    if (sourceX < 0 || sourceY < 0 || sourceX >= view.size.width || sourceY >= view.size.height) {
      continue;
    }
    try {
      ctx2d.drawImage(
        src,
        sourceX * cellW2,
        sourceY * cellH2,
        cellW2,
        cellH2,
        0,
        0,
        canvas.width,
        canvas.height
      );
      return true;
    } catch {
    }
  }
  const game = document.getElementById("game");
  if (!(game instanceof HTMLCanvasElement) || !termCell) return false;
  if (game.width < 1 || game.height < 1) return false;
  const cellW = game.width / termSize.cols;
  const cellH = game.height / termSize.rows;
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
      canvas.height
    );
    return true;
  } catch {
    return false;
  }
}
function installMapHoverCards(ctx) {
  if (ctx.flags["qol.mapHoverCards"] !== true) return;
  if (hoverCardsWired) return;
  if (typeof document === "undefined" || typeof window === "undefined") return;
  hoverCardsWired = true;
  const core = ctx.core;
  const card = buildHoverCardElement();
  let mapOpenGuess = false;
  let touchPinned = false;
  let dwellTimer = null;
  let holdTimer = null;
  let dwellGridKey = null;
  let holdPointerId = null;
  let shownGridKey = null;
  let lastClientX = 0;
  let lastClientY = 0;
  const gridKey = (g) => `${String(g.x)},${String(g.y)}`;
  const clearDwell = () => {
    if (dwellTimer !== null) clearTimeout(dwellTimer);
    dwellTimer = null;
    dwellGridKey = null;
  };
  const clearHold = () => {
    if (holdTimer !== null) clearTimeout(holdTimer);
    holdTimer = null;
    holdPointerId = null;
  };
  const hide = () => {
    card.root.style.display = "none";
    shownGridKey = null;
    touchPinned = false;
  };
  const resolveCaveGrid = (clientX, clientY) => {
    const game = document.getElementById("game");
    if (!game) return null;
    const state = ctx.state;
    const chunk = state?.chunk;
    if (!chunk || chunk.width < 1 || chunk.height < 1) return null;
    const snapshot = ctx.display?.snapshot();
    if (snapshot?.mode === "map") {
      const region = snapshot.regions.map;
      const pixels = region?.pixels;
      const cells = region?.cells;
      if (!pixels || !cells) return null;
      const view = {
        origin: { x: snapshot.viewport.origin.x, y: snapshot.viewport.origin.y },
        size: { width: snapshot.viewport.size.width, height: snapshot.viewport.size.height }
      };
      let projection = pixels;
      let mapCols = cells.cols;
      let mapRows = cells.rows;
      const graphics = Array.from(
        document.querySelectorAll('body > canvas[aria-hidden="true"]')
      ).filter((candidate) => candidate !== card.img && candidate.id !== "game");
      if (graphics.length > 0) {
        const rect = graphics[graphics.length - 1].getBoundingClientRect();
        projection = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
        mapCols = view.size.width;
        mapRows = view.size.height;
      }
      if (!pointInRect(projection, clientX, clientY) || projection.width <= 0 || projection.height <= 0) {
        return null;
      }
      const bucketX = Math.floor((clientX - projection.x) * mapCols / projection.width);
      const bucketY = Math.floor((clientY - projection.y) * mapRows / projection.height);
      const grid2 = hoverCaveGridInView(
        bucketX,
        bucketY,
        mapCols,
        mapRows,
        view.origin,
        view.size
      );
      if (!grid2) return null;
      const regionCol = Math.max(0, Math.min(
        cells.cols - 1,
        Math.floor((clientX - pixels.x) * cells.cols / pixels.width)
      ));
      const regionRow = Math.max(0, Math.min(
        cells.rows - 1,
        Math.floor((clientY - pixels.y) * cells.rows / pixels.height)
      ));
      return {
        grid: grid2,
        cell: { col: cells.col + regionCol, row: cells.row + regionRow },
        view,
        termSize: { cols: snapshot.grid.cols, rows: snapshot.grid.rows }
      };
    }
    const cell = hoverCellAt(game.getBoundingClientRect(), clientX, clientY);
    if (!cell) return null;
    const grid = hoverCaveGrid(cell.col, cell.row, chunk.width, chunk.height);
    if (!grid) return null;
    return {
      grid,
      cell,
      view: { origin: { x: 0, y: 0 }, size: { width: chunk.width, height: chunk.height } },
      termSize: { cols: TERM_COLS, rows: TERM_ROWS }
    };
  };
  const showAt = (clientX, clientY, resolved) => {
    const state = ctx.state;
    if (!state) return false;
    const content = hoverCardContent(core, state, resolved.grid);
    if (!content) return false;
    card.title.textContent = content.title;
    card.body.textContent = content.text;
    const painted = paintTilePreview(
      card.img,
      resolved.grid,
      resolved.cell,
      resolved.view,
      resolved.termSize
    );
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
  window.addEventListener(
    "pointerdown",
    (ev) => {
      if (ctx.display?.snapshot().mode !== "map" && !mapOpenGuess) return;
      const resolved = resolveCaveGrid(ev.clientX, ev.clientY);
      if (touchPinned) {
        const same = resolved !== null && shownGridKey !== null && gridKey(resolved.grid) === shownGridKey;
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
            if (twoFingerGestureActive()) return;
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
          if (twoFingerGestureActive()) return;
          if (showAt(ev.clientX, ev.clientY, atDown)) touchPinned = true;
        }, TOUCH_HOLD_MS);
      }
    },
    true
  );
  window.addEventListener("pointerup", (ev) => {
    if (holdPointerId !== null && ev.pointerId === holdPointerId && holdTimer !== null) {
      clearHold();
    }
  });
  window.addEventListener("pointercancel", (ev) => {
    if (holdPointerId !== null && ev.pointerId === holdPointerId) clearHold();
  });
  document.addEventListener("pointermove", (ev) => {
    if (ctx.display?.snapshot().mode !== "map" && !mapOpenGuess) return;
    lastClientX = ev.clientX;
    lastClientY = ev.clientY;
    if (ev.pointerType === "touch" || ev.pointerType === "pen") {
      if (holdTimer !== null && holdPointerId === ev.pointerId) {
        const resolved2 = resolveCaveGrid(ev.clientX, ev.clientY);
        if (!resolved2) clearHold();
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
var plugin_default = {
  api: 1,
  hooks(ctx) {
    const { flags, core } = ctx;
    const hooks = {};
    if (flags["qol.autoDig"] === true) {
      hooks.walkBlockedByDiggable = (state, grid, deps) => {
        if (!core.movementTunnelTest(state, grid)) return null;
        core.tunnelAux(state, grid, deps);
        return state.z.moveEnergy;
      };
    }
    if (flags["qol.forgivingPrefFiles"] === true) {
      const setPolicy = core.setPrefErrorPolicy;
      if (typeof setPolicy !== "function") {
        ctx.log?.("this game is too old to keep reading a pref file past a mistake");
      } else {
        setPolicy({
          continueAfterError: true,
          reportLimit: PREF_ERROR_REPORT_LIMIT
        });
      }
    }
    if (flags["qol.rememberSettings"] === true) {
      const prefs = ctx.prefs;
      if (!prefs) {
        ctx.log?.("this game is too old to remember settings (no ctx.prefs)");
      } else {
        const classifier = new core.OptionState();
        const cheats = flags["qol.rememberCheats"] === true;
        hooks.optionsChanged = (snapshot) => {
          const values = {};
          for (const [name, value] of Object.entries(snapshot.values)) {
            if (mayRemember(classifier, name, cheats)) values[name] = value;
          }
          const remembered = {
            v: 1,
            values,
            hitpointWarn: snapshot.hitpointWarn,
            delayFactor: snapshot.delayFactor,
            lazymoveDelay: snapshot.lazymoveDelay
          };
          prefs.set(withRememberedSettings(prefs.get(), remembered));
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
   * The registry host is untouched. The sidebar capability is consumed by
   * hud(), not by a registry facade, and this registration path needs none of
   * the host's mutable registries.
   *
   * ALSO WHERE qol.mapHoverCards WIRES ITSELF UP (installMapHoverCards, above) -
   * same reason: it is the one seam that sees a live ctx.state, and unlike the
   * remember-settings apply half it is not gated on ctx.newCharacter, so it
   * runs first and unconditionally.
   */
  register(_host, ctx) {
    installZoomPan(ctx);
    installAccessibilityAccommodations(ctx);
    installMapHoverCards(ctx);
    if (ctx.flags["qol.rememberSettings"] !== true) return;
    if (ctx.newCharacter !== true) return;
    const opts = ctx.state?.options;
    const stored = ctx.prefs?.get();
    if (!opts || !stored || typeof stored !== "object") return;
    const remembered = readRememberedSettings(stored);
    if (!remembered) {
      const version = stored.v;
      ctx.log?.(`stored settings are version ${String(version)}; ignoring them`);
      return;
    }
    const cheats = ctx.flags["qol.rememberCheats"] === true;
    let applied = 0;
    for (const [name, value] of Object.entries(remembered.values ?? {})) {
      if (!mayRemember(opts, name, cheats)) continue;
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
  hud(ctx) {
    return zoomPanHud(ctx);
  },
  uninstall() {
    uninstallZoomPan();
  }
};
export {
  HOVER_DWELL_MS,
  TOUCH_HOLD_MS,
  plugin_default as default,
  hoverCardContent,
  hoverCardText,
  hoverCaveGrid,
  hoverCaveGridInView,
  hoverCellAt
};
