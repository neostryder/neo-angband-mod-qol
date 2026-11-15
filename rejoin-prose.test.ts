import { describe, expect, it } from "vitest";
import type { Api2ScreenTextSite } from "@rpgm-tools/neo-angband-mod-sdk";
import plugin from "./plugin";
import { rejoinProse } from "./rejoin-prose";

const prose = "The passage leads through an ancient hall\nand opens into a quiet room.";

describe("rejoining prose", () => {
  it("joins wrapped prose and preserves blank paragraph separators", () => {
    expect(rejoinProse(`${prose}\n\n${prose}`)).toBe(`${prose.replace("\n", " ")}\n\n${prose.replace("\n", " ")}`);
    expect(rejoinProse(prose.replace("\n", "\r\n"))).toBe(prose.replace("\n", " "));
    expect(rejoinProse("One complete sentence.")).toBe("One complete sentence.");
  });

  it.each([
    ["table", "Name       Weight\nSword      10 lb"],
    ["key hints", "a) Use the item\nb) Drop the item"],
    ["named keys", "ESC leaves this menu\nEnter chooses the row"],
    ["plain key hints", "q leaves this menu\nr reads the item"],
    ["ASCII art", "+---+\n| @ |\n+---+"],
    ["aligned lines", "First column    second column\nNext row        next column"],
    ["indented text", "  The passage leads away\n  from this quiet room."],
    ["list", "- The first item\n- The second item"],
    ["tabs", "Name\tWeight\nSword\t10 lb"],
  ])("preserves %s even in a prose block", (_name, text) => {
    expect(rejoinProse(text)).toBe(text);
  });

  it("installs no text hooks with the setting off", () => {
    for (const flags of [{}, { "qol.rejoinProse": false }]) {
      const hooks = plugin.hooks({ id: "qol", flags });
      expect(hooks.helpText).toBeUndefined();
      expect(hooks.screenText).toBeUndefined();
      expect(hooks.characterBackground).toBeUndefined();
      expect(hooks.objectInfoText).toBeUndefined();
    }
  });

  it("opts classified help paragraphs into wrapping and preserves every layout group", () => {
    const hooks = plugin.hooks({ id: "qol", flags: { "qol.rejoinProse": true } });
    const paragraph = Object.freeze({ sourceBlock: 0, kind: "paragraph" as const, text: prose.replace("\n", " "), lines: Object.freeze(prose.split("\n").map((text) => Object.freeze({ text }))) });
    const page = Object.freeze([paragraph]);
    expect(hooks.helpText?.(paragraph.text, { screen: "core:help-guide", kind: "paragraph", index: 0, page })).toBe(paragraph.text);
    expect(hooks.helpText?.("", { screen: "core:help-guide", kind: "paragraph", index: 1, page })).toBe("");
    for (const kind of ["table", "key-hints", "art", "aligned"] as const) {
      expect(hooks.helpText?.(prose, { screen: "core:help-guide", kind, index: 1, page })).toBeNull();
    }
    expect(page[0]).toBe(paragraph);
  });

  it("preserves layout markers in raw rows even when the help classifier calls them paragraphs", () => {
    const hook = plugin.hooks({ id: "qol", flags: { "qol.rejoinProse": true } }).helpText!;
    for (const lines of [["Name | Weight", "Sword | 10 lb"], ["  This paragraph is indented.", "  Its indentation carries layout."], ["- The first list item", "- The second list item"]]) {
      const group = { sourceBlock: 0, kind: "paragraph" as const, text: lines.map((line) => line.trim()).join(" "), lines: lines.map((text) => ({ text })) };
      expect(hook(group.text, { screen: "core:text", kind: "paragraph", index: 0, page: [group] })).toBeNull();
    }
  });

  it("transforms only semantic prose and flavor descriptions through the plugin", () => {
    const hooks = plugin.hooks({ id: "qol", flags: { "qol.rejoinProse": true } });
    for (const part of ["prose", "detail"] as const) {
      expect(hooks.screenText?.(prose, { screen: "core:help-guide", part })).toBe(prose.replace("\n", " "));
    }
    for (const part of ["title", "footer", "action", "caption", "column", "cell", "empty", "line", "prompt"] as Api2ScreenTextSite["part"][]) {
      expect(hooks.screenText?.(prose, { screen: "core:text", part })).toBe(prose);
    }
    expect(hooks.objectInfoText?.(prose, { section: "flavor", tval: "sword", kind: "Dagger", aware: true })).toBe(prose.replace("\n", " "));
    expect(hooks.objectInfoText?.(prose, { section: "combat", tval: "sword", kind: "Dagger", aware: true })).toBe(prose);
    expect(hooks.characterBackground?.(prose)).toBe(prose.replace("\n", " "));
    expect(hooks.messageText).toBeUndefined();
  });
});
