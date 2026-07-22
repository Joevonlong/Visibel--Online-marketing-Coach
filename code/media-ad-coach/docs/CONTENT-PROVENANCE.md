# Content provenance and privacy

The recorded REPLAY fixture is a non-commercial hackathon demonstration of a
website audit. It does not claim ownership of third-party business content.

## Anonymization for publication (2026-07-22)

The LIVE audit behind the REPLAY fixture ran against a real Berlin small
business, read-only (no login, no form submission, no access-control bypass).
Before this repository was published, every identifying detail was replaced:

- The business name, phone number, address, website URL, asset URLs, Google
  Maps tokens, and all quoted site text in `lib/fixtures/replay-audit.json`
  were replaced with the fictional **"Rohrfuchs Berlin"** persona. All fictional
  domains use the reserved `.example` TLD and never resolve.
- The eight harvested source photographs (`before-1.jpg` … `before-8.jpg` in
  `public/fixtures/rohrfuchs-berlin-replay/`) were replaced with synthetic
  gradient placeholder images at the original dimensions — no third-party
  image binary is distributed in this repository.
- The provider photo-edit output (`after-image-fixes.png`) derived from a real
  photograph, so it too is a synthetic gradient placeholder; its asset record
  in the fixture carries a publication note saying so.
- The three remaining `after-*.png` files are unmodified `ai_concept`
  generations from prompts that requested "no text, no logos"; they depict no
  real business, staff, work, or outcomes and are labeled `AI concept` in the
  UI.
- A full-page LIVE screenshot is not redistributed. Only its dimensions,
  byte size, capture time context, and SHA-256 are retained in
  `docs/LIVE-ACCEPTANCE-EVIDENCE.md`.

The same anonymization applies across `docs/` and `tests/`: every business
name, contact detail, Maps link, review snippet, and verbatim site quote that
appears in this repository is a fictional stand-in for the real capture. The
structure of the evidence (scores, timings, failure modes, DOM shapes) is
real; the identities are not.

This provenance record is not a license or an assertion of consent — which is
exactly why no identifying or re-identifiable third-party material is
distributed here.
