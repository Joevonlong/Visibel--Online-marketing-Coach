<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="code/media-ad-coach/docs/media/readme/wordmark-dark.svg" />
  <img src="code/media-ad-coach/docs/media/readme/wordmark-light.svg" alt="Visibel" width="240" />
</picture>

**From zero to hero.**

Visibel audits how customers actually see a local business online — website, Google Maps listing, and search presence — scores it against a fixed rubric, and rebuilds it in one click.

[![Product Page](https://img.shields.io/badge/Product%20Page-Live-b5502e?style=for-the-badge&logo=googlechrome&logoColor=white)](https://joevonlong.github.io/Visibel--Online-marketing-Coach/)

<br/>

![Next.js](https://img.shields.io/badge/Next.js_15.5-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19.1-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=flat-square&logo=openai&logoColor=white)
![Tavily](https://img.shields.io/badge/Tavily-1f2937?style=flat-square)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat-square&logo=playwright&logoColor=white)
![Vitest](https://img.shields.io/badge/519_tests_passing-6E9F18?style=flat-square&logo=vitest&logoColor=white)

<a href="code/media-ad-coach/README.md"><img src="code/media-ad-coach/docs/media/readme/01-hero-before-after.jpg" alt="Split view: the audited site today next to the Visibel-generated optimized page" width="100%" /></a>

<sub><i>The recorded demo audit (a REPLAY of a real LIVE run, republished under a fictional business persona). Left: what customers see today. Right: the page Visibel wrote and illustrated in one click.</i></sub>

</div>

---

## What it does

A local business has one shot at a first impression: a Maps listing with no hours and no photos, a
website from 2009, three blurry pictures of a wall. The owner knows it looks bad. They don't know
**what** to fix, in what order, or how the fixed version would look.

Visibel takes three links — website, Google Maps, directory listing — and returns a **visibility score
out of 100**, backed by the exact quotes and photos costing the business trust. Two AI experts read the
page the way a customer would: one scores the copy, one scores every image. A deterministic rubric
engine turns those sub-scores into totals, bands, and a ranked list of what to fix. Then **one button
rewrites everything and generates the missing photography**, so the business sees its own optimized
page side by side with the real one.

## Key features

- **Live Google Business Profile corroboration** — a bare Maps link is read live; present fields are ticked, missing ones flagged, unprovable ones left `NOT VERIFIED`.
- **Deterministic rubric engine** — every score, band, and priority comes from plain TypeScript, never a model.
- **One-click full-page optimization** — a single action rewrites copy, layout, and imagery across every channel.
- **Async streamed image generation** — the report renders immediately; AI concept photos land in the open page as they finish.
- **Image semantics, not just pixels** — generated and harvested photos are classified and filled against a per-trade composition plan, so the gallery never repeats a shot.
- **Honest degradation** — a failed provider call surfaces as an error, never as silently substituted content.
- **Zero-key demo path** — a recorded replay mode runs the whole product with no network calls and no API keys.
- **PDF export & shareable preview** — the audit exports as a report; the optimized page is a real, addressable site.

## Project structure

```
code/media-ad-coach/   Product application — Next.js/React/TypeScript, full README with setup,
                        architecture, and screenshots
docs/                   Official event materials and the frozen event-time implementation plan
```

## Quick start

Full setup, environment variables, and the zero-key demo mode live in the product's own README:
**[`code/media-ad-coach/README.md`](code/media-ad-coach/README.md)**

```bash
cd code/media-ad-coach
pnpm install
cp .env.example .env
pnpm dev                    # http://localhost:3000

# no API keys? everything still runs:
DEMO_MODE=replay pnpm dev
```

## Team

<table>
<tr>
<td align="center" width="150">
<a href="https://github.com/ioonp">
<img src="https://github.com/ioonp.png?size=88" width="88" height="88" alt="Ion Iapara" style="border-radius:50%" />
<br /><b>Ion Iapara</b>
</a>
<br /><sub><a href="https://github.com/ioonp">@ioonp</a></sub>
</td>
<td align="center" width="150">
<a href="https://github.com/yuey89">
<img src="https://github.com/yuey89.png?size=88" width="88" height="88" alt="Yueyin" style="border-radius:50%" />
<br /><b>Yueyin</b>
</a>
<br /><sub><a href="https://github.com/yuey89">@yuey89</a></sub>
</td>
<td align="center" width="150">
<a href="https://github.com/Joevonlong">
<img src="https://github.com/Joevonlong.png?size=88" width="88" height="88" alt="Zhou Long" style="border-radius:50%" />
<br /><b>Zhou Long</b>
</a>
<br /><sub><a href="https://github.com/Joevonlong">@Joevonlong</a></sub>
</td>
</tr>
</table>

---

<div align="center">
<sub>Built at <b>{Tech: Europe} × Almedia — "The Summer Lock-In"</b>, Berlin.</sub>
</div>
