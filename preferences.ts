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
  readonly v: 2;
  readonly zoomIndex: number;
  readonly interfaceZoomIndex: number;
  readonly mapDetail: number;
}

/** The one character's first-encounter notebook that ctx.prefs can retain. */
export interface FirstEncounterPreference {
  readonly characterKey: string;
  readonly monsters: readonly number[];
  readonly artifacts: readonly number[];
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
  /** First-encounter alerts are per character within the one install-wide
   * preference slot. */
  readonly firstEncounter?: FirstEncounterPreference;
}

export const DEFAULT_DISPLAY_PREFERENCE: DisplayPreference = {
  v: 2,
  /* 28px was rung 3 in the former 16-48px ladder.  Keep that familiar
   * default after adding smaller and larger manual zoom steps. */
  zoomIndex: 7,
  interfaceZoomIndex: 1,
  mapDetail: 0,
};

function finiteInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

const LEGACY_PLAY_ZOOM_INDEX_TO_CURRENT = [4, 5, 6, 7, 8, 9, 10, 11] as const;

function storedDisplayPreference(raw: unknown): DisplayPreference | null {
  if (!isRecord(raw) || raw.v !== 2 || !isRecord(raw.display)) return null;
  const candidate = raw.display;
  const legacy = candidate.v === 1;
  if (!legacy && candidate.v !== 2) return null;
  const legacyIndex = finiteInteger(candidate.zoomIndex, 3, 0, 7);
  return {
    v: 2,
    zoomIndex: legacy
      ? LEGACY_PLAY_ZOOM_INDEX_TO_CURRENT[legacyIndex] ?? DEFAULT_DISPLAY_PREFERENCE.zoomIndex
      : finiteInteger(candidate.zoomIndex, DEFAULT_DISPLAY_PREFERENCE.zoomIndex, 0, 14),
    interfaceZoomIndex: finiteInteger(
      candidate.interfaceZoomIndex,
      DEFAULT_DISPLAY_PREFERENCE.interfaceZoomIndex,
      0,
      3,
    ),
    mapDetail: finiteInteger(candidate.mapDetail, DEFAULT_DISPLAY_PREFERENCE.mapDetail, 0, 3),
  };
}

function storedRememberedSettings(raw: unknown): RememberedSettings | null {
  if (!isRecord(raw)) return null;
  const candidate = raw.v === 2 ? raw.options : raw.v === 1 ? raw : undefined;
  return isRecord(candidate) && candidate.v === 1 && isRecord(candidate.values)
    ? candidate as unknown as RememberedSettings
    : null;
}

/** Read a v2 notebook field, or the v1 top-level notebook this feature used
 * before all preferences shared one envelope. */
export function readFirstEncounterPreference(raw: unknown): FirstEncounterPreference | null {
  if (!isRecord(raw)) return null;
  const candidate = raw.v === 2 ? raw.firstEncounter : raw.v === 1 ? raw : undefined;
  if (
    !isRecord(candidate) ||
    typeof candidate.characterKey !== "string" ||
    !Array.isArray(candidate.monsters) ||
    !Array.isArray(candidate.artifacts)
  ) {
    return null;
  }
  return {
    characterKey: candidate.characterKey,
    monsters: candidate.monsters.filter((value): value is number => typeof value === "number"),
    artifacts: candidate.artifacts.filter((value): value is number => typeof value === "number"),
  };
}

/** Preserve every known preference group while upgrading either former v1
 * top-level shape into the shared v2 envelope. */
function preservedPreferences(raw: unknown): Omit<QolPreferences, "v"> {
  const options = storedRememberedSettings(raw);
  const display = storedDisplayPreference(raw);
  const firstEncounter = readFirstEncounterPreference(raw);
  const hideRepeatShortcuts = isRecord(raw) && raw.v === 2 && raw.hideRepeatShortcuts === true;
  return {
    ...(options ? { options } : {}),
    ...(display ? { display } : {}),
    ...(hideRepeatShortcuts ? { hideRepeatShortcuts } : {}),
    ...(firstEncounter ? { firstEncounter } : {}),
  };
}

export function readDisplayPreference(raw: unknown): DisplayPreference {
  return storedDisplayPreference(raw) ?? DEFAULT_DISPLAY_PREFERENCE;
}

/** Read both the current wrapper and the 1.0.0 direct options shape. */
export function readRememberedSettings(raw: unknown): RememberedSettings | null {
  return storedRememberedSettings(raw);
}

export function withDisplayPreference(raw: unknown, display: DisplayPreference): QolPreferences {
  return { v: 2, ...preservedPreferences(raw), display };
}

export function withRememberedSettings(raw: unknown, options: RememberedSettings): QolPreferences {
  return { v: 2, ...preservedPreferences(raw), options };
}

/** Whether the player has permanently dismissed the repeated-action
 * shortcuts card. False for anything that is not a v2 envelope. */
export function readHideRepeatShortcuts(raw: unknown): boolean {
  return isRecord(raw) && raw.v === 2 && raw.hideRepeatShortcuts === true;
}

export function withHideRepeatShortcuts(raw: unknown, hidden: boolean): QolPreferences {
  return { v: 2, ...preservedPreferences(raw), hideRepeatShortcuts: hidden };
}

export function withFirstEncounterPreference(
  raw: unknown,
  firstEncounter: FirstEncounterPreference,
): QolPreferences {
  return { v: 2, ...preservedPreferences(raw), firstEncounter };
}
