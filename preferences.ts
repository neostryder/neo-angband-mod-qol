/** Character-option choices remembered for the next new character. */
export interface RememberedSettings {
  readonly v: 1;
  readonly values: Record<string, boolean>;
  readonly hitpointWarn: number;
  readonly delayFactor: number;
  readonly lazymoveDelay: number;
}

/** One install-wide display preference for this device. */
export interface DisplayPreference {
  readonly v: 1;
  readonly zoomIndex: number;
  readonly interfaceZoomIndex: number;
  readonly mapDetail: number;
}

/** The single value kept in ctx.prefs. */
export interface QolPreferences {
  readonly v: 2;
  readonly options?: RememberedSettings;
  readonly display?: DisplayPreference;
  /** Set once the player asks never to see the repeated-action shortcuts
   * card again (#198). Absent/false means still offered; there is no
   * separate per-character reset, since this is a deliberate permanent
   * opt-out rather than a one-time introduction like first-encounter's own
   * notebook. */
  readonly hideRepeatShortcuts?: boolean;
}

export const DEFAULT_DISPLAY_PREFERENCE: DisplayPreference = {
  v: 1,
  zoomIndex: 3,
  interfaceZoomIndex: 1,
  mapDetail: 0,
};

function finiteInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

export function readDisplayPreference(raw: unknown): DisplayPreference {
  if (!raw || typeof raw !== "object") return DEFAULT_DISPLAY_PREFERENCE;
  const top = raw as Partial<QolPreferences>;
  const candidate = top.v === 2 ? top.display : undefined;
  if (!candidate || candidate.v !== 1) return DEFAULT_DISPLAY_PREFERENCE;
  return {
    v: 1,
    zoomIndex: finiteInteger(candidate.zoomIndex, DEFAULT_DISPLAY_PREFERENCE.zoomIndex, 0, 7),
    interfaceZoomIndex: finiteInteger(
      candidate.interfaceZoomIndex,
      DEFAULT_DISPLAY_PREFERENCE.interfaceZoomIndex,
      0,
      3,
    ),
    mapDetail: finiteInteger(candidate.mapDetail, DEFAULT_DISPLAY_PREFERENCE.mapDetail, 0, 3),
  };
}

/** Read both the current wrapper and the 1.0.0 direct options shape. */
export function readRememberedSettings(raw: unknown): RememberedSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const top = raw as { readonly v?: unknown; readonly options?: RememberedSettings };
  const candidate = top.v === 2
    ? top.options
    : top.v === 1
      ? raw as RememberedSettings
      : undefined;
  return candidate?.v === 1 ? candidate : null;
}

export function withDisplayPreference(raw: unknown, display: DisplayPreference): QolPreferences {
  const options = readRememberedSettings(raw);
  return { v: 2, ...(options ? { options } : {}), display };
}

export function withRememberedSettings(raw: unknown, options: RememberedSettings): QolPreferences {
  const display = readDisplayPreference(raw);
  return { v: 2, options, display };
}

/** Whether the player has permanently dismissed the repeated-action
 * shortcuts card. False for anything that is not a v2 envelope. */
export function readHideRepeatShortcuts(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const top = raw as Partial<QolPreferences>;
  return top.v === 2 && top.hideRepeatShortcuts === true;
}

export function withHideRepeatShortcuts(raw: unknown, hidden: boolean): QolPreferences {
  const options = readRememberedSettings(raw);
  const display = readDisplayPreference(raw);
  return { v: 2, ...(options ? { options } : {}), display, hideRepeatShortcuts: hidden };
}
