/**
 * "Purge queued input" (qol.purgeQueuedInput): a dedicated key that sends
 * Escape for you, gated so holding it down cannot spam cancels
 * (neo-angband#35).
 *
 * WHAT THIS DOES NOT DO, AND WHY. Neither this mod nor any mod can reach a
 * literal queue to clear. The host's packages/web/src/input-door.ts owns the
 * one real array of pending input (enqueueUiInputs / clearQueuedUiInputs, for
 * keymap macro expansions), and it stays inside the host - never exposed
 * through ModPluginContext. Ordinary movement is not queued at all: the host
 * drains a keydown synchronously, one command per task. Binding this trigger
 * through ctx.keymaps the way repeat-shortcuts.ts binds its own would not help
 * either: a keydown that matches a bound keymap trigger is fully consumed by
 * the host's own resolver before a mod's ctx.display.onKey ever sees it - and
 * before the host's own key-repeat classification does too, so ctx.keyRepeat
 * would never update for a bound trigger's keydown at all. Binding this
 * trigger would make it both un-observable and un-gateable in the same step,
 * which is why this claims the key without ever calling keymaps.bind on it.
 *
 * WHAT THIS DOES INSTEAD. It confirms the trigger is free with the same
 * isBindableTriggerKey query repeat-shortcuts.ts's own binding already uses,
 * then listens for it raw through ctx.display.onKey - the display key-listener seam. On a qualifying press it sends Escape itself: the same key
 * already available to a player, offered on its own dedicated trigger so one
 * action can back out of several stacked menus or prompts, instead of
 * clearing a backlog of them one Escape at a time.
 *
 * WHY ctx.keyRepeat GATES IT. An OS auto-repeat continuation of a held
 * trigger key would otherwise resend Escape on every repeat tick for as long
 * as the key stayed down - not a purge, just noise, and exactly the
 * "surprising" side effect #35 warns a purge must not cause while a key is
 * still genuinely held. ctx.keyRepeat()'s verdict on the trigger's own
 * keydown tells that continuation apart from a fresh press: only a keydown
 * that is NOT a continuation of one already held is honoured, so a
 * deliberate burst of separate presses - the actual "distinct queued
 * keypresses" case #35 asks a purge to clear - sends Escape every time, and
 * an accidental long hold sends it once.
 */

/** The minimal shape `shouldPurgeOnTrigger` needs from a key-repeat verdict. */
export interface KeyRepeatVerdictLike {
  readonly isRepeat: boolean;
}

/**
 * Whether pressing the purge trigger right now should actually send Escape.
 *
 * `verdict` is the host's own judgement on the trigger's own keydown -
 * `null`/`undefined` (an older host, or no keydown classified yet this
 * session) is treated as a fresh press, since there is nothing on record
 * suggesting otherwise. A verdict that says this keydown IS a repeat - the
 * browser's own auto-repeat while a key stays held, or a same-key gap tight
 * enough to be indistinguishable from one (key-repeat.ts) - declines: the
 * player has not let go, so purging again now would be the surprising case
 * neo-angband#35 calls out, not the burst-of-distinct-presses case it asks
 * for.
 */
export function shouldPurgeOnTrigger(verdict: KeyRepeatVerdictLike | null | undefined): boolean {
  return !verdict?.isRepeat;
}

interface KeymapsLike {
  isBindableTriggerKey(trigger: string): boolean;
}

interface DisplayLike {
  onKey(listener: (event: KeyboardEvent) => void): () => void;
}

export interface PurgeQueuedInputContext {
  readonly display?: DisplayLike;
  readonly keymaps?: KeymapsLike;
  readonly keyRepeat?: () => KeyRepeatVerdictLike | null;
  readonly log?: (message: string) => void;
  /**
   * Overridable for tests. Defaults to a real Escape keypress dispatched
   * into the page itself - the same synthetic-KeyboardEvent technique this
   * game's own CLAUDE.md documents for driving it without a real keyboard.
   */
  readonly sendEscape?: () => void;
}

/** The key this feature claims when it is free. Named here, and in its own
 * rule description, so a player knows which key to look for without opening
 * the game's own keymap editor. */
export const PURGE_TRIGGER = "F2";

/**
 * How many Escapes one purge sends - enough to back out of a few stacked
 * menus or prompts in the one action #35 asks for, not so many that an
 * ordinary press at the top level (where Escape already does nothing) reads
 * as more than one harmless keypress.
 */
export const PURGE_ESCAPE_COUNT = 3;

function realSendEscape(): void {
  if (typeof window === "undefined") return;
  for (let i = 0; i < PURGE_ESCAPE_COUNT; i++) {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  }
}

let cleanup: (() => void) | null = null;

/**
 * Claim `PURGE_TRIGGER` and start gating it. Declines gracefully - logs and
 * claims nothing - on a host too old for `ctx.display`/`ctx.keymaps`, or when
 * the player or another mod already owns the trigger key.
 */
export function installPurgeQueuedInput(ctx: PurgeQueuedInputContext): void {
  uninstallPurgeQueuedInput();
  if (!ctx.display || !ctx.keymaps) {
    ctx.log?.("this game is too old for purging queued input");
    return;
  }
  if (!ctx.keymaps.isBindableTriggerKey(PURGE_TRIGGER)) {
    ctx.log?.(`purge queued input: ${PURGE_TRIGGER} is already bound to something else; no key claimed`);
    return;
  }
  const sendEscape = ctx.sendEscape ?? realSendEscape;
  cleanup = ctx.display.onKey((event) => {
    if (event.key !== PURGE_TRIGGER || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    /* Claimed outright either way: F2 has no vanilla meaning, so letting an
     * unwanted repeat fall through to the shell would only risk some
     * "unhandled key" fallback rather than doing anything useful. */
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!shouldPurgeOnTrigger(ctx.keyRepeat?.() ?? null)) return;
    sendEscape();
  });
}

/** Release the trigger and undo the interception; called on mod teardown. */
export function uninstallPurgeQueuedInput(): void {
  cleanup?.();
  cleanup = null;
}
