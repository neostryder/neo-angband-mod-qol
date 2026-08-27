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
var HOVER_DWELL_MS = 2e3;
var TOUCH_HOLD_MS = 1e3;
var TILE_PREVIEW_PX = 64;
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
var KIND_TITLE = {
  character: "Character",
  creature: "Creature",
  item: "Item",
  trap: "Trap",
  shop: "Shop",
  terrain: "Terrain"
};
function hoverCardContent(core, state, grid) {
  const result = core.describeLookGrid(state, grid, 0);
  const text = result?.text?.trim() ?? "";
  if (!text) return null;
  const player = state.actor?.grid;
  let kind;
  if (player && player.x === grid.x && player.y === grid.y) {
    kind = "character";
  } else if (result.mon) {
    kind = "creature";
  } else if (core.knownPile(state, grid).length > 0) {
    kind = "item";
  } else if (core.squareIsVisibleTrap?.(state, grid)) {
    kind = "trap";
  } else if ((state.chunk?.feature?.(grid)?.shopnum ?? 0) > 0) {
    kind = "shop";
  } else {
    kind = "terrain";
  }
  return { kind, text, title: KIND_TITLE[kind] };
}
function hoverCardText(core, state, grid) {
  return hoverCardContent(core, state, grid)?.text ?? null;
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
  const root = document.createElement("div");
  root.setAttribute("data-qol-map-hover-card", "");
  Object.assign(root.style, {
    position: "fixed",
    zIndex: "2100",
    pointerEvents: "none",
    display: "none",
    maxWidth: "360px",
    padding: "8px 10px",
    borderRadius: "6px",
    font: "13px monospace",
    lineHeight: "1.35",
    background: "rgba(12,12,16,0.94)",
    color: "#e8e8e8",
    border: "1px solid #777",
    boxShadow: "0 4px 16px rgba(0,0,0,0.45)"
  });
  const title = document.createElement("div");
  Object.assign(title.style, {
    fontWeight: "700",
    marginBottom: "6px",
    color: "#f0d878",
    letterSpacing: "0.02em"
  });
  const row = document.createElement("div");
  Object.assign(row.style, {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start"
  });
  const img = document.createElement("canvas");
  img.width = TILE_PREVIEW_PX;
  img.height = TILE_PREVIEW_PX;
  Object.assign(img.style, {
    width: `${String(TILE_PREVIEW_PX)}px`,
    height: `${String(TILE_PREVIEW_PX)}px`,
    imageRendering: "pixelated",
    flex: "0 0 auto",
    background: "#000",
    border: "1px solid #555"
  });
  const body = document.createElement("div");
  Object.assign(body.style, {
    whiteSpace: "pre-wrap",
    flex: "1 1 auto",
    minWidth: "0"
  });
  row.appendChild(img);
  row.appendChild(body);
  root.appendChild(title);
  root.appendChild(row);
  document.body.appendChild(root);
  return { root, title, img, body };
}
function paintTilePreview(canvas, grid, chunk, termCell) {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) return false;
  ctx2d.imageSmoothingEnabled = false;
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  const overlays = Array.from(
    document.querySelectorAll('body > canvas[aria-hidden="true"]')
  );
  for (const src of overlays) {
    if (src === canvas || src.id === "game") continue;
    if (src.width < 1 || src.height < 1) continue;
    if (chunk.width < 1 || chunk.height < 1) continue;
    const cellW2 = src.width / chunk.width;
    const cellH2 = src.height / chunk.height;
    if (cellW2 < 1 || cellH2 < 1) continue;
    try {
      ctx2d.drawImage(
        src,
        grid.x * cellW2,
        grid.y * cellH2,
        cellW2,
        cellH2,
        0,
        0,
        canvas.width,
        canvas.height
      );
      return true;
    } catch {
    }
  }
  const game = document.getElementById("game");
  if (!(game instanceof HTMLCanvasElement) || !termCell) return false;
  if (game.width < 1 || game.height < 1) return false;
  const cellW = game.width / TERM_COLS;
  const cellH = game.height / TERM_ROWS;
  if (cellW < 1 || cellH < 1) return false;
  try {
    ctx2d.drawImage(
      game,
      termCell.col * cellW,
      termCell.row * cellH,
      cellW,
      cellH,
      0,
      0,
      canvas.width,
      canvas.height
    );
    return true;
  } catch {
    return false;
  }
}
function installMapHoverCards(ctx) {
  if (ctx.flags["qol.mapHoverCards"] !== true) return;
  if (hoverCardsWired) return;
  if (typeof document === "undefined" || typeof window === "undefined") return;
  hoverCardsWired = true;
  const core = ctx.core;
  const card = buildHoverCardElement();
  let mapOpenGuess = false;
  let touchPinned = false;
  let dwellTimer = null;
  let holdTimer = null;
  let dwellGridKey = null;
  let holdPointerId = null;
  let shownGridKey = null;
  let lastClientX = 0;
  let lastClientY = 0;
  const gridKey = (g) => `${String(g.x)},${String(g.y)}`;
  const clearDwell = () => {
    if (dwellTimer !== null) clearTimeout(dwellTimer);
    dwellTimer = null;
    dwellGridKey = null;
  };
  const clearHold = () => {
    if (holdTimer !== null) clearTimeout(holdTimer);
    holdTimer = null;
    holdPointerId = null;
  };
  const hide = () => {
    card.root.style.display = "none";
    shownGridKey = null;
    touchPinned = false;
  };
  const resolveCaveGrid = (clientX, clientY) => {
    const game = document.getElementById("game");
    if (!game) return null;
    const cell = hoverCellAt(game.getBoundingClientRect(), clientX, clientY);
    if (!cell) return null;
    const state = ctx.state;
    const chunk = state?.chunk;
    if (!chunk || chunk.width < 1 || chunk.height < 1) return null;
    const grid = hoverCaveGrid(cell.col, cell.row, chunk.width, chunk.height);
    if (!grid) return null;
    return { grid, cell, chunk };
  };
  const showAt = (clientX, clientY, resolved) => {
    const state = ctx.state;
    if (!state) return false;
    const content = hoverCardContent(core, state, resolved.grid);
    if (!content) return false;
    card.title.textContent = content.title;
    card.body.textContent = content.text;
    const painted = paintTilePreview(card.img, resolved.grid, resolved.chunk, resolved.cell);
    card.img.style.display = painted ? "block" : "none";
    card.root.style.display = "block";
    positionHoverCard(card.root, clientX, clientY);
    shownGridKey = gridKey(resolved.grid);
    return true;
  };
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "M") {
      mapOpenGuess = true;
      return;
    }
    mapOpenGuess = false;
    clearDwell();
    clearHold();
    hide();
  });
  window.addEventListener(
    "pointerdown",
    (ev) => {
      if (!mapOpenGuess) return;
      const resolved = resolveCaveGrid(ev.clientX, ev.clientY);
      if (touchPinned) {
        const same = resolved !== null && shownGridKey !== null && gridKey(resolved.grid) === shownGridKey;
        if (same) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          return;
        }
        hide();
        clearHold();
        if (!resolved) {
          mapOpenGuess = false;
          return;
        }
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (ev.pointerType === "touch" || ev.pointerType === "pen") {
          holdPointerId = ev.pointerId;
          const atDown = resolved;
          holdTimer = setTimeout(() => {
            holdTimer = null;
            if (showAt(ev.clientX, ev.clientY, atDown)) touchPinned = true;
          }, TOUCH_HOLD_MS);
        }
        return;
      }
      if (!resolved) {
        mapOpenGuess = false;
        clearDwell();
        clearHold();
        hide();
        return;
      }
      ev.preventDefault();
      ev.stopImmediatePropagation();
      clearDwell();
      if (ev.pointerType === "touch" || ev.pointerType === "pen") {
        clearHold();
        holdPointerId = ev.pointerId;
        const atDown = resolved;
        holdTimer = setTimeout(() => {
          holdTimer = null;
          if (showAt(ev.clientX, ev.clientY, atDown)) touchPinned = true;
        }, TOUCH_HOLD_MS);
      }
    },
    true
  );
  window.addEventListener("pointerup", (ev) => {
    if (holdPointerId !== null && ev.pointerId === holdPointerId && holdTimer !== null) {
      clearHold();
    }
  });
  window.addEventListener("pointercancel", (ev) => {
    if (holdPointerId !== null && ev.pointerId === holdPointerId) clearHold();
  });
  document.addEventListener("pointermove", (ev) => {
    if (!mapOpenGuess) return;
    lastClientX = ev.clientX;
    lastClientY = ev.clientY;
    if (ev.pointerType === "touch" || ev.pointerType === "pen") {
      if (holdTimer !== null && holdPointerId === ev.pointerId) {
        const resolved2 = resolveCaveGrid(ev.clientX, ev.clientY);
        if (!resolved2) clearHold();
      }
      return;
    }
    if (touchPinned) return;
    const resolved = resolveCaveGrid(ev.clientX, ev.clientY);
    if (!resolved) {
      clearDwell();
      if (shownGridKey !== null) hide();
      return;
    }
    const key = gridKey(resolved.grid);
    if (shownGridKey === key) {
      positionHoverCard(card.root, ev.clientX, ev.clientY);
      return;
    }
    if (shownGridKey !== null) hide();
    if (dwellGridKey === key) return;
    clearDwell();
    dwellGridKey = key;
    dwellTimer = setTimeout(() => {
      dwellTimer = null;
      const still = resolveCaveGrid(lastClientX, lastClientY);
      if (!still || gridKey(still.grid) !== key) return;
      showAt(lastClientX, lastClientY, still);
    }, HOVER_DWELL_MS);
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
  HOVER_DWELL_MS,
  TOUCH_HOLD_MS,
  plugin_default as default,
  hoverCardContent,
  hoverCardText,
  hoverCaveGrid,
  hoverCellAt
};
