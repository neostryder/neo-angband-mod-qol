import { describe, expect, it, vi } from "vitest";
import {
  installPurgeQueuedInput,
  PURGE_ESCAPE_COUNT,
  PURGE_TRIGGER,
  shouldPurgeOnTrigger,
  uninstallPurgeQueuedInput,
  type PurgeQueuedInputContext,
} from "./purge-queued-input";

function fakeKey(key: string, extra: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    ...extra,
  } as unknown as KeyboardEvent;
}

/** A fake `ctx.display` that hands back a way to fire the registered listener. */
function fakeDisplay(): {
  onKey: NonNullable<PurgeQueuedInputContext["display"]>;
  fire(event: KeyboardEvent): void;
} {
  let listener: ((event: KeyboardEvent) => void) | null = null;
  return {
    onKey: {
      onKey: (next) => {
        listener = next;
        return () => {
          if (listener === next) listener = null;
        };
      },
    },
    fire: (event) => listener?.(event),
  };
}

describe("shouldPurgeOnTrigger", () => {
  it("declines a genuine key-repeat continuation", () => {
    expect(shouldPurgeOnTrigger({ isRepeat: true })).toBe(false);
  });

  it("proceeds for a fresh, distinct press", () => {
    expect(shouldPurgeOnTrigger({ isRepeat: false })).toBe(true);
  });

  it("proceeds when there is no verdict yet (an older host, or nothing classified this session)", () => {
    expect(shouldPurgeOnTrigger(null)).toBe(true);
    expect(shouldPurgeOnTrigger(undefined)).toBe(true);
  });
});

describe("installPurgeQueuedInput", () => {
  it("declines on a host too old for ctx.display/ctx.keymaps", () => {
    const log = vi.fn();
    expect(() => installPurgeQueuedInput({ log })).not.toThrow();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("too old"));
  });

  it("claims nothing when the trigger is already bound to something else", () => {
    const log = vi.fn();
    const sendEscape = vi.fn();
    const { onKey } = fakeDisplay();
    installPurgeQueuedInput({
      display: onKey,
      keymaps: { isBindableTriggerKey: () => false },
      log,
      sendEscape,
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining(PURGE_TRIGGER));
  });

  it("a genuine key-repeat sequence does not trigger an unwanted purge", () => {
    const sendEscape = vi.fn();
    const { onKey, fire } = fakeDisplay();
    installPurgeQueuedInput({
      display: onKey,
      keymaps: { isBindableTriggerKey: () => true },
      keyRepeat: () => ({ isRepeat: true }),
      sendEscape,
    });
    /* A held trigger keeps sending repeat keydowns; none of them should purge. */
    const first = fakeKey(PURGE_TRIGGER);
    const second = fakeKey(PURGE_TRIGGER);
    fire(first);
    fire(second);
    expect(sendEscape).not.toHaveBeenCalled();
    /* Still claimed outright, so a repeat never falls through to the shell either. */
    expect(first.preventDefault).toHaveBeenCalledOnce();
    expect(second.preventDefault).toHaveBeenCalledOnce();
  });

  it("a distinct burst of queued keypresses can be purged via the new action, every time", () => {
    const sendEscape = vi.fn();
    const { onKey, fire } = fakeDisplay();
    installPurgeQueuedInput({
      display: onKey,
      keymaps: { isBindableTriggerKey: () => true },
      keyRepeat: () => ({ isRepeat: false }),
      sendEscape,
    });
    /* Three separate, deliberate presses - not a hold - each purges on its own. */
    fire(fakeKey(PURGE_TRIGGER));
    fire(fakeKey(PURGE_TRIGGER));
    fire(fakeKey(PURGE_TRIGGER));
    expect(sendEscape).toHaveBeenCalledTimes(3);
  });

  it("ignores a modified press and any other key", () => {
    const sendEscape = vi.fn();
    const { onKey, fire } = fakeDisplay();
    installPurgeQueuedInput({
      display: onKey,
      keymaps: { isBindableTriggerKey: () => true },
      keyRepeat: () => ({ isRepeat: false }),
      sendEscape,
    });
    const ctrlPress = fakeKey(PURGE_TRIGGER, { ctrlKey: true });
    fire(ctrlPress);
    fire(fakeKey("F3"));
    expect(sendEscape).not.toHaveBeenCalled();
    expect(ctrlPress.preventDefault).not.toHaveBeenCalled();
  });

  it("uninstall stops the interception", () => {
    const sendEscape = vi.fn();
    const { onKey, fire } = fakeDisplay();
    installPurgeQueuedInput({
      display: onKey,
      keymaps: { isBindableTriggerKey: () => true },
      keyRepeat: () => ({ isRepeat: false }),
      sendEscape,
    });
    uninstallPurgeQueuedInput();
    fire(fakeKey(PURGE_TRIGGER));
    expect(sendEscape).not.toHaveBeenCalled();
  });
});

describe("PURGE_ESCAPE_COUNT", () => {
  it("is a small, bounded number of cancels rather than an unbounded spam", () => {
    expect(PURGE_ESCAPE_COUNT).toBeGreaterThan(0);
    expect(PURGE_ESCAPE_COUNT).toBeLessThanOrEqual(5);
  });
});
