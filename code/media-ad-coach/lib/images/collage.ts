/**
 * ISS-039 — collage detection for GENERATED images.
 *
 * The prompt-side fix (lib/agents/prompts.ts `SINGLE_SCENE_RULE`) is the
 * primary defence; this is the cheap verification behind it. A real audit
 * produced a "storefront" image that stitched three unrelated scenes (two
 * people with a van / a boiler room / a bathroom) into one frame, and nothing
 * in the pipeline could tell: FEA-114's classifier only ever looks at the
 * business's OWN photos, never at what we generated.
 *
 * Design constraints that matter more than the detector itself:
 *  - **Fail open.** Any error, timeout, or missing key means "not a collage".
 *    A verification call must never be able to lose an image we already paid
 *    for, and never turn a working run into a failed one.
 *  - **One extra small vision call per generated image** (~4-8 per full run),
 *    on the same `OPENAI_MODEL_VISION` already used for classification.
 *  - **Kill switch.** `IMAGE_COLLAGE_CHECK=0` disables it entirely.
 *
 * The retry policy lives at the call site (lib/improve/image.ts): at most ONE
 * regeneration per slot, so a stubborn model costs one extra image, not N.
 */
import type OpenAI from "openai";
import { z } from "zod";
import { getModels, structuredCall } from "../agents/openai";

/** Local schema on purpose: `lib/schemas.ts` is frozen, and this shape is an
 *  internal quality gate, never product surface. */
const CollageVerdict = z.object({
  /** True only when the frame is literally split into several pictures. */
  is_collage: z.boolean(),
  /** One short sentence of evidence — recorded on the asset's meta_json so a
   *  rejected image's reason survives in the run's own evidence. */
  reason: z.string(),
});

export type CollageVerdict = z.infer<typeof CollageVerdict>;

const COLLAGE_CHECK_SYSTEM = `You inspect ONE generated photograph and answer a single structural question: is it one photographic scene, or several pictures combined into one frame?

Answer is_collage=true ONLY for genuine multi-picture compositions: a grid or tiled layout, a split frame, side-by-side or before/after panels, a diptych/triptych, a montage or storyboard, or a smaller inset picture placed inside the main image — typically separated by hard edges, borders, or abrupt changes of place and lighting.

Answer is_collage=false for any normal single photograph, however busy: several people, several objects, a reflection, a mirror, a window, a doorway showing another room, a picture frame hanging on a wall, or a shallow-depth-of-field background are all still ONE scene.

Keep "reason" to one short factual sentence describing what you actually see.`;

const DEFAULT_TIMEOUT_MS = 60_000;

function isEnabled(): boolean {
  return process.env.IMAGE_COLLAGE_CHECK !== "0";
}

export interface DetectCollageOptions {
  /** Injectable client — tests pass a fake, no network needed. */
  client?: OpenAI;
  /** Label recorded in the failure reason (channel/slot key). */
  label?: string;
  timeoutMs?: number;
}

const NOT_A_COLLAGE: CollageVerdict = { is_collage: false, reason: "" };

/** Asks the vision model whether this base64 PNG is a multi-picture
 *  composition. Never throws and never blocks a run for longer than
 *  `timeoutMs`; on any problem it returns `is_collage: false` (fail open). */
export async function detectCollage(b64: string, options: DetectCollageOptions = {}): Promise<CollageVerdict> {
  if (!isEnabled() || !b64) return NOT_A_COLLAGE;

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = structuredCall({
      schema: CollageVerdict,
      schemaName: "collage_verdict",
      system: COLLAGE_CHECK_SYSTEM,
      user: [
        { type: "text", text: "Is this generated image one single photographic scene, or several pictures combined into one frame?" },
        { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
      ],
      model: getModels().vision,
      stage: options.label ? `collage_check:${options.label}` : "collage_check",
      ...(options.client ? { client: options.client } : {}),
      // Attached here, not only around the await: if the timeout wins the race
      // a later rejection would otherwise surface as an unhandled rejection.
    }).catch(() => NOT_A_COLLAGE);
    const timeout = new Promise<CollageVerdict>((resolve) => {
      timer = setTimeout(() => resolve(NOT_A_COLLAGE), timeoutMs);
    });
    return await Promise.race([call, timeout]);
  } catch {
    // Fail open: a verification failure is not an image failure.
    return NOT_A_COLLAGE;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Appended to the SAME prompt on the single regeneration attempt — the base
 *  brief is unchanged, with one corrective sentence naming what went wrong. */
export const COLLAGE_CORRECTION =
  "CRITICAL CORRECTION: the previous attempt returned a collage of several pictures in one frame. Produce a single, undivided photograph of ONE scene only — no panels, no grid, no split frame, no insets, no borders.";
