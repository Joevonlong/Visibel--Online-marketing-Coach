// F-060: landing page. Server component — no data fetching, stays static.
import { ArrowUpRight } from "lucide-react";
import { FadeRise, Nav, PillButton } from "@/components/primitives";

const navLinkClass =
  "text-[15px] text-ink-secondary transition-colors duration-200 ease-out hover:text-ink";

const FEATURES = [
  {
    number: "01",
    title: "See what customers see",
    body: "One honest read across your website, listings and photos.",
  },
  {
    number: "02",
    title: "Fix what costs trust",
    body: "Clear actions, stronger copy and evidence-led image direction.",
  },
  {
    number: "03",
    title: "Compare before and after",
    body: "Review the result side by side before anything changes.",
  },
] as const;

export default function Home() {
  return (
    <>
      <Nav>
        <a href="/audit/new" className={navLinkClass}>
          Check my business
        </a>
        <a href="/history" className={navLinkClass}>
          History
        </a>
      </Nav>

      <main>
        <section className="border-b border-hairline">
          <div className="mx-auto flex min-h-[calc(100svh-72px)] w-full max-w-6xl flex-col justify-center px-5 py-20 sm:px-8 sm:py-28">
            <FadeRise>
              <p className="mb-6 text-[13px] font-semibold tracking-[0.22em] text-ink-secondary uppercase">
                From Zero to Hero
              </p>
              <h1 className="max-w-[20ch] text-[clamp(2.75rem,1.5rem+5.2vw,5.5rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-ink">
                Shine online. Win more customers.
              </h1>
              <p className="mt-7 max-w-2xl text-[19px] leading-[1.5] text-ink-secondary sm:text-[21px]">
                We audit how customers see you — on Google, Maps, and your website — and fix
                it in one click.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-5">
                <PillButton href="/audit/new" variant="primary" size="lg">
                  Check my business
                </PillButton>
                <a
                  href="/audit/sample"
                  className="group inline-flex items-center gap-1 border-b border-ink pb-0.5 text-[16px] font-medium text-ink"
                >
                  See a sample report
                  <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              </div>
              <p className="mt-6 max-w-md text-[15px] leading-[1.55] text-ink-secondary">
                Add your business basics and your website link. We analyze it and build your
                one-stop optimization plan.
              </p>
            </FadeRise>
          </div>
        </section>

        <section className="bg-surface-alt">
          <div className="mx-auto grid w-full max-w-6xl md:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <FadeRise
                key={feature.title}
                delay={index * 0.08}
                className="border-b border-hairline px-5 py-10 last:border-b-0 sm:px-8 md:border-r md:border-b-0 md:last:border-r-0 md:py-16"
              >
                <p className="text-[13px] font-semibold tracking-[0.16em] text-ink-secondary">{feature.number}</p>
                <h2 className="mt-7 max-w-[14rem] text-[24px] font-semibold leading-tight tracking-[-0.035em] text-ink">
                  {feature.title}
                </h2>
                <p className="mt-4 max-w-[17rem] text-[16px] leading-relaxed text-ink-secondary">{feature.body}</p>
              </FadeRise>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
