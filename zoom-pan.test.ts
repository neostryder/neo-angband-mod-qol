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
  mapViewFor,
  pannedOrigin,
  pinchDirection,
  snapEven,
  stepIndex,
  uninstallZoomPan,
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
      repaint: vi.fn(),
    },
    key: (event) => listener?.(event),
    setGrid,
    setCamera,
    setMapView,
    setSidebarExtent,
    setTileScaling,
  };
}

afterEach(() => uninstallZoomPan());

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

describe("input integration", () => {
  it("applies the persisted grid and handles Ctrl+plus as play zoom", () => {
    const fake = fakeDisplay();
    let stored: unknown = {
      v: 2,
      display: { v: 1, zoomIndex: 3, interfaceZoomIndex: 1, mapDetail: 0 },
    };
    installZoomPan({
      flags: { "qol.zoomPan": true, "qol.sharpenZoomedTiles": false },
      prefs: { get: () => stored, set: (value) => { stored = value; } },
      display: fake.display,
    });
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
  });

  it("targets the sidebar with Shift and pans a map in two-cell steps", () => {
    const fake = fakeDisplay(snapshot({ mode: "map" }));
    let stored: unknown = null;
    installZoomPan({
      flags: { "qol.zoomPan": true },
      prefs: { get: () => stored, set: (value) => { stored = value; } },
      display: fake.display,
      state: { actor: { grid: { x: 60, y: 30 } } },
    });

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
});
