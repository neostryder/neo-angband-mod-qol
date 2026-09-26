// Renders TEXT_CHANGES.md from text-changes.json, the list of every text change this mod's switch
// makes to Angband 4.2.6. `node tools/text-changes.mjs` writes the file; `--check` exits 1 when
// the committed file is out of date. text-changes.test.ts checks the JSON against the patches and
// message tables that actually ship.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const INTRO = {
  "bugfix.textAndHistory":
    "Below is every change the Text and history fixes switch (`bugfix.textAndHistory`) makes to the text of Angband 4.2.6: typos, grammar mistakes, wrong facts, and descriptions of rules the game no longer has. Turn the switch off and you see the Before text, exactly as upstream wrote it. Each entry gives the upstream file and line. The switch also fixes two history bugs, which the mod's README describes.",
  "qol.miscNiceties":
    "This page lists every change the Misc. niceties switch (`qol.miscNiceties`) makes to the text of Angband 4.2.6. None of them fixes a mistake. They make a description or message clearer, or word it the way the rest of the game already does. Turn the switch off and you see the Before text, exactly as upstream wrote it. The mod's README describes the switch's display conveniences.",
};

const FILE_NAMES = {
  activation: "Activations", artifact: "Artifacts", chest_trap: "Chest traps", class: "Class spells",
  curse: "Curses", monster: "Monsters", monster_base: "Monster groups", object: "Objects",
  player_property: "Player properties", player_timed: "Timed effects", terrain: "Terrain", trap: "Traps",
};

const show = (v) => (Array.isArray(v) ? v.join(v.length > 1 && v.every((x) => !x.startsWith(" ")) ? "\n" : "") : v);
const quote = (v) => show(v).split("\n").map((l) => `> ${l.replace(/ {2}/g, " &nbsp;")}`).join("\n>\n");

export function render(data) {
  const out = [`# Text changes: ${data.switch.title}`, "", INTRO[data.switch.flag], ""];
  const game = data.changes.filter((c) => c.kind === "gamedata");
  const msgs = data.changes.filter((c) => c.kind === "message");
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  out.push(`${plural(game.length, "description and game data change")}, ${plural(msgs.length, "message change")}.`, "");
  const files = [...new Set(game.map((c) => c.file))];
  for (const f of files) {
    out.push(`## ${FILE_NAMES[f] ?? f}`, "");
    for (const c of game.filter((c) => c.file === f)) {
      out.push(`### ${c.record} (\`${c.path}\`)`, "");
      out.push(`Upstream \`${c.upstream}\`, ${c.category}.`, "", "Before:", "", quote(c.before), "", "After:", "", quote(c.after), "", c.why, "");
    }
  }
  if (msgs.length) {
    out.push("## Messages", "");
    for (const c of msgs) {
      out.push(`### ${c.before.replace(/\s+/g, " ").trim()}`, "");
      const fill = /%[sd]/.test(c.before) ? " `%s` and `%d` stand for text the game fills in." : "";
      out.push(`Upstream \`${c.upstream}\`, ${c.category}.${fill}`, "", "Before:", "", quote(c.before), "", "After:", "", quote(c.after), "", c.why, "");
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "text-changes.json"), "utf8"));
  const text = render(data);
  const target = path.join(ROOT, "TEXT_CHANGES.md");
  if (process.argv.includes("--check")) {
    const now = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
    if (now !== text) {
      console.error("TEXT_CHANGES.md is out of date: run node tools/text-changes.mjs");
      process.exit(1);
    }
  } else fs.writeFileSync(target, text);
}
