import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";

/** The scan uses syntax nodes because assertions and whitespace can hide context reads from a text pattern. */
const ADAPTER = "core-adapter.ts";
const API2_ADAPTER = "core-adapter-api2.ts";
const CONTEXT_MEMBERS = new Set([
  "core", "state", "registries", "snapshot", "intent", "events", "characterStore", "prefs",
  "inspect", "keymaps", "ui", "display", "keyRepeat", "backupFolder", "newCharacter", "flags", "log",
]);
const ENGINE_MEMBERS = new Set([
  "movementTunnelTest", "tunnelAux", "setPrefErrorPolicy", "OptionState", "TV", "isIgnored", "moveEnergy",
]);

function unwrap(expression: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) expression = expression.expression;
  return expression;
}

function member(node: ts.Node): { receiver: ts.Expression; name: string } | undefined {
  if (ts.isPropertyAccessExpression(node)) return { receiver: unwrap(node.expression), name: node.name.text };
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return { receiver: unwrap(node.expression), name: node.argumentExpression.text };
  }
  return undefined;
}

function context(expression: ts.Expression): boolean {
  const node = unwrap(expression);
  return (ts.isIdentifier(node) && node.text === "ctx") || member(node)?.name === "ctx";
}

function engineModule(node: ts.Node | undefined): boolean {
  return node !== undefined && ts.isStringLiteralLike(node) &&
    /^@rpgm-tools\/neo-angband-core(?:\/|$)/u.test(node.text);
}

