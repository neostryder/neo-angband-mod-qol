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
  if (!isRecord(candidate) || candidate.v !== 1 || !isRecord(candidate.values)) return null;
  /* Only the fields this mod owns come forward; anything else a past version wrote is dropped. */
  const { values, hitpointWarn, delayFactor, lazymoveDelay } = candidate;
  return { v: 1, values, hitpointWarn, delayFactor, lazymoveDelay } as unknown as RememberedSettings;
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

/** The version of the shape `store.prefs` holds now (the host's migration counter, not the `v` inside). */
export const PREFS_VERSION = 1;

/**
 * Bring a value stored before the host versioned preferences (version 0) up to
 * the current envelope. Those blobs are the 1.0 direct options shape or the
 * `{ v: 2 }` envelope; both read back through the same helper, and anything
 * else is dropped rather than guessed at.
 */
export function migratePreferences(value: unknown, fromVersion: number): QolPreferences | null {
  if (fromVersion >= PREFS_VERSION) return isRecord(value) && value.v === 2 ? (value as unknown as QolPreferences) : null;
  const kept = preservedPreferences(value);
  return Object.keys(kept).length > 0 ? { v: 2, ...kept } : null;
}
