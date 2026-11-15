import type { Api2ScreenTextSite } from "@rpgm-tools/neo-angband-mod-sdk";

function plainLine(line: string): boolean {
  return /^[A-Za-z"'][^\t]*\S$/u.test(line)
    && /[A-Za-z]+ [A-Za-z]+/u.test(line)
    && !/ {2,}|[|+_\\]|^(?:[A-Za-z0-9?]|\^[A-Za-z])(?:[).:]|\s)|^(?:ESC|Enter|Return|Tab|Space|F\d+|Ctrl[-+]|Alt[-+])\b|^[A-Za-z]+\s*:/u.test(line);
}

export function rejoinProse(text: string): string {
  return text.split(/(\r?\n(?:[ \t]*\r?\n)+)/u).map((paragraph, index) => {
    if (index % 2 !== 0) return paragraph;
    const lines = paragraph.split(/\r?\n/u);
    // A paragraph with layout markers stays intact because its line breaks can carry meaning.
    return lines.length > 1 && lines.every(plainLine) ? lines.join(" ") : paragraph;
  }).join("");
}

export function rejoinScreenProse(text: string, site: Api2ScreenTextSite): string {
  return site.part === "prose" || site.part === "detail" ? rejoinProse(text) : text;
}
