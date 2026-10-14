
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = "http://127.0.0.1:8000";

type Campaign = {
  id: number;
  name: string;
  platform?: string | null;
  status: string;
  budget?: number | string | null;
  revenue?: number | string | null;
  start_date?: string | null;
  end_date?: string | null;
};

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

const compactMoney = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const roiFor = (revenue: number, budget: number): number | null =>
  budget > 0 ? ((revenue - budget) / budget) * 100 : null;

function MetricCard({
  label,
  value,
  description,
  icon,
}: {
  label: string;
  value: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-base text-slate-700">
          {icon}
        </span>
      </div>
      <p className="mt-3 break-words text-2xl font-bold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

export default function CampaignPerformance() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("access_token");

      if (!token) {
        router.replace("/login");
        return;
      }

      const response = await fetch(`${API_URL}/api/campaigns`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("user");
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        throw new Error("Unable to load campaign financial data.");
      }

      const data: unknown = await response.json();
      setCampaigns(Array.isArray(data) ? (data as Campaign[]) : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load campaign performance.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const totals = useMemo(() => {
    const budget = campaigns.reduce(
      (sum, campaign) => sum + Math.max(0, Number(campaign.budget ?? 0) || 0),
      0,
    );

    const revenue = campaigns.reduce(
      (sum, campaign) => sum + Math.max(0, Number(campaign.revenue ?? 0) || 0),
      0,
    );

    const profit = revenue - budget;

    return {
      budget,
      revenue,
      profit,
      roi: roiFor(revenue, budget),
      campaignsWithBudget: campaigns.filter(
        (campaign) => Number(campaign.budget ?? 0) > 0,
      ).length,
      campaignsWithRevenue: campaigns.filter(
        (campaign) => Number(campaign.revenue ?? 0) > 0,
      ).length,
    };
  }, [campaigns]);

  const maxBarValue = Math.max(
    1,
    ...campaigns.map((campaign) =>
      Math.max(
        Number(campaign.budget ?? 0) || 0,
        Number(campaign.revenue ?? 0) || 0,
      ),
    ),
  );

  return (
    <section className="space-y-5">
      {/* Section heading */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">
            Financial insights
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
            Campaign Performance
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Review campaign budgets, recorded revenue, profit or loss, and
            return on investment.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadCampaigns()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
        >
          <span>{loading ? "◌" : "↻"}</span>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div
          role="status"
          className="rounded-2xl border border-slate-200 bg-white p-6"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Preparing campaign insights
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Retrieving your saved campaign budgets and revenue figures...
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="animate-pulse rounded-xl bg-slate-100 p-5"
              >
                <div className="h-3 w-24 rounded bg-slate-200" />
                <div className="mt-4 h-7 w-32 rounded bg-slate-200" />
                <div className="mt-3 h-3 w-28 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4"
        >
          <p className="text-sm font-semibold text-rose-800">
            Could not load campaign performance
          </p>
          <p className="mt-1 text-sm text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => void loadCampaigns()}
            className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
          >
            Try again
          </button>
        </div>
      )}

      {/* Financial overview */}
      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total campaign budget"
              value={money(totals.budget)}
              description={`${totals.campaignsWithBudget} campaign(s) with a budget recorded`}
              icon="₹"
            />
            <MetricCard
              label="Recorded revenue"
              value={money(totals.revenue)}
              description={`${totals.campaignsWithRevenue} campaign(s) with revenue recorded`}
              icon="↗"
            />
            <MetricCard
              label={totals.profit >= 0 ? "Revenue after budget" : "Budget shortfall"}
              value={money(totals.profit)}
              description="Recorded revenue minus total budget"
              icon={totals.profit >= 0 ? "＋" : "−"}
            />
            <MetricCard
              label="Overall ROI"
              value={totals.roi === null ? "Not available" : `${totals.roi.toFixed(1)}%`}
              description={
                totals.roi === null
                  ? "Add a campaign budget above ₹0 to calculate ROI"
                  : "Calculated from combined budget and revenue"
              }
              icon="%"
            />
          </div>

          {/* Formula explanation */}
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 sm:p-5">
            <h3 className="text-sm font-bold text-slate-900">
              How ROI is calculated
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              ROI = ((Revenue − Budget) ÷ Budget) × 100
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Example: a ₹1,000 budget and ₹1,500 revenue gives 50% ROI.
              ROI is unavailable when the budget is zero or has not been set.
            </p>
          </div>

          {/* Empty state */}
          {campaigns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-xl text-slate-600">
                ₹
              </div>
              <h3 className="mt-4 font-bold text-slate-900">
                No campaigns to analyse yet
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Create a campaign first, then add its budget and recorded
                revenue on your Campaigns page to see financial insights here.
              </p>
              <button
                type="button"
                onClick={() => router.push("/dashboard/campaigns")}
                className="mt-4 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Open Campaigns
              </button>
            </div>
          ) : (
            <>
              {/* Budget vs revenue comparison */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-bold text-slate-950">
                      Budget vs. Revenue
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Compare saved budget and revenue for each campaign.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm bg-slate-400" />
                      Budget
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm bg-indigo-600" />
                      Revenue
                    </span>
                  </div>
                </div>

                <div className="mt-5 space-y-5">
                  {campaigns.map((campaign) => {
                    const budget = Math.max(
                      0,
                      Number(campaign.budget ?? 0) || 0,
                    );
                    const revenue = Math.max(
                      0,
                      Number(campaign.revenue ?? 0) || 0,
                    );
                    const budgetWidth = (budget / maxBarValue) * 100;
                    const revenueWidth = (revenue / maxBarValue) * 100;

                    return (
                      <div key={campaign.id}>
                        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-semibold text-slate-800">
                              {campaign.name}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {campaign.platform || "Platform not set"} ·{" "}
                              {campaign.status}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-x-4 text-xs">
                            <span className="text-slate-500">
                              Budget:{" "}
                              <strong className="text-slate-800">
                                {compactMoney(budget)}
                              </strong>
                            </span>
                            <span className="text-indigo-700">
                              Revenue:{" "}
                              <strong>{compactMoney(revenue)}</strong>
                            </span>
                          </div>
                        </div>

                        <div
                          className="space-y-1.5"
                          aria-label={`Budget ${money(budget)}, revenue ${money(revenue)}`}
                        >
                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-slate-400 transition-all"
                              style={{ width: `${budgetWidth}%` }}
                            />
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-indigo-600 transition-all"
                              style={{ width: `${revenueWidth}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ROI table */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
                  <h3 className="font-bold text-slate-950">
                    Campaign ROI tracking
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Financial results for individual campaigns.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Campaign</th>
                        <th className="px-4 py-3 text-right font-semibold">
                          Budget
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          Revenue
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          Difference
                        </th>
                        <th className="px-4 py-3 text-right font-semibold">
                          ROI
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {campaigns.map((campaign) => {
                        const budget = Math.max(
                          0,
                          Number(campaign.budget ?? 0) || 0,
                        );
                        const revenue = Math.max(
                          0,
                          Number(campaign.revenue ?? 0) || 0,
                        );
                        const difference = revenue - budget;
                        const roi = roiFor(revenue, budget);

                        return (
                          <tr
                            key={campaign.id}
                            className="transition hover:bg-slate-50/80"
                          >
                            <td className="px-4 py-4">
                              <p className="font-semibold text-slate-900">
                                {campaign.name}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {campaign.platform || "Platform not set"}
                              </p>
                            </td>
                            <td className="px-4 py-4 text-right text-slate-700">
                              {budget > 0 ? money(budget) : "Not set"}
                            </td>
                            <td className="px-4 py-4 text-right text-slate-700">
                              {revenue > 0 ? money(revenue) : "Not recorded"}
                            </td>
                            <td
                              className={`px-4 py-4 text-right font-semibold ${
                                difference >= 0
                                  ? "text-emerald-700"
                                  : "text-rose-600"
                              }`}
                            >
                              {money(difference)}
                            </td>
                            <td className="px-4 py-4 text-right">
                              {roi === null ? (
                                <span className="text-xs text-slate-400">
                                  Not available
                                </span>
                              ) : (
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                                    roi >= 0
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-rose-50 text-rose-700"
                                  }`}
                                >
                                  {roi.toFixed(1)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
                  <p className="text-xs leading-5 text-slate-500">
                    These figures use the budget and revenue values saved for
                    each campaign. Revenue must be entered or supplied by a
                    reliable integration; social engagement alone is not
                    financial revenue.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Update your financial records
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Add or edit budgets and recorded revenue on your Campaigns
                    page. Refresh this section afterward.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/campaigns")}
                  className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Manage campaigns →
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
