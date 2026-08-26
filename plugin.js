// qol - generated from plugin.ts by neo-angband-mod-build
// (@rpgm-tools/neo-angband-mod-sdk). Edit the TypeScript source, not this file.

// plugin.ts
var PREF_ERROR_REPORT_LIMIT = 20;
function mayRemember(opts, name, cheats) {
  if (opts.isBirth(name)) return false;
  if (opts.isCheat(name) || opts.isScore(name)) return cheats;
  return true;
}
var TERM_COLS = 80;
var TERM_ROWS = 24;
var GLYPH_W = 16;
var GLYPH_H = 24;
function hoverCellAt(rect, clientX, clientY) {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const scale = Math.min(rect.width / (GLYPH_W * TERM_COLS), rect.height / (GLYPH_H * TERM_ROWS));
  const cellW = Math.max(4, Math.floor(GLYPH_W * scale));
  const cellH = Math.max(6, Math.floor(GLYPH_H * scale));
  const offsetX = Math.max(0, Math.floor((rect.width - cellW * TERM_COLS) / 2));
  const offsetY = Math.max(0, Math.floor((rect.height - cellH * TERM_ROWS) / 2));
  const col = Math.floor((clientX - rect.left - offsetX) / cellW);
  const row = Math.floor((clientY - rect.top - offsetY) / cellH);
  if (col < 0 || col >= TERM_COLS || row < 0 || row >= TERM_ROWS) return null;
  return { col, row };
}
function hoverCaveGrid(col, row, width, height) {
  if (width < 1 || height < 1) return null;
  const mapW = Math.min(TERM_COLS - 2, width);
  const mapH = Math.min(TERM_ROWS - 2, height);
  if (mapW < 1 || mapH < 1) return null;
  const bx = col - 1;
  const by = row - 1;
  if (bx < 0 || bx >= mapW || by < 0 || by >= mapH) return null;
  const x = Math.min(width - 1, Math.floor((bx + 0.5) * width / mapW));
  const y = Math.min(height - 1, Math.floor((by + 0.5) * height / mapH));
  return { x, y };
}
function hoverCardText(core, state, grid) {
  const result = core.describeLookGrid(state, grid, 0);
  const hasObject = core.knownPile(state, grid).length > 0;
  if (!result.mon && !hasObject) return null;
  return result.text;
}
var hoverCardsWired = false;
function positionHoverCard(el, clientX, clientY) {
  const GAP = 14;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let left = clientX + GAP;
  let top = clientY + GAP;
  if (left + w > vw) left = clientX - GAP - w;
  if (top + h > vh) top = clientY - GAP - h;
  el.style.left = `${String(Math.max(0, left))}px`;
  el.style.top = `${String(Math.max(0, top))}px`;
}
function buildHoverCardElement() {
  const el = document.createElement("div");
  el.setAttribute("data-qol-map-hover-card", "");
  Object.assign(el.style, {
    position: "fixed",
    zIndex: "2100",
    pointerEvents: "none",
    display: "none",
    maxWidth: "320px",
    padding: "4px 8px",
    borderRadius: "4px",
    font: "13px monospace",
    lineHeight: "1.3",
    whiteSpace: "pre-wrap",
    background: "rgba(12,12,16,0.92)",
    color: "#e8e8e8",
    border: "1px solid #666"
  });
  document.body.appendChild(el);
  return el;
}
function installMapHoverCards(ctx) {
  if (ctx.flags["qol.mapHoverCards"] !== true) return;
  if (hoverCardsWired) return;
  if (typeof document === "undefined" || typeof window === "undefined") return;
  try {
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
  } catch {
  }
  hoverCardsWired = true;
  const core = ctx.core;
  const card = buildHoverCardElement();
  let mapOpenGuess = false;
  const hide = () => {
    card.style.display = "none";
  };
  document.addEventListener("keydown", (ev) => {
    mapOpenGuess = ev.key === "M";
    if (!mapOpenGuess) hide();
  });
  window.addEventListener("pointerdown", () => {
    mapOpenGuess = false;
    hide();
  });
  document.addEventListener("pointermove", (ev) => {
    if (!mapOpenGuess) return;
    const canvas = document.getElementById("game");
    if (!canvas) {
      hide();
      return;
    }
    const cell = hoverCellAt(canvas.getBoundingClientRect(), ev.clientX, ev.clientY);
    if (!cell) {
      hide();
      return;
    }
    const state = ctx.state;
    if (!state?.chunk) {
      hide();
      return;
    }
    const grid = hoverCaveGrid(cell.col, cell.row, state.chunk.width, state.chunk.height);
    if (!grid) {
      hide();
      return;
    }
    const text = hoverCardText(core, state, grid);
    if (!text) {
      hide();
      return;
    }
    card.textContent = text;
    card.style.display = "block";
    positionHoverCard(card, ev.clientX, ev.clientY);
  });
}
var plugin_default = {
  api: 1,
  hooks(ctx) {
    const { flags, core } = ctx;
    const hooks = {};
    if (flags["qol.autoDig"] === true) {
      hooks.walkBlockedByDiggable = (state, grid, deps) => {
        if (!core.movementTunnelTest(state, grid)) return null;
        core.tunnelAux(state, grid, deps);
        return state.z.moveEnergy;
      };
    }
    if (flags["qol.forgivingPrefFiles"] === true) {
      const setPolicy = core.setPrefErrorPolicy;
      if (typeof setPolicy !== "function") {
        ctx.log?.("this game is too old to keep reading a pref file past a mistake");
      } else {
        setPolicy({
          continueAfterError: true,
          reportLimit: PREF_ERROR_REPORT_LIMIT
        });
      }
    }
    if (flags["qol.rememberSettings"] === true) {
      const prefs = ctx.prefs;
      if (!prefs) {
        ctx.log?.("this game is too old to remember settings (no ctx.prefs)");
      } else {
        const classifier = new core.OptionState();
        const cheats = flags["qol.rememberCheats"] === true;
        hooks.optionsChanged = (snapshot) => {
          const values = {};
          for (const [name, value] of Object.entries(snapshot.values)) {
            if (mayRemember(classifier, name, cheats)) values[name] = value;
          }
          const remembered = {
            v: 1,
            values,
            hitpointWarn: snapshot.hitpointWarn,
            delayFactor: snapshot.delayFactor,
            lazymoveDelay: snapshot.lazymoveDelay
          };
          prefs.set(remembered);
        };
      }
    }
    return hooks;
  },
  /*
   * "Remember my settings", the APPLY half.
   *
   * register() rather than hooks(), for one reason: this runs ONCE at boot with
   * the game already built, which is exactly the moment a new character's option
   * store exists and nothing has read it yet. A hook would have to be called by
   * something, and there is nothing in a turn that means "the character just
   * started".
   *
   * ONLY FOR A NEW CHARACTER. A loaded save carries its own options and they are
   * that character's - a player who set a save up one way must not have it
   * rewritten because they changed something on a different character last week.
   * `ctx.newCharacter` is the host's answer to that question and cannot be
   * derived here: turn 0 is not it (the game autosaves immediately after birth),
   * and neither is an empty save bag (a mod enabled mid-game has one too).
   *
   * The registry host is untouched. This mod declares no capabilities, so every
   * facade on it would throw - and it needs none of them.
   *
   * ALSO WHERE qol.mapHoverCards WIRES ITSELF UP (installMapHoverCards, above) -
   * same reason: it is the one seam that sees a live ctx.state, and unlike the
   * remember-settings apply half it is not gated on ctx.newCharacter, so it
   * runs first and unconditionally.
   */
  register(_host, ctx) {
    installMapHoverCards(ctx);
    if (ctx.flags["qol.rememberSettings"] !== true) return;
    if (ctx.newCharacter !== true) return;
    const opts = ctx.state?.options;
    const stored = ctx.prefs?.get();
    if (!opts || !stored || typeof stored !== "object") return;
    const remembered = stored;
    if (remembered.v !== 1) {
      ctx.log?.(`stored settings are version ${String(remembered.v)}; ignoring them`);
      return;
    }
    const cheats = ctx.flags["qol.rememberCheats"] === true;
    let applied = 0;
    for (const [name, value] of Object.entries(remembered.values ?? {})) {
      if (!mayRemember(opts, name, cheats)) continue;
      if (opts.set(name, value)) applied++;
    }
    if (typeof remembered.hitpointWarn === "number") {
      opts.hitpointWarn = remembered.hitpointWarn;
    }
    if (typeof remembered.delayFactor === "number") {
      opts.delayFactor = remembered.delayFactor;
    }
    if (typeof remembered.lazymoveDelay === "number") {
      opts.lazymoveDelay = remembered.lazymoveDelay;
    }
    ctx.log?.(`restored ${String(applied)} remembered option(s) onto the new character`);
  }
};
export {
  plugin_default as default,
  hoverCardText,
  hoverCaveGrid,
  hoverCellAt
};
