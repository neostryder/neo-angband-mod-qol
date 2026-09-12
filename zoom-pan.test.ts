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
  PLAY_ZOOM_CELL_HEIGHTS,
  mapViewFor,
  pannedOrigin,
  pinchDirection,
  sidebarPagePlan,
  sidebarRowGap,
  snapEven,
  stepIndex,
  uninstallZoomPan,
  zoomPanHud,
  type DisplayLike,
  type DisplaySnapshotLike,
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
  vi.runAllTimers();
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
      v: 1,
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
    })).toEqual({ ...DEFAULT_DISPLAY_PREFERENCE, zoomIndex: 7, interfaceZoomIndex: 0 });
    expect(readDisplayPreference({ v: 99 })).toEqual(DEFAULT_DISPLAY_PREFERENCE);
  });
});

describe("whole-cell zoom and pan arithmetic", () => {
  it("steps within a finite zoom ladder and snaps to even cells", () => {
    expect(stepIndex(0, -1, 7)).toBe(0);
    expect(stepIndex(3, 1, 7)).toBe(4);
    expect(stepIndex(7, 1, 7)).toBe(7);
    expect(snapEven(5)).toBe(6);
    expect(snapEven(-3)).toBe(-2);
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
    vi.runAllTimers();
    expect(zoom.setGrid).toHaveBeenLastCalledWith(expect.objectContaining({ cellHeight: 32 }));
    expect(readDisplayPreference(stored).zoomIndex).toBe(4);

    uninstallZoomPan();
    const pan = fakeDisplay();
    installZoomPan({ flags: { "qol.zoomPan": true }, display: pan.display });
    const panEvent = fakeKey("ArrowRight");
    pan.key(panEvent);
    expect(panEvent.preventDefault).toHaveBeenCalledOnce();
    vi.runAllTimers();
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
    vi.runAllTimers();

    expect(fake.setGrid).toHaveBeenLastCalledWith(expect.objectContaining({ cellHeight: 24 }));
    expect(readDisplayPreference(stored).zoomIndex).toBe(2);
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
    vi.runAllTimers();
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
    expect(readDisplayPreference(stored).zoomIndex).toBe(4);
    expect(event.preventDefault).toHaveBeenCalledOnce();

    fake.key(fakeKey("C", { ctrlKey: false }));
    vi.runAllTimers();
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
    expect(fake.setSidebarExtent).toHaveBeenLastCalledWith({ columns: 16, topRows: 2 });

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
    vi.runAllTimers();
    expect(fake.setGrid).not.toHaveBeenCalled();

    const zoomEvent = fakeKey("=");
    fake.key(zoomEvent);
    vi.runAllTimers();
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
    vi.runAllTimers();
    expect(wheelEvent.defaultPrevented).toBe(false);
    expect(fake.setGrid).not.toHaveBeenCalled();
  });

  it("keeps crisp tile sampling independent from zoom enablement", () => {
    const fake = fakeDisplay();
    installZoomPan({
      flags: { "qol.zoomPan": false, "qol.sharpenZoomedTiles": true },
      display: fake.display,
    });
    expect(fake.setTileScaling).toHaveBeenCalledWith("crisp");
    expect(fake.setGrid).not.toHaveBeenCalled();
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
