import { describe, expect, it } from "vitest";
import { wrapBitmapParagraphs, wrapBitmapText } from "./bitmap-text";

describe("wrapBitmapText", () => {
  it("keeps a short line on one row", () => {
    expect(wrapBitmapText("Bind shortcut", 20)).toEqual(["Bind shortcut"]);
  });

  it("breaks only at whitespace, never mid-word", () => {
    expect(wrapBitmapText("Bind one key to a repeated non-combat command.", 20)).toEqual([
      "Bind one key to a",
      "repeated non-combat",
      "command.",
    ]);
  });

  it("collapses runs of whitespace between words", () => {
    expect(wrapBitmapText("one   two\tthree", 20)).toEqual(["one two three"]);
  });

  it("still returns the whole word when it alone exceeds the width", () => {
    expect(wrapBitmapText("supercalifragilisticexpialidocious", 10)).toEqual([
      "supercalifragilisticexpialidocious",
    ]);
  });

  it("returns one empty line for empty or all-whitespace input", () => {
    expect(wrapBitmapText("", 20)).toEqual([""]);
    expect(wrapBitmapText("   ", 20)).toEqual([""]);
  });
});

describe("wrapBitmapParagraphs", () => {
  it("keeps a blank source line as a blank paragraph break", () => {
    expect(wrapBitmapParagraphs("First paragraph.\n\nSecond paragraph.", 40)).toEqual([
      "First paragraph.",
      "",
      "Second paragraph.",
    ]);
  });

  it("wraps each paragraph independently", () => {
    expect(wrapBitmapParagraphs("one two three four\nfive six seven eight", 12)).toEqual([
      "one two",
      "three four",
      "five six",
      "seven eight",
    ]);
  });
});
