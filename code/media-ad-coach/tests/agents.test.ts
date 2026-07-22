import { InternalServerError, RateLimitError, type OpenAI } from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BusinessDescriptionRewrite,
  CopyStrategistOutput,
  CtaContactRewrite,
  GbpExtractionOutput,
  HeroHeadlineRewrite,
  LegalFooterRewrite,
  PlatformConsistencyRewrite,
  ServicesCopyRewrite,
  SynthesizerOutput,
  VisualDirectorOutput,
} from "../lib/schemas";
import { AgentCallError, __resetOpenAIClientForTests, getOpenAIClient, structuredCall } from "../lib/agents/openai";
import {
  buildImageGenPrompt,
  COPY_STRATEGIST_SYSTEM,
  DOCTOR_COMPLIANCE_INSTRUCTION,
  GBP_EXTRACTION_SYSTEM,
  IMAGE_GEN_TEMPLATES,
  parseServices,
  REWRITER_SYSTEM,
  SYNTHESIZER_SYSTEM,
  VISUAL_DIRECTOR_SYSTEM,
} from "../lib/agents/prompts";
import { runCopyStrategist, runGbpExtraction, runSynthesizer, runVisualDirector } from "../lib/agents/experts";
import type { Report } from "../lib/schemas";

const ORIGINAL_API_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  __resetOpenAIClientForTests();
});

