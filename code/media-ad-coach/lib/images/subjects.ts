/**
 * ISS-038 — what a generated gallery image should be OF.
 *
 * FEA-117 anchored filler images to the business's own service names. On real
 * scraped sites those names are frequently unusable: audit 7a395962's derived
 * services were `"Küchenentlüftungen     BAD"`,
 * `"SANITÄRINSTALLATIONENSanitärinstallationen im Alt"` and
 * `"Erneuerung Ihrer Heizungsanlage LÜFTUNGSTECHNIKInstallation von Bad"` —
 * run-on fragments of a navigation menu, glued words, truncated mid-phrase.
 * Feeding those into an image prompt as "the subject" produces nonsense, and
 * running out of them stopped the gallery short of its minimum.
 *
 * So subjects now come from two places, in order:
 *   1. the business's OWN service names — but only the ones that read like a
 *      service a human would say out loud (`isUsableSubject`);
 *   2. a curated per-trade library of business-relevant scenes (tools,
 *      equipment, materials, work in progress) — always enough to fill the
 *      gallery, always about this trade's actual work.
 *
 * Human decision 2026-07-22: a filler does NOT have to name a real service. It
 * has to be relevant to the business and DIFFERENT from the other images.
 */
import type { ImageCategory, Trade } from "../schemas";

export interface SubjectPick {
  category: ImageCategory;
  subject: string;
}

/** Rejects scraped fragments that read like menu debris rather than a service:
 *  too long/short, ALL-CAPS shouting, glued words ("…ENSanitär…"), collapsed
 *  navigation runs, or a phrase cut off mid-thought. Deliberately strict — the
 *  curated library below is a better fallback than a bad real string. */
export function isUsableSubject(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const subject = raw.trim();
  if (subject.length < 4 || subject.length > 40) return false;
  if (/\s{2,}/.test(subject)) return false; // collapsed layout runs
  if (!/[a-zäöüß]/.test(subject)) return false; // no lowercase at all = shouting
  // Any shouted token (3+ capitals) marks scraped navigation debris:
  // "SANITÄRINSTALLATIONEN", and the trailing "BAD" in "Küchenentlüftungen BAD".
  // A real service name that happens to contain an acronym simply loses to the
  // curated library below, which is the better picture anyway.
  if (/\b[A-ZÄÖÜ]{3,}\b/.test(subject)) return false;
  if (/[a-zäöüß][A-ZÄÖÜ]/.test(subject)) return false; // glued words
  if (/\b(im|in|von|für|und|der|die|das|mit|bei)$/i.test(subject)) return false; // cut mid-phrase
  return true;
}

/** Curated, business-relevant scenes per trade: the shot list a marketing
 *  photographer would come back with after a day on the job. Each entry pairs
 *  a concrete subject with the category it belongs to, so variety is built in
 *  rather than hoped for. Ordered most-persuasive first. */
