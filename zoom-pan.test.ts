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
  let listener: ((event: KeyboardEvent) => void) | null = null;
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
        listener = next;
        return () => {
          listener = null;
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
    key: (event) => listener?.(event),
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

describe("input integration", () => {
  it("applies the first Ctrl-= and Ctrl-Arrow instead of spending them on activation", () => {
    vi.useFakeTimers();
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

  it("leaves the title fitted, then applies the persisted grid at the first HUD", () => {
    vi.useFakeTimers();
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
