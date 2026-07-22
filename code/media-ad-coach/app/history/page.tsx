// F-077: history page. Reads rows straight off SQLite via listAudits() (no
// client fetch) so a page refresh proves persistence, not client cache.
import { Badge, Nav, PillButton, Section } from "@/components/primitives";
import { listAudits } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function readBusiness(businessJson: unknown): { brand_name: string; trade: string } {
  const business = (businessJson ?? {}) as { brand_name?: unknown; trade?: unknown };
  return {
    brand_name: typeof business.brand_name === "string" && business.brand_name.trim().length > 0
      ? business.brand_name
      : "Untitled business",
    trade: typeof business.trade === "string" ? business.trade : "—",
  };
}

export default function HistoryPage() {
  const audits = listAudits();

  return (
    <>
      <Nav>
        <a
          href="/audit/new"
          className="text-[15px] text-ink-secondary transition-colors duration-200 ease-out hover:text-ink"
        >
          Check my business
        </a>
      </Nav>

      <Section eyebrow="Saved work" title="History" titleAs="h1">
        {audits.length === 0 ? (
          <div className="flex flex-col items-center gap-6 rounded-2xl border border-hairline bg-surface-alt px-6 py-16 text-center">
            <p className="text-body text-ink-secondary">
              No audits yet. Run your first one to see it here.
            </p>
            <PillButton href="/audit/new" variant="primary" size="md">
              Check my business
            </PillButton>
          </div>
        ) : (
          <div className="overflow-hidden border-y border-hairline">
            <div className="hidden grid-cols-[1fr_1fr_0.6fr_0.6fr_0.8fr_0.7fr] gap-4 border-b border-hairline bg-surface-alt px-6 py-4 text-[13px] font-semibold tracking-[0.1em] text-ink-secondary uppercase md:grid">
              <span>Date</span>
              <span>Business</span>
              <span>Trade</span>
              <span>Score</span>
              <span>Status</span>
              <span>Mode</span>
            </div>
            <ul>
              {audits.map((audit) => {
                const { brand_name, trade } = readBusiness(audit.business_json);
                const isLive = audit.execution_mode === "LIVE";
                return (
                  <li key={audit.id} className="border-b border-hairline last:border-b-0">
                    <a
                      href={`/audit/${audit.id}`}
                      className="grid grid-cols-2 items-center gap-x-4 gap-y-3 px-4 py-5 text-[15px] transition-colors duration-200 ease-out hover:bg-surface-alt sm:px-6 md:grid-cols-[1fr_1fr_0.6fr_0.6fr_0.8fr_0.7fr]"
                    >
                      <span className="order-2 text-ink-secondary md:order-none">{formatDate(audit.created_at)}</span>
                      <span className="order-1 text-[17px] font-medium text-ink md:order-none md:text-[15px]">{brand_name}</span>
                      <span className="text-ink-secondary capitalize">{trade}</span>
                      <span className="text-ink-secondary">
                        {audit.overall_score !== null ? audit.overall_score : "—"}
                      </span>
                      <span className="text-ink-secondary capitalize">{audit.status}</span>
                      <span>
                        <Badge variant={isLive ? "live" : "replay"} />
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Section>
    </>
  );
}