const SUBJECT_LIBRARY: Record<Trade, readonly SubjectPick[]> = {
  plumber: [
    { category: "work_result", subject: "a freshly installed bathroom with new fittings" },
    { category: "craft_detail", subject: "close-up of soldered copper pipe joints" },
    { category: "equipment", subject: "a pipe wrench and fitting tools laid out on a work surface" },
    { category: "work_result", subject: "a newly mounted water heater in a utility room" },
    { category: "craft_detail", subject: "a modern mixer tap running clear water" },
    { category: "equipment", subject: "a drain-cleaning machine ready for a callout" },
    { category: "storefront", subject: "the inside of a service van stocked with copper pipe, fittings and tool cases" },
    { category: "work_result", subject: "a renovated heating system with neat pipework" },
  ],
  electrician: [
    { category: "work_result", subject: "a newly installed consumer unit, neatly labelled" },
    { category: "craft_detail", subject: "close-up of neatly routed and terminated wiring" },
    { category: "equipment", subject: "a multimeter and hand tools laid out on a work surface" },
    { category: "work_result", subject: "modern lighting installed in a finished room" },
    { category: "craft_detail", subject: "a socket being fitted flush into fresh plaster" },
    { category: "equipment", subject: "a cable drum and testing gear in the service van" },
    { category: "storefront", subject: "the inside of a service van stocked with cable drums, conduit and test gear" },
    { category: "work_result", subject: "an EV wall charger mounted beside a driveway" },
  ],
  roofing: [
    { category: "work_result", subject: "a finished tiled roof seen from ground level" },
    { category: "craft_detail", subject: "close-up of new tiles laid in neat rows" },
    { category: "equipment", subject: "roofing tools and safety harness staged on site" },
    { category: "work_result", subject: "new guttering and flashing on a house" },
    { category: "craft_detail", subject: "a ridge detail sealed against the weather" },
    { category: "equipment", subject: "scaffolding set up against a residential roof" },
    { category: "storefront", subject: "a work vehicle loaded with roof tiles, battens and ladders before a job" },
    { category: "work_result", subject: "a repaired roof section blending into the old tiles" },
  ],
  handyman: [
    { category: "work_result", subject: "a repaired and repainted interior door" },
    { category: "craft_detail", subject: "close-up of clean joinery and fresh sealant" },
    { category: "equipment", subject: "a cordless drill and hand tools laid out neatly" },
    { category: "work_result", subject: "newly mounted shelving on a living-room wall" },
    { category: "craft_detail", subject: "a tiled splashback finished with even grout lines" },
    { category: "equipment", subject: "a well-organised toolbox open on a work surface" },
    { category: "storefront", subject: "the inside of a service van stocked with toolboxes, timber and a step ladder" },
    { category: "work_result", subject: "a tidy room after a small renovation job" },
  ],
  doctor: [
    { category: "storefront", subject: "a bright, welcoming practice reception" },
    { category: "equipment", subject: "a tidy consultation room with modern equipment" },
    { category: "storefront", subject: "a comfortable waiting area with natural light" },
    { category: "craft_detail", subject: "a clean instrument tray, neatly prepared" },
    { category: "equipment", subject: "a modern diagnostic device in a treatment room" },
    { category: "storefront", subject: "the practice entrance seen from the street" },
    { category: "work_result", subject: "an accessible, step-free practice entrance" },
    { category: "craft_detail", subject: "a hygienic hand-wash station in use" },
  ],
  other: [
    { category: "work_result", subject: "a finished job the customer is happy with" },
    { category: "craft_detail", subject: "close-up of the finished work's detail and materials" },
    { category: "equipment", subject: "the professional tools of the trade, laid out neatly" },
    { category: "work_result", subject: "a second completed job in a different setting" },
    { category: "craft_detail", subject: "a quality detail that shows careful workmanship" },
    { category: "equipment", subject: "the inside of a fully equipped work vehicle" },
    { category: "storefront", subject: "the business's own working premises with its equipment and stock in view" },
    { category: "work_result", subject: "work in progress on a real customer job" },
  ],
};

function normalize(subject: string): string {
  return subject.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Picks `count` DIFFERENT subjects for gallery fillers: the business's own
 * usable service names first (rotated across the categories that sell work),
 * then the curated per-trade library. Never returns a subject already in
 * `used`, and never the same subject twice — but it does not stop early just
 * because the business named few services, which is exactly what left the
 * gallery at one image.
 */
export function pickFillerSubjects(input: {
  trade: Trade;
  services: readonly string[];
  count: number;
  used: ReadonlySet<string>;
  /** Categories already claimed by the channel plans, so a filler prefers
   *  something the page does not have yet. */
  claimed: ReadonlySet<ImageCategory>;
}): SubjectPick[] {
  const picks: SubjectPick[] = [];
  const taken = new Set<string>([...input.used].map(normalize));
  const rotation: ImageCategory[] = ["work_result", "craft_detail", "equipment"];

  const add = (category: ImageCategory, subject: string): void => {
    const key = normalize(subject);
    if (taken.has(key)) return;
    taken.add(key);
    picks.push({ category, subject });
  };

  // 1. The business's own words, when they are actually words.
  for (const service of input.services.filter(isUsableSubject)) {
    if (picks.length >= input.count) break;
    add(rotation[picks.length % rotation.length]!, service);
  }

  // 2. The curated library — preferring categories the page has not claimed
  //    yet, then anything else that is still distinct.
  const library = SUBJECT_LIBRARY[input.trade] ?? SUBJECT_LIBRARY.other;
  for (const pass of [0, 1]) {
    for (const entry of library) {
      if (picks.length >= input.count) break;
      const unclaimed = !input.claimed.has(entry.category) && !picks.some((p) => p.category === entry.category);
      if (pass === 0 && !unclaimed) continue;
      add(entry.category, entry.subject);
    }
  }

  return picks.slice(0, input.count);
}
