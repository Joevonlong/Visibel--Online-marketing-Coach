/**
 * F-082 — one-off generator for the REPLAY fixture's placeholder images.
 *
 * No API keys exist in this environment, so `lib/fixtures/replay-audit.json`
 * cannot be recorded from a real gpt-image-2 run today. These files stand in
 * for that recording: plain SVG gradients rasterized to JPEG via sharp — NO
 * text, NO logos, NO fake photos — so nothing here could be mistaken for a
 * real photograph or a real AI-generated concept. They exist purely so the
 * REPLAY demo has something to render behind the truthful "AI concept" /
 * before-photo badges while the fixture waits to be re-recorded from a real
 * audit at the venue (see scripts/record-fixture.ts).
 *
 * Run once (`npx tsx scripts/make-fixture-images.ts`); the output files are
 * tiny and get committed alongside lib/fixtures/replay-audit.json.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const OUT_DIR = join(process.cwd(), "public", "fixtures", "sanitaer-krause-berlin");

interface GradientSpec {
  file: string;
  width: number;
  height: number;
  /** Two hex colors — top-left to bottom-right diagonal gradient. */
  from: string;
  to: string;
}

// "Before" set: muted, slightly desaturated gray-blue tones (the business's
// current, unremarkable photos). Two different stops so the pair reads as
// two distinct source photos rather than one image duplicated.
const BEFORE_IMAGES: GradientSpec[] = [
  { file: "before-1.jpg", width: 800, height: 600, from: "#5b6672", to: "#2f3944" },
  { file: "before-2.jpg", width: 1024, height: 768, from: "#626b74", to: "#3a4249" },
];

// "After" concept set: warmer, more saturated amber/terracotta tones (the
// AI-concept direction) — four distinct stops for gallery variety.
const AFTER_IMAGES: GradientSpec[] = [
  { file: "after-hero.jpg", width: 1536, height: 1024, from: "#e8a355", to: "#b5502a" },
  { file: "after-team.jpg", width: 1024, height: 1024, from: "#eab676", to: "#c2653a" },
  { file: "after-work-1.jpg", width: 1024, height: 1024, from: "#e2985a", to: "#a8471f" },
  { file: "after-work-2.jpg", width: 1024, height: 1024, from: "#ecbb84", to: "#c76f3e" },
];

// A neutral, unrelated gray gradient standing in for the manually-uploaded
// GBP screenshot backing the reputation chip — portrait aspect like a real
// phone screenshot, still no text/logos rendered into the pixels.
const SCREENSHOT_IMAGES: GradientSpec[] = [
  { file: "gbp-screenshot-1.jpg", width: 375, height: 812, from: "#8a8f94", to: "#54585c" },
];

function gradientSvg(spec: GradientSpec): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${spec.from}" />
      <stop offset="100%" stop-color="${spec.to}" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)" />
</svg>`;
  return Buffer.from(svg);
}

async function writeGradient(spec: GradientSpec): Promise<void> {
  const outPath = join(OUT_DIR, spec.file);
  await sharp(gradientSvg(spec)).jpeg({ quality: 82 }).toFile(outPath);
  console.log(`wrote ${outPath} (${spec.width}x${spec.height})`);
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const all = [...BEFORE_IMAGES, ...AFTER_IMAGES, ...SCREENSHOT_IMAGES];
  for (const spec of all) {
    await writeGradient(spec);
  }
  console.log(`\n${all.length} placeholder images written to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error("make-fixture-images failed:", error);
  process.exitCode = 1;
});