function violations(source: string, filename = "plugin.ts"): string[] {
  const found = new Set<string>();
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && engineModule(node.moduleSpecifier)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const typeOnly = clause?.isTypeOnly || (clause?.name === undefined && bindings !== undefined &&
        ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((item) => item.isTypeOnly));
      if (!typeOnly) found.add("a runtime import of the engine");
    }
    if (ts.isExportDeclaration(node) && engineModule(node.moduleSpecifier)) {
      const clause = node.exportClause;
      const typeOnly = node.isTypeOnly || (clause !== undefined && ts.isNamedExports(clause) &&
        clause.elements.length > 0 && clause.elements.every((item) => item.isTypeOnly));
      if (!typeOnly) found.add("a runtime import of the engine");
    }
    if (ts.isCallExpression(node) && engineModule(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      found.add("a runtime import of the engine");
    }
    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference) &&
      engineModule(node.moduleReference.expression)) found.add("a runtime import of the engine");
    if (filename !== ADAPTER) {
      if (filename === API2_ADAPTER && ts.isIdentifier(node) && node.text === "ctx") found.add("ctx in the API 2 adapter");
      const access = member(node);
      if (access) {
        const { receiver, name } = access;
        if (context(receiver) && CONTEXT_MEMBERS.has(name)) found.add("a plugin-context member");
        if (name === "registries") found.add("the registries");
        if (ts.isIdentifier(receiver) && receiver.text === "core") found.add("the engine namespace");
        const group = (ts.isIdentifier(receiver) && receiver.text === "engine") || member(receiver)?.name === "engine";
        if (ENGINE_MEMBERS.has(name) && !group) found.add("an engine name outside the adapter's engine group");
      }
      if (ts.isIdentifier(node) && /engine$/iu.test(node.text) && node.text !== "engine") found.add("an engine namespace alias");
      if (ts.isVariableDeclaration(node) && node.initializer && context(node.initializer)) {
        if (ts.isObjectBindingPattern(node.name)) found.add("a member destructured from the plugin context");
        else found.add("a plugin-context alias");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return [...found];
}

describe("the engine adapter boundary", () => {
  const sources = readdirSync(new URL("./", import.meta.url)).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
  );

  it("finds the mod's sources", () => {
    expect(sources).toContain("plugin.ts");
    expect(sources).toContain("light-ignore.ts");
    expect(sources).toContain(ADAPTER);
    expect(sources).toContain(API2_ADAPTER);
  });

  it.each(sources)("%s reads nothing from the plugin context or the engine", (name) => {
    const source = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
    expect(violations(source, name)).toEqual([]);
  });

  it.each([
    ["ctx.core.TV;", "a plugin-context member"],
    ["ctx!.state;", "a plugin-context member"],
    ["(ctx as any).prefs;", "a plugin-context member"],
    ["ctx . flags;", "a plugin-context member"],
    ['ctx?.["state"];', "a plugin-context member"],
    ["const { core } = (ctx as any);", "a member destructured from the plugin context"],
    ["const { core } = ctx;", "a member destructured from the plugin context"],
    ["const x = ctx; x.core;", "a plugin-context alias"],
    ["let y = ctx; y.state;", "a plugin-context alias"],
    ["const x = (ctx as any); x.core;", "a plugin-context alias"],
    ["this.ctx.core;", "a plugin-context member"],
    ["obj.ctx.state;", "a plugin-context member"],
    ['obj["ctx"]?.["state"];', "a plugin-context member"],
    ["const { core } = obj.ctx;", "a member destructured from the plugin context"],
    ["const x = this.ctx; x.core;", "a plugin-context alias"],
    ["host.registries.menus;", "the registries"],
    ["core!.tunnelAux(s, g, d);", "the engine namespace"],
    ["state.isIgnored = f;", "an engine name outside the adapter's engine group"],
    ["gameengine.tunnelAux(s, g, d);", "an engine namespace alias"],
    ["gameEngine.TV;", "an engine namespace alias"],
    ['import { TV } from "@rpgm-tools/neo-angband-core";', "a runtime import of the engine"],
    ['export { TV } from "@rpgm-tools/neo-angband-core";', "a runtime import of the engine"],
    ['export * from "@rpgm-tools/neo-angband-core";', "a runtime import of the engine"],
    ['import("@rpgm-tools/neo-angband-core");', "a runtime import of the engine"],
    ['import "@rpgm-tools/neo-angband-core";', "a runtime import of the engine"],
    ['import { type ModHooks, TV } from "@rpgm-tools/neo-angband-core";', "a runtime import of the engine"],
    ['import core = require("@rpgm-tools/neo-angband-core");', "a runtime import of the engine"],
    ['require("@rpgm-tools/neo-angband-core");', "a runtime import of the engine"],
    ['require("@rpgm-tools/neo-angband-core/engine");', "a runtime import of the engine"],
    ['import core = require("@rpgm-tools/neo-angband-core/engine");', "a runtime import of the engine"],
    ['const text = `${ctx!.core.TV}`;', "a plugin-context member"],
  ])("rejects %s", (source, violation) => {
    expect(violations(source)).toContain(violation);
  });

  it.each(["ctx;", "const ctx = mod;", "ctx.imageSmoothingEnabled = false;"])("rejects %s in the API 2 twin", (source) => {
    expect(violations(source, API2_ADAPTER)).toContain("ctx in the API 2 adapter");
  });

  it.each([
    "engine.tunnelAux(s, g, d); // ctx.core",
    "adapter.engine.tunnelAux(s, g, d);",
    'const text = "ctx.core.TV";',
    'const text = `ctx.core.TV`;',
    "ctx.imageSmoothingEnabled = false;",
    'import type { ModHooks } from "@rpgm-tools/neo-angband-core";',
    'import { type ModHooks } from "@rpgm-tools/neo-angband-core";',
    'export type { ModHooks } from "@rpgm-tools/neo-angband-core";',
    'type Core = typeof import("@rpgm-tools/neo-angband-core");',
  ])("allows %s", (source) => {
    expect(violations(source)).toEqual([]);
  });

  it("checks runtime imports inside the API 1 adapter", () => {
    expect(violations('export { TV } from "@rpgm-tools/neo-angband-core";', ADAPTER)).toContain("a runtime import of the engine");
  });
});
