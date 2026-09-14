import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DISPLAY_PREFERENCE,
  readDisplayPreference,
  readRememberedSettings,
  withDisplayPreference,
  withRememberedSettings,
  type RememberedSettings,
} from "./preferences";
import {
  installZoomPan,
  ACCESSIBILITY_ZOOM_INDEX,
  INTERFACE_ZOOM_SCALES,
  PLAY_ZOOM_CELL_HEIGHTS,
  SUBWINDOW_ZOOM_CELL_HEIGHTS,
  defaultPlayFillCellHeight,
  hidesSidebar,
  mapViewFor,
  pannedOrigin,
  pinchDirection,
  sidebarPagePlan,
  sidebarRowGap,
  responsiveSidebarColumns,
  snapEven,
  stepIndex,
  uninstallZoomPan,
  zoomPanHud,
  type DisplayLike,
  type DisplaySnapshotLike,
  type SubwindowControlLike,
  type SubwindowInfoLike,
  type SubwindowsLike,
} from "./zoom-pan";

function snapshot(overrides: Partial<DisplaySnapshotLike> = {}): DisplaySnapshotLike {
  return {
    mode: "play",
    grid: { cols: 80, rows: 24, cellWidth: 16, cellHeight: 24 },
    viewport: {
      origin: { x: 20, y: 10 },
      size: { width: 64, height: 20 },
      screenOrigin: { x: 14, y: 2 },
    },
    level: { width: 120, height: 60 },
    layout: "left",
    regions: {},
    ...overrides,
  };
}

function fakeKey(key: string, extra: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: true,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    ...extra,
  } as unknown as KeyboardEvent;
}

function fakeDisplay(initial = snapshot()): {
  display: DisplayLike;
  key(event: KeyboardEvent): void;
  setGrid: ReturnType<typeof vi.fn>;
  setCamera: ReturnType<typeof vi.fn>;
  setMapView: ReturnType<typeof vi.fn>;
  setSidebarExtent: ReturnType<typeof vi.fn>;
  setTileScaling: ReturnType<typeof vi.fn>;
  setFullMapOverview: ReturnType<typeof vi.fn>;
  setVisualFilter: ReturnType<typeof vi.fn>;
} {
  let current = initial;
  /* An array, not a single slot: the real display (main.ts) broadcasts one
   * keydown to every subscriber (installKeyboard AND installTitleBoundary
   * both call ctx.display.onKey now), and a single-slot fake would have the
   * second registration silently steal the first one's events. */
  const listeners: Array<(event: KeyboardEvent) => void> = [];
  const setGrid = vi.fn();
  const setCamera = vi.fn((origin: { x: number; y: number } | null) => {
    if (origin) current = { ...current, viewport: { ...current.viewport, origin } };
  });
  const setMapView = vi.fn((view: {
    origin: { x: number; y: number };
    size: { width: number; height: number };
  } | null) => {
    if (view) current = { ...current, viewport: { ...current.viewport, ...view } };
  });
  const setSidebarExtent = vi.fn();
  const setTileScaling = vi.fn();
  const setFullMapOverview = vi.fn();
  const setVisualFilter = vi.fn();
  return {
    display: {
      snapshot: () => current,
      onKey: (next) => {
        listeners.push(next);
        return () => {
          const i = listeners.indexOf(next);
          if (i >= 0) listeners.splice(i, 1);
        };
      },
      setGrid,
      setCamera,
      setMapView,
      setSidebarExtent,
      setTileScaling,
      setFullMapOverview,
      setVisualFilter,
      repaint: vi.fn(),
    },
    key: (event) => {
      for (const listener of [...listeners]) listener(event);
    },
    setGrid,
    setCamera,
    setMapView,
    setSidebarExtent,
    setTileScaling,
    setFullMapOverview,
    setVisualFilter,
  };
}

