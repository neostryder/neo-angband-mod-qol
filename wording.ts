/**
 * Clearer wording for a few of upstream Angband 4.2.6's own messages, applied at
 * the host's message sink when "Misc. niceties" is on. Keys are upstream's text
 * verbatim, as the finished message reaches the sink; anything not listed passes
 * through unchanged. Every row restates its message without changing what it
 * means. TEXT_CHANGES.md lists every row with its upstream source line.
 */
export const UPSTREAM_MESSAGE_WORDING: Readonly<Record<string, string>> = {
  /* cmd-cave.c, ordering an immobile monster to move (command monster). */
  "The monster can not move.": "The monster cannot move.",
};

/** The same rows as the host's `messageText` policy table: exact match, in order. */
export const UPSTREAM_MESSAGE_RULES: readonly { readonly find: string; readonly replace: string }[] =
  Object.entries(UPSTREAM_MESSAGE_WORDING).map(([find, replace]) => ({ find, replace }));

/** The wording rule as a plain function: upstream's text in, the reworded text out. */
export function upstreamWordingFix(text: string): string {
  return UPSTREAM_MESSAGE_WORDING[text] ?? text;
}
