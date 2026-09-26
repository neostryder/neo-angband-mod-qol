/**
 * text-changes.json is the full list of what the Misc. niceties switch changes in
 * Angband 4.2.6's text, and TEXT_CHANGES.md is rendered from it. These tests hold
 * the list to the code in both directions: every entry is shipped exactly as
 * written, nothing ships that the list leaves out, core still carries each Before
 * text, and the rendered document is current.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { recordKey } from "@rpgm-tools/neo-angband-mod-sdk";

import { UPSTREAM_MESSAGE_WORDING, upstreamWordingFix } from "./misc-niceties";
import data from "./text-changes.json";

const require = createRequire(import.meta.url);
const SECTION = "qol-misc-niceties";

interface Change {
  kind: "gamedata" | "message";
  file?: string;
  ref?: string;
  path?: string;
  table?: string;
  before: unknown;
  after: unknown;
  upstream: string | null;
  why: string | null;
}
const changes = data.changes as Change[];
const game = changes.filter((c) => c.kind === "gamedata");
const messages = changes.filter((c) => c.kind === "message");

const packDir = path.dirname(require.resolve("@rpgm-tools/neo-angband-content/pack/monster.json"));
const records = (file: string): Record<string, unknown>[] =>
  (JSON.parse(fs.readFileSync(path.join(packDir, `${file}.json`), "utf8")) as { records: Record<string, unknown>[] }).records;
const at = (v: unknown, p: string): unknown =>
  p.split(".").reduce<unknown>((c, k) => (Array.isArray(c) ? c[Number(k)] : c && typeof c === "object" ? (c as Record<string, unknown>)[k] : undefined), v);

/** Every (file, ref, path, value) this mod's content files ship under the section. */
function shipped(): { file: string; ref: string; path: string; value: unknown }[] {
  const out: { file: string; ref: string; path: string; value: unknown }[] = [];
  for (const name of fs.readdirSync(__dirname).filter((f) => f.endsWith(".json"))) {
    const file = name.slice(0, -5);
    if (!fs.existsSync(path.join(packDir, name))) continue;
    const contrib = JSON.parse(fs.readFileSync(path.join(__dirname, name), "utf8")) as {
      sections?: Record<string, { patches?: Record<string, Record<string, unknown>>; fieldPatches?: Record<string, { op: string; path: string; value: unknown }[]> }>;
    };
    const s = contrib.sections?.[SECTION];
    if (!s) continue;
    for (const [ref, fields] of Object.entries(s.patches ?? {})) for (const [k, v] of Object.entries(fields)) out.push({ file, ref, path: k, value: v });
    for (const [ref, ops] of Object.entries(s.fieldPatches ?? {})) for (const op of ops) {
      expect(op.op).toBe("set");
      out.push({ file, ref, path: op.path, value: op.value });
    }
  }
  return out;
}

describe("text-changes", () => {
  it("names the switch that carries the changes", () => {
    expect(data.switch.flag).toBe("qol.miscNiceties");
    expect(data.switch.section).toBe(SECTION);
  });

  it("lists exactly what the content files ship, no more and no less", () => {
    const key = (x: { file?: string; ref?: string; path?: string }): string => `${x.file}|${x.ref}|${x.path}`;
    const listed = new Map(game.map((c) => [key(c), c.after]));
    const out = shipped();
    expect(out.map(key).sort()).toEqual([...listed.keys()].sort());
    for (const s of out) expect(s.value, key(s)).toEqual(listed.get(key(s)));
  });

  for (const c of game) {
    it(`${c.file} ${c.ref} ${c.path}: core still shows the Before text`, () => {
      const hits = records(c.file!).filter((r) => `core:${recordKey(c.file!, r)}` === c.ref);
      expect(hits).toHaveLength(1);
      expect(at(hits[0], c.path!)).toEqual(c.before);
      expect(c.after).not.toEqual(c.before);
    });
  }

  it("lists every message row the mod rewrites, with its text as shipped", () => {
    const rows = Object.entries(UPSTREAM_MESSAGE_WORDING).map(([b, a]) => ["UPSTREAM_MESSAGE_WORDING", b, a]);
    expect(messages.map((c) => [c.table, c.before, c.after])).toEqual(rows);
  });

  it("rewrites each listed message, carrying filled-in values through", () => {
    const fill = (s: string): string => s.replace(/%s/gu, "Wand of Stinking Cloud").replace(/%d/gu, "123");
    for (const c of messages) {
      expect(upstreamWordingFix(fill(c.before as string))).toBe(fill(c.after as string));
    }
  });

  it("gives every change an upstream source line and a reason", () => {
    for (const c of changes) {
      expect(c.upstream, JSON.stringify(c.before)).toMatch(/^(lib|src)\/[\w./-]+:\d+(-\d+)?$/u);
      expect((c.why ?? "").length, JSON.stringify(c.before)).toBeGreaterThan(20);
    }
  });

  it("keeps TEXT_CHANGES.md in step with the list", () => {
    expect(() => execFileSync(process.execPath, ["tools/text-changes.mjs", "--check"], { cwd: __dirname, stdio: "pipe" })).not.toThrow();
  });
});
