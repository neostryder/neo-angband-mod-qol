/** Character-option choices remembered for the next new character. */
export interface RememberedSettings {
  readonly v: 1;
  readonly values: Record<string, boolean>;
  readonly hitpointWarn: number;
  readonly delayFactor: number;
  readonly lazymoveDelay: number;
}

/** The single value kept in ctx.prefs. */
export interface QolPreferences {
  readonly v: 2;
  readonly options?: RememberedSettings;
  /** Set once the player asks never to see the repeated-action shortcuts
   * card again (#198). Absent/false means still offered; there is no
   * separate per-character reset, since this is a deliberate permanent
   * opt-out rather than a one-time introduction. */
  readonly hideRepeatShortcuts?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function storedRememberedSettings(raw: unknown): RememberedSettings | null {
  if (!isRecord(raw)) return null;
  const candidate = raw.v === 2 ? raw.options : raw.v === 1 ? raw : undefined;
  return isRecord(candidate) && candidate.v === 1 && isRecord(candidate.values)
    ? candidate as unknown as RememberedSettings
    : null;
}

/** Preserve the remaining preference groups while upgrading the former v1
 * top-level options shape into the shared v2 envelope. Obsolete display data is dropped. */
function preservedPreferences(raw: unknown): Omit<QolPreferences, "v"> {
  const options = storedRememberedSettings(raw);
  const hideRepeatShortcuts = isRecord(raw) && raw.v === 2 && raw.hideRepeatShortcuts === true;
  return {
    ...(options ? { options } : {}),
    ...(hideRepeatShortcuts ? { hideRepeatShortcuts } : {}),
  };
}

/** Read both the current wrapper and the 1.0.0 direct options shape. */
export function readRememberedSettings(raw: unknown): RememberedSettings | null {
  return storedRememberedSettings(raw);
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
