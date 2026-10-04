import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

/**
 * core-adapter.ts is the only source file that reads the plugin context or
 * the engine. Every other source file at the repository root is scanned with
 * its comments and string literals blanked out, and fails on any of the
 * patterns below.
 */
const ADAPTER = "core-adapter.ts";

const FORBIDDEN: readonly (readonly [RegExp, string])[] = [
  [
    /\bctx\??\.(core|state|registries|snapshot|intent|events|characterStore|prefs|inspect|keymaps|ui|display|keyRepeat|backupFolder|newCharacter|flags|log)\b/,
    "a plugin-context member",
  ],
  [/\}\s*=\s*ctx\b/, "a member destructured from the plugin context"],
  [/\.registries\b/, "the registries"],
  [/\bcore\??\.\w/, "the engine namespace"],
  [
    /(?<!\bengine)\.(movementTunnelTest|tunnelAux|setPrefErrorPolicy|OptionState|TV|isIgnored|moveEnergy)\b/,
    "an engine name outside the adapter's engine group",
  ],
];

/** Checked with string literals kept, since the module name is one. */
const RUNTIME_IMPORT = /^import\s+(?!type\b)[^;]*["']@rpgm-tools\/neo-angband-core["']/m;

const TOKENS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

/** Blank comments, and string literals too unless `keepStrings` is set. */
function blank(source: string, keepStrings: boolean): string {
  return source.replace(TOKENS, (token) => {
    if (token.startsWith("/")) return " ";
    return keepStrings ? token : '""';
  });
}

function violations(source: string): string[] {
  const code = blank(source, false);
  const found = FORBIDDEN.filter(([pattern]) => pattern.test(code)).map(([, what]) => what);
  if (RUNTIME_IMPORT.test(blank(source, true))) found.push("a runtime import of the engine");
  return found;
}

describe("the engine adapter boundary", () => {
  const sources = readdirSync(new URL("./", import.meta.url)).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== ADAPTER,
  );

  it("finds the mod's sources", () => {
    expect(sources).toContain("plugin.ts");
    expect(sources).toContain("light-ignore.ts");
  });

  it.each(sources)("%s reads nothing from the plugin context or the engine", (name) => {
    const source = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
    expect(violations(source)).toEqual([]);
  });

  it("catches each pattern it is meant to catch", () => {
    expect(violations("const x = ctx.core.TV;")).toContain("a plugin-context member");
    expect(violations("const { core } = ctx;")).toContain("a member destructured from the plugin context");
    expect(violations("host.registries.menus;")).toContain("the registries");
    expect(violations("core.tunnelAux(s, g, d);")).toContain("the engine namespace");
    expect(violations("state.isIgnored = f;")).toContain("an engine name outside the adapter's engine group");
    expect(violations('import { TV } from "@rpgm-tools/neo-angband-core";')).toContain(
      "a runtime import of the engine",
    );
    expect(violations("engine.tunnelAux(s, g, d); // ctx.core")).toEqual([]);
    expect(violations('import type { ModHooks } from "@rpgm-tools/neo-angband-core";')).toEqual([]);
  });
});