afterEach(() => {
  uninstallZoomPan();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function activateHud(ctx: Parameters<typeof installZoomPan>[0]): void {
  const section = { entries: [], region: { pixels: { x: 0, y: 0, width: 320, height: 480 } } };
  const frame = { layout: "left" } as const;
  zoomPanHud(ctx)?.sidebar?.present(section, frame);
  vi.advanceTimersByTime(0);
}

function fakeSubwindows(initial: readonly SubwindowInfoLike[]): {
  subwindows: SubwindowsLike;
  setGrid: ReturnType<typeof vi.fn>;
  addControl: ReturnType<typeof vi.fn>;
  controls: Map<string, SubwindowControlLike>;
  setPanels(panels: readonly SubwindowInfoLike[]): void;
} {
  let panels = initial;
  const controls = new Map<string, SubwindowControlLike>();
  const setGrid = vi.fn();
  const addControl = vi.fn((id: string, key: string, control: SubwindowControlLike) => {
    controls.set(`${id}:${key}`, control);
    return vi.fn(() => controls.delete(`${id}:${key}`));
  });
  return {
    subwindows: {
      list: () => panels,
      setGrid,
      addControl,
    },
    setGrid,
    addControl,
    controls,
    setPanels: (next) => { panels = next; },
  };
}

function subwindow(overrides: Partial<SubwindowInfoLike> = {}): SubwindowInfoLike {
  return {
    id: "messages",
    bounds: { x: 600, y: 100, width: 300, height: 200 },
    focused: false,
    grid: { cols: 40, rows: 10, cellWidth: 11, cellHeight: 16 },
    ...overrides,
  };
}

describe("one install-wide preference value", () => {
  const options: RememberedSettings = {
    v: 1,
    values: { use_sound: true },
    hitpointWarn: 4,
    delayFactor: 12,
    lazymoveDelay: 0,
  };

  it("migrates the old direct options shape and preserves both preference groups", () => {
    const withDisplay = withDisplayPreference(options, {
      v: 2,
      zoomIndex: 5,
      interfaceZoomIndex: 2,
      mapDetail: 1,
    });
    expect(readRememberedSettings(withDisplay)).toEqual(options);
    expect(readDisplayPreference(withDisplay).zoomIndex).toBe(5);

    const updated = withRememberedSettings(withDisplay, { ...options, hitpointWarn: 8 });
    expect(readRememberedSettings(updated)?.hitpointWarn).toBe(8);
    expect(readDisplayPreference(updated).zoomIndex).toBe(5);
  });

  it("clamps corrupt indices and defaults unknown versions", () => {
    expect(readDisplayPreference({
      v: 2,
      display: { v: 1, zoomIndex: 99, interfaceZoomIndex: -8, mapDetail: 2.5 },
    })).toEqual({ ...DEFAULT_DISPLAY_PREFERENCE, zoomIndex: 11, interfaceZoomIndex: 0 });
    expect(readDisplayPreference({
      v: 2,
      display: { v: 2, zoomIndex: 99, interfaceZoomIndex: -8, mapDetail: 2.5 },
    })).toEqual({ ...DEFAULT_DISPLAY_PREFERENCE, zoomIndex: 14, interfaceZoomIndex: 0 });
    expect(readDisplayPreference({ v: 99 })).toEqual(DEFAULT_DISPLAY_PREFERENCE);
  });
});

describe("whole-cell zoom and pan arithmetic", () => {
  it("steps within a finite zoom ladder and snaps to even cells", () => {
    expect(stepIndex(0, -1, PLAY_ZOOM_CELL_HEIGHTS.length - 1)).toBe(0);
    expect(stepIndex(3, 1, PLAY_ZOOM_CELL_HEIGHTS.length - 1)).toBe(4);
    expect(stepIndex(PLAY_ZOOM_CELL_HEIGHTS.length - 1, 1, PLAY_ZOOM_CELL_HEIGHTS.length - 1))
      .toBe(PLAY_ZOOM_CELL_HEIGHTS.length - 1);
    expect(snapEven(5)).toBe(6);
    expect(snapEven(-3)).toBe(-2);
  });

  it("extends the play ladder at both ends without changing legacy saved zoom heights", () => {
    expect(PLAY_ZOOM_CELL_HEIGHTS).toEqual([8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72]);
    expect(readDisplayPreference({
      v: 2,
      display: { v: 1, zoomIndex: 3, interfaceZoomIndex: 1, mapDetail: 0 },
    }).zoomIndex).toBe(7);
  });

  it("makes bounded even map windows and camera origins", () => {
    const view = mapViewFor(snapshot(), 2, { x: 115, y: 55 });
    expect(view).toEqual({ origin: { x: 0, y: 16 }, size: { width: 120, height: 44 } });
    expect(mapViewFor(snapshot(), 0, { x: 50, y: 30 })).toBeNull();
    expect(pannedOrigin(snapshot(), 3, -9)).toEqual({ x: 24, y: 2 });
  });

  it("requires a useful pinch distance before taking a zoom step", () => {
    expect(pinchDirection(100, 110)).toBe(0);
    expect(pinchDirection(100, 120)).toBe(1);
    expect(pinchDirection(100, 80)).toBe(-1);
  });
});

describe("responsive play layout defaults", () => {
  it("fits the complete vanilla play viewport to the binding pane dimension", () => {
    /* 3840 by 2160 is width-bound: 72px cells yield 80 columns with the
     * bitmap font's rounded 48px width, enough for 12 sidebar + 66 map cells.
     * A 73px cell rounds to 49px wide and loses that final map column. */
    expect(defaultPlayFillCellHeight({ width: 3840, height: 2160 }, 12)).toBe(72);
    /* This pane is height-bound: the 24 terminal rows, rather than its width,
     * set the fitted default. */
    expect(defaultPlayFillCellHeight({ width: 4000, height: 960 }, 12)).toBe(40);
  });

  it("keeps vanilla's one-column sidebar-to-map separation at every interface scale", () => {
    /* Vanilla's 13-cell sidebar only paints its first 12 cells (core
     * hud-view.ts), so the DOM sidebar's own padding needs this one-cell
     * reduction to avoid adding another blank column before the map. */
    expect(INTERFACE_ZOOM_SCALES.map(responsiveSidebarColumns)).toEqual([9, 12, 15, 19]);
  });
});

describe("scroll-free sidebar fitting", () => {
  it("pages a maximum-scale phone strip instead of overflowing it", () => {
    expect(sidebarPagePlan(7, "top", { width: 340, height: 48 }, 1.5, 0)).toEqual({
      page: 0,
      pages: 4,
      start: 0,
      end: 2,
      fontSize: 21,
    });
    expect(sidebarPagePlan(7, "top", { width: 340, height: 48 }, 1.5, 99)).toMatchObject({
      page: 3,
      start: 6,
      end: 7,
    });
  });

  it("keeps a roomy vertical sidebar on one page and pages a short one", () => {
    expect(sidebarPagePlan(18, "left", { width: 240, height: 600 }, 1, 0).pages).toBe(1);
    expect(sidebarPagePlan(18, "left", { width: 240, height: 120 }, 1, 0).pages).toBeGreaterThan(1);
  });
});

describe("independent tiled subwindow zoom (neo-angband #241)", () => {
  it("zooms only the hovered panel with Ctrl-Wheel", () => {
    vi.useFakeTimers();
    const fakeWindow = new EventTarget() as EventTarget & { innerWidth: number; innerHeight: number };
    fakeWindow.innerWidth = 1200;
    fakeWindow.innerHeight = 800;
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("location", { href: "http://localhost/?agent=probe" });
    const display = fakeDisplay();
    const panels = fakeSubwindows([subwindow()]);
    installZoomPan({
      flags: { "qol.zoomPan": true },
      display: display.display,
      subwindows: panels.subwindows,
    });

    const event = new Event("wheel", { cancelable: true });
    Object.defineProperties(event, {
      ctrlKey: { value: true },
      deltaY: { value: -120 },
      clientX: { value: 700 },
      clientY: { value: 180 },
    });
    fakeWindow.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(panels.setGrid).toHaveBeenCalledWith("messages", {
      cellHeight: SUBWINDOW_ZOOM_CELL_HEIGHTS[4],
      minCols: 20,
      minRows: 3,
      snapViewportToEven: false,
    });
    expect(display.setGrid).not.toHaveBeenCalled();
  });

  it("zooms only the focused panel with Ctrl plus or minus", () => {
    vi.stubGlobal("location", { href: "http://localhost/?agent=probe" });
    const display = fakeDisplay();
    const panels = fakeSubwindows([subwindow({ focused: true })]);
    installZoomPan({
      flags: { "qol.zoomPan": true },
      display: display.display,
      subwindows: panels.subwindows,
    });

    const event = fakeKey("-");
    display.key(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(panels.setGrid).toHaveBeenCalledWith("messages", expect.objectContaining({ cellHeight: 14 }));
    expect(display.setGrid).not.toHaveBeenCalled();
  });

  it("leaves Ctrl-Wheel outside a panel for the existing main-view zoom", () => {
    vi.useFakeTimers();
    const fakeWindow = new EventTarget() as EventTarget & { innerWidth: number; innerHeight: number };
    fakeWindow.innerWidth = 1200;
    fakeWindow.innerHeight = 800;
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("location", { href: "http://localhost/?agent=probe" });
    const display = fakeDisplay();
    const panels = fakeSubwindows([subwindow()]);
    installZoomPan({
      flags: { "qol.zoomPan": true },
      display: display.display,
      subwindows: panels.subwindows,
    });

    const event = new Event("wheel", { cancelable: true });
    Object.defineProperties(event, {
      ctrlKey: { value: true },
      deltaY: { value: 120 },
      clientX: { value: 100 },
      clientY: { value: 100 },
    });
    fakeWindow.dispatchEvent(event);
    vi.advanceTimersByTime(0);

    expect(panels.setGrid).not.toHaveBeenCalled();
    expect(display.setGrid).toHaveBeenLastCalledWith(expect.objectContaining({ cellHeight: 24 }));
  });

  it("adds panel controls and keeps them in sync as panels disappear", () => {
    vi.useFakeTimers();
    vi.stubGlobal("location", { href: "http://localhost/?agent=probe" });
    const display = fakeDisplay();
    const panels = fakeSubwindows([subwindow()]);
    installZoomPan({
      flags: { "qol.zoomPan": true },
      display: display.display,
      subwindows: panels.subwindows,
    });

    expect(panels.addControl).toHaveBeenCalledWith("messages", "zoom-out", expect.objectContaining({
      glyph: "-",
      title: "Zoom out",
    }));
    expect(panels.addControl).toHaveBeenCalledWith("messages", "zoom-in", expect.objectContaining({
      glyph: "+",
      title: "Zoom in",
    }));
    panels.controls.get("messages:zoom-in")?.onActivate();
    expect(panels.setGrid).toHaveBeenLastCalledWith("messages", expect.objectContaining({ cellHeight: 18 }));

    panels.setPanels([]);
    vi.advanceTimersByTime(200);
    expect(panels.controls.size).toBe(0);
  });

  it("falls through to the main view when the optional subwindow capability is absent", () => {
    vi.useFakeTimers();
    vi.stubGlobal("location", { href: "http://localhost/?agent=probe" });
    const display = fakeDisplay();
    installZoomPan({ flags: { "qol.zoomPan": true }, display: display.display });

    const event = fakeKey("=");
    display.key(event);
    vi.advanceTimersByTime(0);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(display.setGrid).toHaveBeenLastCalledWith(expect.objectContaining({
      cellHeight: PLAY_ZOOM_CELL_HEIGHTS[8],
    }));
  });
});

describe("sidebar visibility by display mode (neo-angband #234, #250)", () => {
  it("hides for map, store and modal, shows for ordinary play", () => {
    expect(hidesSidebar("play")).toBe(false);
    expect(hidesSidebar("map")).toBe(true);
    /* A shop screen renders under the same viewport as "play" with no region
     * of its own left for this overlay - hiding it here is what keeps a shop's
     * own item listing from being painted over. */
    expect(hidesSidebar("store")).toBe(true);
    /* "modal" covers everything else core's own modalDepth already tracks -
     * the Options Menu chief among them, which used to render with this
     * sidebar drawn right over its own text (#250). */
    expect(hidesSidebar("modal")).toBe(true);
  });

  it("hides the existing DOM sidebar in the Escape event before core changes mode", () => {
    vi.useFakeTimers();
    vi.stubGlobal("location", { href: "http://localhost/?agent=probe" });
    const fakeWindow = new EventTarget() as EventTarget & { devicePixelRatio: number; innerWidth: number };
    fakeWindow.devicePixelRatio = 1;
    fakeWindow.innerWidth = 1200;
    vi.stubGlobal("window", fakeWindow);
    let sidebarHost: { style: Record<string, string> } | undefined;
    const element = (): {
      style: Record<string, string>;
      setAttribute: ReturnType<typeof vi.fn>;
      appendChild: ReturnType<typeof vi.fn>;
      replaceChildren: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    } => ({
      style: {},
      setAttribute: vi.fn(),
      appendChild: vi.fn(),
      replaceChildren: vi.fn(),
      remove: vi.fn(),
    });
    const body = element();
    vi.stubGlobal("document", {
      body: {
        ...body,
        appendChild: vi.fn((host) => { sidebarHost = host; }),
      },
      documentElement: { style: {} },
      createElement: vi.fn(element),
    });
    const fake = fakeDisplay();
    installZoomPan({ flags: { "qol.zoomPan": true }, display: fake.display });

    /* The first presentation arms the gameplay grid; the second creates and
     * paints the sidebar exactly as a real gameplay HUD frame does. */
    activateHud({ flags: { "qol.zoomPan": true }, display: fake.display });
    activateHud({ flags: { "qol.zoomPan": true }, display: fake.display });
    expect(sidebarHost?.style.display).toBe("block");

    /* This is the precise #250 reopening gap: before core's Escape handler
     * invokes openModal, snapshot() still says play. The DOM must nevertheless
     * be hidden during this same event, not after a timer gets a chance to poll
     * core's later modal mode. */
    fake.key(fakeKey("Escape", { ctrlKey: false }));
    expect(fake.display.snapshot().mode).toBe("play");
    expect(sidebarHost?.style.display).toBe("none");
  });

  it("polls for a mode change once the grid activates, and stops polling on uninstall", () => {
    /* A shop opens from a raw mouse click (click-to-pathfind) as readily as
     * from a tracked keypress, and its own screen never calls back into
     * paintSidebar the way ordinary play does - so nothing here is told the
     * moment a store opens or closes. Polling display.snapshot().mode is what
     * catches that regardless of how the player got there. */
    vi.useFakeTimers();
    vi.stubGlobal("location", { href: "http://localhost/?agent=probe" });
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const fake = fakeDisplay();
    installZoomPan({ flags: { "qol.zoomPan": true }, display: fake.display });

    fake.key(fakeKey("="));
    vi.advanceTimersByTime(0);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 200);

    uninstallZoomPan();
    expect(clearIntervalSpy).toHaveBeenCalledWith(setIntervalSpy.mock.results[0]?.value);
  });
});

describe("sidebar extent by HUD layout (neo-angband #252)", () => {
  it("releases the responsive reservation and refills the play grid when the HUD has no sidebar", () => {
    vi.useFakeTimers();
    vi.stubGlobal("location", { href: "http://localhost/?agent=probe" });
    const fake = fakeDisplay(snapshot({ surface: { x: 0, y: 0, width: 3840, height: 2160 } }));
    const ctx = { flags: { "qol.zoomPan": true }, display: fake.display };
    installZoomPan(ctx);
    activateHud(ctx);
    expect(fake.setSidebarExtent).toHaveBeenLastCalledWith({ columns: 12, topRows: 1 });
    expect(fake.setGrid).toHaveBeenLastCalledWith(expect.objectContaining({ cellHeight: 72 }));

    zoomPanHud(ctx)?.sidebar?.present(
      { entries: [], region: { pixels: { x: 0, y: 0, width: 320, height: 480 } } },
      { layout: "none" },
    );

    /* The display facade uses null, not literal zeroes: core clamps an extent
     * object to nonzero minima, while null releases this mod's reservation. */
    expect(fake.setSidebarExtent).toHaveBeenLastCalledWith(null);
    expect(fake.setGrid).toHaveBeenLastCalledWith(expect.objectContaining({ cellHeight: 86 }));
  });
});

describe("sidebar row gaps", () => {
  it("opens a blank line for each row core's side_handlers[] table skipped", () => {
    /* AU at row 6, then a gap for the equippy/blank rows before STR at row 9
     * (#196's own reference layout): two blank lines, not zero. */
    expect(sidebarRowGap("left", 6, 9)).toBe(2);
    /* Adjacent rows (STR at 9, INT at 10): no gap. */
    expect(sidebarRowGap("left", 9, 10)).toBe(0);
  });

  it("never opens a gap for the first entry, or for the top strip", () => {
    expect(sidebarRowGap("left", null, 6)).toBe(0);
    expect(sidebarRowGap("top", 6, 9)).toBe(0);
  });

  it("treats a missing row as unknown rather than a negative gap", () => {
    expect(sidebarRowGap("left", 6, undefined)).toBe(0);
  });
});

describe("input integration", () => {
  it("uses the core-measured surface for an enlarged persisted zoom without moving its canvas", () => {
    vi.useFakeTimers();
    const fakeWindow = new EventTarget() as EventTarget & { innerWidth: number; innerHeight: number };
    fakeWindow.innerWidth = 1442;
    fakeWindow.innerHeight = 852;
    const body = { style: {}, setAttribute: vi.fn() };
    const querySelector = vi.fn(() => {
      throw new Error("QoL must not reposition the core-owned canvas");
    });
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("document", { body, documentElement: { style: {} }, querySelector });
    vi.stubGlobal("location", { href: "http://localhost/?agent=probe" });
    const zoom = fakeDisplay(snapshot({ surface: { x: 900, y: 40, width: 360, height: 300 } }));
    const stored = { v: 2, display: { v: 1, zoomIndex: 7, interfaceZoomIndex: 0, mapDetail: 0 } };
    installZoomPan({
      flags: { "qol.zoomPan": true, "qol.accessibilityZoom": true },
      prefs: { get: () => stored, set: () => undefined },
      display: zoom.display,
    });

    zoom.key(fakeKey("5", { ctrlKey: false }));
    vi.advanceTimersByTime(0);

    expect(zoom.setGrid).toHaveBeenLastCalledWith({
      cellHeight: 21,
      minCols: 24,
      minRows: 12,
      snapViewportToEven: true,
    });
    expect(querySelector).not.toHaveBeenCalled();
  });

  it("fills a roomy pane by default, then returns to the saved zoom ladder after a manual zoom", () => {
    vi.useFakeTimers();
    vi.stubGlobal("location", { href: "http://localhost/?agent=probe" });
    let stored: unknown = null;
    const fake = fakeDisplay(snapshot({ surface: { x: 0, y: 0, width: 3840, height: 2160 } }));
    installZoomPan({
      flags: { "qol.zoomPan": true },
      prefs: { get: () => stored, set: (value: unknown) => { stored = value; } },
      display: fake.display,
    });

    fake.key(fakeKey("5", { ctrlKey: false }));
    activateHud({ flags: { "qol.zoomPan": true }, display: fake.display });
    expect(fake.setGrid).toHaveBeenLastCalledWith(expect.objectContaining({ cellHeight: 72 }));
    expect(fake.setSidebarExtent).toHaveBeenLastCalledWith({ columns: 12, topRows: 1 });

    fake.key(fakeKey("+"));
    expect(fake.setGrid).toHaveBeenLastCalledWith(expect.objectContaining({ cellHeight: 32 }));
    expect(readDisplayPreference(stored).zoomIndex).toBe(8);
  });

  it("applies the first Ctrl-= and Ctrl-Arrow instead of spending them on activation", () => {
    vi.useFakeTimers();
    /* Past the title/birth boundary already, same as the Ctrl-Wheel test
     * below - a Ctrl-zoom/Ctrl-pan shortcut still on the title screen must not
     * activate the responsive grid under the still-letterboxed title art. */
    vi.stubGlobal("location", { href: "http://localhost/?agent=probe" });
    let stored: unknown = null;
    const zoom = fakeDisplay();
    installZoomPan({
      flags: { "qol.zoomPan": true },
      prefs: { get: () => stored, set: (value: unknown) => { stored = value; } },
      display: zoom.display,
    });

    const zoomEvent = fakeKey("=");
    zoom.key(zoomEvent);
    expect(zoomEvent.preventDefault).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(0);
    expect(zoom.setGrid).toHaveBeenLastCalledWith(expect.objectContaining({ cellHeight: 32 }));
    expect(readDisplayPreference(stored).zoomIndex).toBe(8);

    uninstallZoomPan();
    const pan = fakeDisplay();
    installZoomPan({ flags: { "qol.zoomPan": true }, display: pan.display });
    const panEvent = fakeKey("ArrowRight");
    pan.key(panEvent);
    expect(panEvent.preventDefault).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(0);
    expect(pan.setCamera).toHaveBeenLastCalledWith({ x: 22, y: 10 });
  });

  it("applies the first pointer-targeted Ctrl-Wheel after grid activation", () => {
    vi.useFakeTimers();
    const fakeWindow = new EventTarget() as EventTarget & { innerWidth: number; innerHeight: number };
    fakeWindow.innerWidth = 1200;
    fakeWindow.innerHeight = 800;
    const canvas = { style: {} };
    const body = { style: {}, setAttribute: vi.fn() };
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("document", {
      body,
      documentElement: { style: {} },
      querySelector: () => canvas,
    });
    vi.stubGlobal("location", { href: "http://localhost/?agent=probe" });

    let stored: unknown = null;
    const fake = fakeDisplay();
    installZoomPan({
      flags: { "qol.zoomPan": true },
      prefs: { get: () => stored, set: (value: unknown) => { stored = value; } },
      display: fake.display,
    });
    const event = new Event("wheel", { cancelable: true });
    Object.defineProperties(event, {
      ctrlKey: { value: true },
      deltaY: { value: 120 },
      clientX: { value: 800 },
      clientY: { value: 500 },
    });
    fakeWindow.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    vi.advanceTimersByTime(0);

    expect(fake.setGrid).toHaveBeenLastCalledWith(expect.objectContaining({ cellHeight: 24 }));
    expect(readDisplayPreference(stored).zoomIndex).toBe(6);
  });

  it("no longer tracks the title/birth boundary on a raw window listener", () => {
    const fakeWindow = new EventTarget() as EventTarget & { innerWidth: number; innerHeight: number };
    fakeWindow.innerWidth = 1200;
    fakeWindow.innerHeight = 800;
    const body = { style: {}, setAttribute: vi.fn() };
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("document", {
      body,
      documentElement: { style: {} },
      querySelector: () => null,
    });

    const fake = fakeDisplay();
    installZoomPan({ flags: { "qol.zoomPan": true }, display: fake.display });
    body.setAttribute.mockClear(); // drop the "title" mark installZoomPan makes on the way up

    /* Dispatched straight on window, bypassing the fake display's onKey
     * entirely - exactly the channel the old raw `window.addEventListener`
     * listened on, and exactly how a key typed into an open mod panel's own
     * <input> used to reach this tracker too (a raw window listener sees
     * every keydown, panel-owned ones included). If the boundary tracker
     * ever goes back to listening on window directly, this event reaches it
     * again and the assertion below catches it. */
    const event = new Event("keydown");
    Object.defineProperty(event, "key", { value: "n" });
    fakeWindow.dispatchEvent(event);
    expect(body.setAttribute).not.toHaveBeenCalled();
  });

  it("leaves the title fitted, then applies the persisted grid at the first HUD", () => {
    vi.useFakeTimers();
    /* installTitleBoundary only installs when window is defined - stub a
     * minimal one (same shape as the Ctrl-Wheel test above) so the "l" key
     * below drives the real title/birth boundary tracker instead of being a
     * no-op, rather than pre-seeding bootPhase via the URL the way the other
     * tests in this block do. That is what lets this test show both halves:
     * still-title leaves the grid fitted, and only past the boundary does an
     * ordinary key enable it. */
    const fakeWindow = new EventTarget() as EventTarget & { innerWidth: number; innerHeight: number };
    fakeWindow.innerWidth = 1200;
    fakeWindow.innerHeight = 800;
    const body = { style: {}, setAttribute: vi.fn() };
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("document", {
      body,
      documentElement: { style: {} },
      querySelector: () => null,
    });
    const fake = fakeDisplay();
    let stored: unknown = {
      v: 2,
      display: { v: 1, zoomIndex: 3, interfaceZoomIndex: 1, mapDetail: 0 },
    };
    const ctx = {
      flags: { "qol.zoomPan": true, "qol.sharpenZoomedTiles": false },
      prefs: { get: () => stored, set: (value: unknown) => { stored = value; } },
      display: fake.display,
    };
    installZoomPan(ctx);
    expect(fake.setGrid).not.toHaveBeenCalled();
    zoomPanHud(ctx)?.sidebar?.present(
      { entries: [], region: { pixels: { x: 0, y: 0, width: 320, height: 480 } } },
      { layout: "left" },
    );
    vi.advanceTimersByTime(0);
    expect(fake.setGrid).not.toHaveBeenCalled();
    /* Crosses the title/birth boundary the same way a player loading an
     * existing character would (installTitleBoundary's own "l" handling) -
     * only past that point may an ordinary key enable gameplay reflow. */
    fake.key(fakeKey("l", { ctrlKey: false }));
    fake.key(fakeKey("5", { ctrlKey: false }));
    activateHud(ctx);
    expect(fake.setGrid).toHaveBeenLastCalledWith({
      cellHeight: 28,
      minCols: 20,
      minRows: 12,
      snapViewportToEven: true,
    });

    const event = fakeKey("+");
    fake.key(event);
    expect(fake.setCamera).toHaveBeenCalledWith(null);
    expect(fake.setGrid).toHaveBeenLastCalledWith(expect.objectContaining({ cellHeight: 32 }));
    expect(readDisplayPreference(stored).zoomIndex).toBe(8);
    expect(event.preventDefault).toHaveBeenCalledOnce();

    fake.key(fakeKey("C", { ctrlKey: false }));
    vi.advanceTimersByTime(0);
    expect(fake.setGrid).toHaveBeenLastCalledWith(null);
  });

  it("targets the sidebar with Shift and pans a map in two-cell steps", () => {
    vi.useFakeTimers();
    vi.stubGlobal("location", { href: "http://localhost/?agent=probe" });
    const fake = fakeDisplay(snapshot({ mode: "map" }));
    let stored: unknown = null;
    const ctx = {
      flags: { "qol.zoomPan": true },
      prefs: { get: () => stored, set: (value: unknown) => { stored = value; } },
      display: fake.display,
      state: { actor: { grid: { x: 60, y: 30 } } },
    };
    installZoomPan(ctx);
    fake.key(fakeKey("5", { ctrlKey: false }));
    activateHud(ctx);

    fake.key(fakeKey("+", { shiftKey: true }));
    expect(fake.setSidebarExtent).toHaveBeenLastCalledWith({ columns: 15, topRows: 2 });

    fake.key(fakeKey("ArrowRight"));
    expect(fake.setMapView).toHaveBeenCalledWith(expect.objectContaining({
      origin: expect.objectContaining({ x: expect.any(Number) }),
    }));
    const last = fake.setMapView.mock.calls.at(-1)?.[0] as { origin: { x: number; y: number } };
    expect(last.origin.x % 2).toBe(0);
    expect(last.origin.y % 2).toBe(0);
  });

  it("ignores an ordinary key, a Ctrl-zoom shortcut and a Ctrl-wheel while still on the title screen", () => {
    vi.useFakeTimers();
    const fakeWindow = new EventTarget() as EventTarget & { innerWidth: number; innerHeight: number };
    fakeWindow.innerWidth = 1200;
    fakeWindow.innerHeight = 800;
    const body = { style: {}, setAttribute: vi.fn() };
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("document", {
      body,
      documentElement: { style: {} },
      querySelector: () => null,
    });
    const fake = fakeDisplay();
    installZoomPan({ flags: { "qol.zoomPan": true }, display: fake.display });

    /* A bare Alt press: the title screen's own reported shrink-to-a-corner
     * bug, since a modifier-only keydown still reached installKeyboard's
     * generic fallback before bootPhase ever left "title". */
    fake.key(fakeKey("Alt", { ctrlKey: false, altKey: true }));
    vi.advanceTimersByTime(0);
    expect(fake.setGrid).not.toHaveBeenCalled();

    const zoomEvent = fakeKey("=");
    fake.key(zoomEvent);
    vi.advanceTimersByTime(0);
    expect(zoomEvent.preventDefault).not.toHaveBeenCalled();
    expect(fake.setGrid).not.toHaveBeenCalled();

    const wheelEvent = new Event("wheel", { cancelable: true });
    Object.defineProperties(wheelEvent, {
      ctrlKey: { value: true },
      deltaY: { value: 120 },
      clientX: { value: 10 },
      clientY: { value: 10 },
    });
    fakeWindow.dispatchEvent(wheelEvent);
    vi.advanceTimersByTime(0);
    expect(wheelEvent.defaultPrevented).toBe(false);
    expect(fake.setGrid).not.toHaveBeenCalled();
  });

  it("uses sharpened zoomed graphics for crisp tiles and the full-detail map path", () => {
    const fake = fakeDisplay();
    installZoomPan({
      flags: { "qol.zoomPan": false, "qol.sharpenZoomedTiles": true },
      display: fake.display,
    });
    expect(fake.setTileScaling).toHaveBeenCalledWith("crisp");
    expect(fake.setFullMapOverview).toHaveBeenCalledWith(true);
    expect(fake.setGrid).not.toHaveBeenCalled();
    uninstallZoomPan();
    expect(fake.setFullMapOverview).toHaveBeenLastCalledWith(false);
  });

  it("enlarges the responsive grid without requiring ordinary zoom and pan", () => {
    vi.useFakeTimers();
    vi.stubGlobal("location", { href: "http://localhost/?agent=probe" });
    const fake = fakeDisplay();
    const ctx = {
      flags: { "qol.zoomPan": false, "qol.accessibilityZoom": true },
      display: fake.display,
    };
    installZoomPan(ctx);
    fake.key(fakeKey("5", { ctrlKey: false }));
    activateHud(ctx);
    expect(fake.setGrid).toHaveBeenLastCalledWith(expect.objectContaining({
      cellHeight: PLAY_ZOOM_CELL_HEIGHTS[ACCESSIBILITY_ZOOM_INDEX],
    }));
  });
});