afterEach(() => {
  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = ORIGINAL_API_KEY;
  }
  __resetOpenAIClientForTests();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Structured Outputs conversion works for every model-facing schema
// ---------------------------------------------------------------------------

describe("zodResponseFormat strict-mode conversion", () => {
  const modelFacingSchemas = {
    CopyStrategistOutput,
    VisualDirectorOutput,
    SynthesizerOutput,
    GbpExtractionOutput,
    HeroHeadlineRewrite,
    BusinessDescriptionRewrite,
    ServicesCopyRewrite,
    CtaContactRewrite,
    LegalFooterRewrite,
    PlatformConsistencyRewrite,
  };

  function assertStrictCompatible(schemaObject: Record<string, unknown>): void {
    // Strict mode's hard requirement: every object node is closed and lists
    // every one of its properties as required (no optional keys allowed).
    if (schemaObject.type === "object") {
      expect(schemaObject.additionalProperties).toBe(false);
      const properties = (schemaObject.properties ?? {}) as Record<string, unknown>;
      expect(schemaObject.required).toEqual(Object.keys(properties));
    }
    // Unsupported keyword that would silently fail strict mode.
    expect(schemaObject).not.toHaveProperty("contentEncoding");
    for (const value of Object.values(schemaObject)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object") assertStrictCompatible(item as Record<string, unknown>);
        }
      } else if (value && typeof value === "object") {
        assertStrictCompatible(value as Record<string, unknown>);
      }
    }
  }

  for (const [name, schema] of Object.entries(modelFacingSchemas)) {
    it(`builds a strict-mode response_format for ${name}`, () => {
      const format = zodResponseFormat(schema as never, name);
      expect(format.json_schema.strict).toBe(true);
      expect(format.json_schema.name).toBe(name);
      const jsonSchema = format.json_schema.schema as Record<string, unknown>;
      expect(jsonSchema.type).toBe("object");
      assertStrictCompatible(jsonSchema);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Zero-evidence deterministic paths — no model call, no API key needed
// ---------------------------------------------------------------------------

describe("zero-evidence deterministic paths", () => {
  it("runCopyStrategist with no text evidence returns an all-absent output without calling OpenAI", async () => {
    expect(process.env.OPENAI_API_KEY).toBeUndefined();

    const result = await runCopyStrategist({
      textEvidence: [],
      trade: "plumber",
      city: "Berlin",
      findability: null,
    });

    const parsed = CopyStrategistOutput.parse(result);
    expect(parsed.criteria).toHaveLength(8);
    expect(parsed.criteria.map((c) => c.id)).toEqual(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"]);
    for (const criterion of parsed.criteria) {
      expect(criterion.score).toBe(0);
      expect(criterion.source).toBe("absent");
    }
    expect(parsed.findings).toEqual([]);
  });

  it("runVisualDirector with no images returns every coverage gap without calling OpenAI", async () => {
    expect(process.env.OPENAI_API_KEY).toBeUndefined();

    const result = await runVisualDirector({ images: [], trade: "roofing" });

    const parsed = VisualDirectorOutput.parse(result);
    expect(parsed.images).toEqual([]);
    expect(parsed.red_flags).toEqual([]);
    expect(new Set(parsed.coverage_gaps)).toEqual(
      new Set(["hero_shot", "team_shot", "work_proof_shot", "branding_shot"]),
    );
  });

  it("runGbpExtraction with no screenshots returns an all-null output without calling OpenAI", async () => {
    expect(process.env.OPENAI_API_KEY).toBeUndefined();

    const result = await runGbpExtraction({ screenshots: [] });

    expect(GbpExtractionOutput.parse(result)).toEqual({
      review_count: null,
      rating: null,
      has_photo_reviews: null,
      description: null,
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Prompt library sanity
// ---------------------------------------------------------------------------

describe("prompt library", () => {
  it("Copy Strategist system prompt mentions every T1-T8 criterion id", () => {
    for (const id of ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"]) {
      expect(COPY_STRATEGIST_SYSTEM).toContain(id);
    }
  });

  it("Visual Director system prompt mentions every I1-I6 criterion id", () => {
    for (const id of ["I1", "I2", "I3", "I4", "I5", "I6"]) {
      expect(VISUAL_DIRECTOR_SYSTEM).toContain(id);
    }
  });

  it("Synthesizer system prompt forbids changing numbers and forces memory_note to null", () => {
    expect(SYNTHESIZER_SYSTEM.toLowerCase()).toContain("memory_note");
    expect(SYNTHESIZER_SYSTEM).toMatch(/not alter any score or ranking/i);
  });

  it("GBP extraction system prompt instructs null-over-guess", () => {
    expect(GBP_EXTRACTION_SYSTEM.toLowerCase()).toContain("null");
  });

  it("Rewriter system prompt names the requested channel and trade", () => {
    const prompt = REWRITER_SYSTEM("hero_headline", "plumber", "Berlin");
    expect(prompt).toContain("hero_headline");
    expect(prompt).toContain("plumber");
    expect(prompt).toContain("Berlin");
  });

  it("Rewriter system prompt adds the doctor compliance line only for doctor trade", () => {
    const doctorPrompt = REWRITER_SYSTEM("business_description", "doctor", "Munich");
    expect(doctorPrompt).toContain(DOCTOR_COMPLIANCE_INSTRUCTION);

    const plumberPrompt = REWRITER_SYSTEM("business_description", "plumber", "Munich");
    expect(plumberPrompt).not.toContain(DOCTOR_COMPLIANCE_INSTRUCTION);
  });

  it("Copy Strategist system prompt carries the doctor compliance instruction", () => {
    expect(COPY_STRATEGIST_SYSTEM).toContain(DOCTOR_COMPLIANCE_INSTRUCTION);
  });

  it("every IMAGE_GEN_TEMPLATE mentions 'no text' and 'no logos'", () => {
    for (const [trade, variants] of Object.entries(IMAGE_GEN_TEMPLATES)) {
      for (const [variant, prompt] of Object.entries(variants)) {
        expect(prompt.toLowerCase(), `${trade}/${variant}`).toContain("no text");
        expect(prompt.toLowerCase(), `${trade}/${variant}`).toContain("no logos");
      }
    }
  });

  it("doctor IMAGE_GEN_TEMPLATEs stay non-clinical", () => {
    for (const prompt of Object.values(IMAGE_GEN_TEMPLATES.doctor)) {
      expect(prompt.toLowerCase()).toContain("no medical claims imagery");
    }
  });

  it("covers all six trades", () => {
    expect(Object.keys(IMAGE_GEN_TEMPLATES).sort()).toEqual(
      ["doctor", "electrician", "handyman", "other", "plumber", "roofing"].sort(),
    );
  });
});

// ISS-016: image-generation prompts must be COMPOSED from the real business
// context, with zero cross-trade leakage. A non-plumbing business (the FEA-104
// common path: custom types -> trade="other") must never inherit plumber
// imagery, and an unknown trade must derive its scene from the business's own
// words, never a tradesperson default.
describe("buildImageGenPrompt — business-composed, no cross-trade leakage (ISS-016)", () => {
  const PLUMBING_TERMS = /(plumb|pipe|pipework|fixture|fuse|cabling|switchboard|roof|shingle|service van|workwear|tradesperson)/i;
  const VARIANTS = ["hero", "team", "work_proof"] as const;

  const CAFE = {
    brand_name: "Café Löwenzahn",
    city: "Berlin",
    background: "A cozy neighbourhood café and bakery serving specialty coffee, fresh pastries, and vegan brunch",
  };
  const RETAIL = {
    brand_name: "Nordlicht Concept Store",
    city: "Hamburg",
    background: "An independent retail boutique selling Scandinavian home decor, ceramics, and gifts",
  };
  const PLUMBER = { brand_name: "Sanitär Krause Berlin", city: "Berlin", background: "Bad- und Heizungsinstallation seit 1998" };

  it("café (trade=other) prompts carry the café's own context and zero plumbing terms", () => {
    for (const variant of VARIANTS) {
      const prompt = buildImageGenPrompt("other", variant, CAFE);
      expect(prompt).toContain("Café Löwenzahn");
      expect(prompt).toContain("Berlin");
      expect(prompt.toLowerCase()).toContain("café"); // its own words are present
      expect(prompt.toLowerCase()).toContain("coffee");
      expect(prompt, `café/${variant} leaked a cross-trade term`).not.toMatch(PLUMBING_TERMS);
      expect(prompt.toLowerCase()).toContain("no logos");
    }
  });

  it("retail shop (trade=other) prompts carry the shop's own context and zero plumbing terms", () => {
    for (const variant of VARIANTS) {
      const prompt = buildImageGenPrompt("other", variant, RETAIL);
      expect(prompt).toContain("Nordlicht Concept Store");
      expect(prompt.toLowerCase()).toContain("boutique");
      expect(prompt, `retail/${variant} leaked a cross-trade term`).not.toMatch(PLUMBING_TERMS);
    }
  });

  it("plumber (known trade) still gets grounded plumbing imagery — the trade path is unchanged", () => {
    const prompt = buildImageGenPrompt("plumber", "hero", PLUMBER);
    expect(prompt).toContain("Sanitär Krause Berlin");
    expect(prompt).toContain("Berlin");
    expect(prompt.toLowerCase()).toContain("plumber");
    expect(prompt).toContain("Do not render any text, signage, or logos");
  });

  it("an 'other' business with no context stays trade-neutral — never a plumber default", () => {
    const prompt = buildImageGenPrompt("other", "hero");
    expect(prompt).not.toMatch(PLUMBING_TERMS);
    expect(prompt.toLowerCase()).toContain("local independent business");
    expect(prompt.toLowerCase()).toContain("no logos");
  });
});

// ISS-016 (refinement): prompts must be SERVICE-LEVEL and ad-grade, not
// category-level — enumerate the business's actual named services and anchor a
// DISTINCT service per shot, written like a commercial ad brief.
describe("buildImageGenPrompt — service-level, ad-grade, distinct-service coverage (ISS-016)", () => {
  const PLUMBER_MULTI = {
    brand_name: "AquaFix",
    city: "Berlin",
    background: "bathtub installation, sink installation, heating repair",
  };

  it("names the business's specific services (not just 'a plumber'), anchoring distinct ones per shot", () => {
    const hero = buildImageGenPrompt("plumber", "hero", PLUMBER_MULTI);
    const workProof = buildImageGenPrompt("plumber", "work_proof", PLUMBER_MULTI);

    // Service-level specifics appear, not a generic "plumber with a wrench".
    expect(hero).toContain("bathtub installation");
    expect(hero).toContain('in-progress moment of "bathtub installation"');
    // work_proof foregrounds a DIFFERENT real service — the set covers distinct services.
    expect(workProof).toContain('finished result of "sink installation"');
    expect(hero).not.toContain('finished result of "sink installation"');
    expect(workProof).not.toContain('in-progress moment of "bathtub installation"');
    // The full offering is enumerated in every prompt for grounding.
    expect(hero).toContain("heating repair");
  });

  it("uses services enumerated from scraped evidence (passed as `services`) for a café — no cross-trade leakage", () => {
    const cafe = {
      brand_name: "Café Löwenzahn",
      city: "Berlin",
      background: "cozy neighbourhood café",
      services: ["latte art", "fresh pastries", "vegan brunch"],
    };
    const hero = buildImageGenPrompt("other", "hero", cafe);
    const workProof = buildImageGenPrompt("other", "work_proof", cafe);

    expect(hero).toContain("latte art");
    expect(hero).toContain('in-progress moment of "latte art"');
    expect(workProof).toContain('finished result of "fresh pastries"');
    expect(hero).not.toMatch(/(plumb|pipe|fixture|workwear|service van)/i);
  });

  it("reads like an ad brief — carries concrete commercial-photography direction", () => {
    const hero = buildImageGenPrompt("plumber", "hero", PLUMBER_MULTI);
    expect(hero.toLowerCase()).toContain("commercial");
    expect(hero.toLowerCase()).toMatch(/composition|depth of field|lighting|advertising/);
  });

  it("anti-monotony: two different businesses in the same category get different prompts", () => {
    const a = buildImageGenPrompt("other", "hero", { brand_name: "Bean There", services: ["single-origin espresso"] });
    const b = buildImageGenPrompt("other", "hero", { brand_name: "Book Nook", services: ["rare book restoration"] });
    expect(a).not.toEqual(b);
    expect(a).toContain("single-origin espresso");
    expect(b).toContain("rare book restoration");
  });

  it("parseServices splits declared/scraped offerings into clean phrases (drops leaders and tenure)", () => {
    expect(parseServices("Wir bieten: Heizung, Bad, Rohrreinigung")).toEqual(["Heizung", "Bad", "Rohrreinigung"]);
    expect(parseServices("bathtub installation and sink installation")).toEqual([
      "bathtub installation",
      "sink installation",
    ]);
    expect(parseServices("Bad- und Heizungsinstallation seit 1998")).toEqual(["Bad", "Heizungsinstallation"]);
    expect(parseServices("")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. structuredCall retry logic with an injected fake client
// ---------------------------------------------------------------------------

function fakeCompletion(content: string) {
  return { choices: [{ message: { content } }] } as never;
}

function fakeClient(create: (...args: unknown[]) => unknown) {
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

const TestSchema = SynthesizerOutput; // any model-facing zod object works here

describe("structuredCall retry logic (fake client, no network)", () => {
  it("succeeds on the first attempt when the model returns valid JSON", async () => {
    const valid = JSON.stringify({ executive_summary: "ok", channel_one_liners: [], memory_note: null });
    const create = vi.fn().mockResolvedValue(fakeCompletion(valid));

    const result = await structuredCall({
      schema: TestSchema,
      schemaName: "synthesizer_output",
      system: "sys",
      user: "user",
      client: fakeClient(create),
    });

    expect(result.executive_summary).toBe("ok");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once after malformed JSON, then succeeds", async () => {
    const valid = JSON.stringify({ executive_summary: "ok", channel_one_liners: [], memory_note: null });
    const create = vi.fn().mockResolvedValueOnce(fakeCompletion("{not json")).mockResolvedValueOnce(fakeCompletion(valid));

    const result = await structuredCall({
      schema: TestSchema,
      schemaName: "synthesizer_output",
      system: "sys",
      user: "user",
      client: fakeClient(create),
    });

    expect(result.executive_summary).toBe("ok");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("retries exactly once after a schema validation failure, then succeeds", async () => {
    const invalidShape = JSON.stringify({ nope: true });
    const valid = JSON.stringify({ executive_summary: "ok", channel_one_liners: [], memory_note: null });
    const create = vi
      .fn()
      .mockResolvedValueOnce(fakeCompletion(invalidShape))
      .mockResolvedValueOnce(fakeCompletion(valid));

    const result = await structuredCall({
      schema: TestSchema,
      schemaName: "synthesizer_output",
      system: "sys",
      user: "user",
      client: fakeClient(create),
    });

    expect(result.executive_summary).toBe("ok");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("retries exactly once after a 429 rate limit, then succeeds", async () => {
    const valid = JSON.stringify({ executive_summary: "ok", channel_one_liners: [], memory_note: null });
    const rateLimitError = new RateLimitError(429, { message: "slow down" }, "rate limited", new Headers());
    const create = vi.fn().mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce(fakeCompletion(valid));

    const result = await structuredCall({
      schema: TestSchema,
      schemaName: "synthesizer_output",
      system: "sys",
      user: "user",
      client: fakeClient(create),
    });

    expect(result.executive_summary).toBe("ok");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("retries exactly once after a 5xx, then throws AgentCallError if it fails again", async () => {
    const serverError = new InternalServerError(500, { message: "boom" }, "server error", new Headers());
    const create = vi.fn().mockRejectedValue(serverError);

    await expect(
      structuredCall({
        schema: TestSchema,
        schemaName: "synthesizer_output",
        system: "sys",
        user: "user",
        client: fakeClient(create),
      }),
    ).rejects.toBeInstanceOf(AgentCallError);

    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws AgentCallError with provider/stage/cause after two malformed responses", async () => {
    const create = vi.fn().mockResolvedValue(fakeCompletion("{not json"));

    let caught: unknown;
    try {
      await structuredCall({
        schema: TestSchema,
        schemaName: "synthesizer_output",
        stage: "custom_stage",
        system: "sys",
        user: "user",
        client: fakeClient(create),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AgentCallError);
    const agentError = caught as AgentCallError;
    expect(agentError.provider).toBe("openai");
    expect(agentError.stage).toBe("custom_stage");
    expect(agentError.cause).toBeDefined();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable error (immediate AgentCallError, single attempt)", async () => {
    const create = vi.fn().mockRejectedValue(new Error("totally unrelated failure"));

    await expect(
      structuredCall({
        schema: TestSchema,
        schemaName: "synthesizer_output",
        system: "sys",
        user: "user",
        client: fakeClient(create),
      }),
    ).rejects.toBeInstanceOf(AgentCallError);

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("getOpenAIClient throws AgentCallError immediately when OPENAI_API_KEY is unset", () => {
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
    expect(() => getOpenAIClient()).toThrow(AgentCallError);
  });

  it("structuredCall without an injected client and without an API key fails clearly, never silently", async () => {
    expect(process.env.OPENAI_API_KEY).toBeUndefined();

    await expect(
      structuredCall({
        schema: TestSchema,
        schemaName: "synthesizer_output",
        system: "sys",
        user: "user",
      }),
    ).rejects.toBeInstanceOf(AgentCallError);
  });
});

// ---------------------------------------------------------------------------
// 5. Synthesizer merges memory_note deterministically, never trusts the model
// ---------------------------------------------------------------------------

describe("runSynthesizer memory_note enforcement", () => {
  const baseReport: Omit<Report, "executive_summary" | "memory_note"> = {
    overall_score: 39,
    band: "Weak",
    text: { score: 30, criteria: [] },
    images: { score: 48, criteria_by_asset: {}, coverage_gaps: [] },
    findability: { status: "not_found", results: [], source: "tavily" },
    presence_coverage: { website: true, maps: false, yellow_pages: false, other_count: 0, nap_consistent: null },
    reputation_chips: null,
    findings: [],
    channels: [],
    execution_mode: "REPLAY",
    disclaimers: [],
  };

  it("attaches the exact memory template when memoryHits has count >= 1, ignoring whatever the model returned", async () => {
    const modelOutput = JSON.stringify({
      executive_summary: "Summary.",
      channel_one_liners: [],
      memory_note: { text: "the model tried to write its own memory line", similar_count: 999 },
    });
    const create = vi.fn().mockResolvedValue(fakeCompletion(modelOutput));

    // runSynthesizer always uses the real getOpenAIClient()/structuredCall path,
    // so we exercise it through structuredCall directly with an injected client
    // is not possible for runSynthesizer (no client param) — instead verify the
    // deterministic merge helper indirectly is exercised by giving it a key and
    // stubbing the module's own OpenAI client.
    process.env.OPENAI_API_KEY = "test-key";
    __resetOpenAIClientForTests();
    const client = getOpenAIClient();
    client.chat.completions.create = create; // test seam: monkeypatch the cached client's create fn

    const result = await runSynthesizer({
      report: baseReport,
      memoryHits: { count: 3, weakest_lane: "images" },
    });

    expect(result.executive_summary).toBe("Summary.");
    expect(result.memory_note).toEqual({
      text: "Compared to 3 similar businesses we audited, the weakest shared area is images",
      similar_count: 3,
    });
  });

  it("omits memory_note when memoryHits is null, even if the model tried to write one", async () => {
    const modelOutput = JSON.stringify({
      executive_summary: "Summary.",
      channel_one_liners: [],
      memory_note: { text: "should never survive", similar_count: 5 },
    });
    const create = vi.fn().mockResolvedValue(fakeCompletion(modelOutput));

    process.env.OPENAI_API_KEY = "test-key";
    __resetOpenAIClientForTests();
    const client = getOpenAIClient();
    client.chat.completions.create = create; // test seam: monkeypatch the cached client's create fn

    const result = await runSynthesizer({ report: baseReport, memoryHits: null });

    expect(result.memory_note).toBeNull();
  });
});
