/**
 * ISS-035 — cheap perceptual fingerprints, so two pictures of the SAME thing
 * can be recognised as the same thing even when no lineage links them.
 *
 * Lineage (an edited image knows its `source_asset_id`) covers the common case
 * and is exact. It does not cover "the same scene photographed twice" or the
 * same file harvested under two URLs, which is why this exists as a second,
 * defensive layer.
 *
 * The fingerprint is a classic 8x8 average hash: downscale to 8x8 greyscale,
 * then set one bit per pixel for "brighter than the frame's mean". It is
 * computed once, at the same point an image is classified or generated, and
 * stored on the asset — composition itself stays pure and synchronous.
 *
 * Known limits, stated rather than hidden: an average hash is robust to
 * rescaling, re-encoding and small edits, and is NOT robust to crops, flips or
 * heavy recolouring. It is a duplicate detector, not an image-similarity
 * engine. A missed near-duplicate degrades to today's behaviour (both shown);
 * it never removes an image it cannot prove is a duplicate.
 */
import sharp from "sharp";

/** 64-bit hash rendered as 16 hex characters. */
export type ImageFingerprint = string;

/** Two fingerprints within this many differing bits are treated as the same
 *  picture. 5/64 tolerates re-encoding and mild edits while staying well clear
 *  of genuinely different photos of the same room, which typically differ by
 *  15+ bits. */
export const NEAR_DUPLICATE_MAX_DISTANCE = 5;

/** Computes the average hash of an image file, or `null` when the file cannot
 *  be read or decoded — never throws, because a fingerprint is an optimisation
 *  and must never break an audit. */
export async function computeFingerprint(filePath: string): Promise<ImageFingerprint | null> {
  try {
    const raw = await sharp(filePath).greyscale().resize(8, 8, { fit: "fill" }).raw().toBuffer();
    if (raw.length < 64) return null;
    let sum = 0;
    for (let i = 0; i < 64; i++) sum += raw[i]!;
    const mean = sum / 64;

    let hex = "";
    for (let nibble = 0; nibble < 16; nibble++) {
      let value = 0;
      for (let bit = 0; bit < 4; bit++) {
        value = (value << 1) | (raw[nibble * 4 + bit]! > mean ? 1 : 0);
      }
      hex += value.toString(16);
    }
    return hex;
  } catch {
    return null;
  }
}

const HEX_BIT_COUNT: Readonly<Record<string, number>> = {
  "0": 0, "1": 1, "2": 1, "3": 2, "4": 1, "5": 2, "6": 2, "7": 3,
  "8": 1, "9": 2, a: 2, b: 3, c: 2, d: 3, e: 3, f: 4,
};

/** Differing-bit count between two fingerprints; `null` when they are not
 *  comparable (missing or malformed), so callers can tell "different" from
 *  "unknown" instead of guessing. */
export function fingerprintDistance(a: unknown, b: unknown): number | null {
  if (typeof a !== "string" || typeof b !== "string") return null;
  if (a.length !== 16 || b.length !== 16) return null;
  let distance = 0;
  for (let i = 0; i < 16; i++) {
    const xor = (parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16)).toString(16);
    const bits = HEX_BIT_COUNT[xor];
    if (bits === undefined) return null;
    distance += bits;
  }
  return distance;
}

/** True only when both fingerprints exist AND are close enough. Unknown is
 *  never treated as duplicate. */
export function isNearDuplicate(a: unknown, b: unknown): boolean {
  const distance = fingerprintDistance(a, b);
  return distance !== null && distance <= NEAR_DUPLICATE_MAX_DISTANCE;
}
