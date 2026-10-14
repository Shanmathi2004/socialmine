
"use client";
import CampaignPerformance from "./CampaignPerformance";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const CREATE_POST_URL = "/dashboard/create-post";
const POSTS_URL = "/dashboard/posts";
const CALENDAR_URL = "/dashboard/calendar";
const ACCOUNTS_URL = "/dashboard/social-accounts";
const NOTIFICATIONS_URL = "/dashboard/notifications";
const PUBLISHING_URL = "/dashboard/publishing";
const CAMPAIGNS_URL = "/dashboard/campaigns";
const REPORTS_URL = "/dashboard/reports";

type RecordData = Record<string, any>;

type Post = {
  id: number | string;
  status?: string;
  title?: string;
  content?: string;
  created_at?: string;
  scheduled_at?: string;
  published_at?: string;
  [key: string]: any;
};

type PublishingLog = {
  id: number | string;
  post_id?: number | string;
  platform?: string;
  status?: string;
  platform_media_id?: string | null;
  published_at?: string | null;
  error_message?: string | null;
  created_at?: string;
  [key: string]: any;
};

type SocialAccount = {
  id: number | string;
  platform?: string;
  username?: string;
  account_name?: string;
  name?: string;
  is_connected?: boolean;
  is_active?: boolean;
  status?: string;
  followers?: number;
  follower_count?: number;
  [key: string]: any;
};

type AudienceInsight = {
  accountId: number | string;
  accountName: string;
  platform: string;
  followers: number | null;
  previousFollowers: number | null;
  followerChange: number | null;
  updatedAt?: string;
  error?: string;
};

type Engagement = {
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  views: number;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeStatus(value?: string): string {
  return (value || "").toLowerCase().replace(/[\s-]+/g, "_");
}

function isPublished(status?: string): boolean {
  return ["published", "success", "successful"].includes(
    normalizeStatus(status),
  );
}

function isFailed(status?: string): boolean {
  return ["failed", "failure", "error"].includes(normalizeStatus(status));
}

function isScheduled(status?: string): boolean {
  return normalizeStatus(status) === "scheduled";
}

function isDraft(status?: string): boolean {
  return normalizeStatus(status) === "draft";
}

function getArray(data: any, keys: string[] = []): RecordData[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];

  for (const key of [...keys, "items", "results", "data"]) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

function readMetric(data: RecordData, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(data?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function unwrap(data: any): RecordData {
  if (!data || typeof data !== "object") return {};
  if (data.data && !Array.isArray(data.data) && typeof data.data === "object") {
    return { ...data, ...data.data };
  }
  return data;
}

function platformIcon(platform?: string): string {
  const value = (platform || "").toLowerCase();
  if (value.includes("instagram")) return "📸";
  if (value.includes("facebook")) return "📘";
  if (value.includes("linkedin")) return "💼";
  if (value.includes("youtube")) return "▶️";
  if (value.includes("pinterest")) return "📌";
  if (value.includes("twitter") || value === "x") return "𝕏";
  return "🌐";
}

function statusColor(status?: string): string {
  if (isPublished(status)) return "bg-emerald-100 text-emerald-700";
  if (isFailed(status)) return "bg-red-100 text-red-700";
  if (isScheduled(status)) return "bg-blue-100 text-blue-700";
  if (isDraft(status)) return "bg-slate-100 text-slate-700";
  return "bg-amber-100 text-amber-700";
}

function accountName(account: SocialAccount): string {
  return (
    account.account_name ||
    account.username ||
    account.name ||
    `${account.platform || "Social"} account`
  );
}

async function apiGet(path: string, token: string) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { response, data };
}

export default function AnalyticsPage() {
  const router = useRouter();

  const [posts, setPosts] = useState<Post[]>([]);
  const [logs, setLogs] = useState<PublishingLog[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [audience, setAudience] = useState<AudienceInsight[]>([]);
  const [engagementByLog, setEngagementByLog] = useState<
    Record<string, Partial<Engagement>>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;

    if (!token) {
      router.replace("/login");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [postsResult, logsResult, accountsResult] = await Promise.all([
        apiGet("/api/posts", token),
        apiGet("/api/publishing-logs", token),
        apiGet("/api/social-accounts", token),
      ]);

      const results = [postsResult, logsResult, accountsResult];

      if (results.some((item) => item.response.status === 401)) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("user");
        router.replace("/login");
        return;
      }

      const postData = postsResult.response.ok
        ? getArray(postsResult.data, ["posts"])
        : [];
      const logData = logsResult.response.ok
        ? getArray(logsResult.data, ["logs", "publishing_logs"])
        : [];
      const accountData = accountsResult.response.ok
        ? getArray(accountsResult.data, ["accounts", "social_accounts"])
        : [];

      setPosts(postData as Post[]);
      setLogs(logData as PublishingLog[]);
      setAccounts(accountData as SocialAccount[]);

      const unavailable = [
        !postsResult.response.ok ? "posts" : "",
        !logsResult.response.ok ? "publishing logs" : "",
        !accountsResult.response.ok ? "social accounts" : "",
      ].filter(Boolean);

      if (unavailable.length) {
        setError(`Some information could not be loaded: ${unavailable.join(", ")}.`);
      }

      const instagramLogs = (logData as PublishingLog[]).filter(
        (log) =>
          (log.platform || "").toLowerCase() === "instagram" &&
          isPublished(log.status) &&
          Boolean(log.platform_media_id),
      );

      const engagementResults = await Promise.all(
        instagramLogs.map(async (log) => {
          try {
            const result = await apiGet(
              `/api/instagram/insights/${log.id}`,
              token,
            );
            if (!result.response.ok) return [String(log.id), {}] as const;

            const data = unwrap(result.data);
            return [
              String(log.id),
              {
                likes: readMetric(data, ["likes", "like_count"]),
                comments: readMetric(data, ["comments", "comments_count"]),
                shares: readMetric(data, ["shares", "share_count"]),
                reach: readMetric(data, ["reach", "reach_count"]),
                views: readMetric(data, [
                  "views",
                  "video_views",
                  "view_count",
                  "plays",
                ]),
              },
            ] as const;
          } catch {
            return [String(log.id), {}] as const;
          }
        }),
      );

      


      const instagramAccounts = (accountData as SocialAccount[]).filter(
        (account) => {
          const platform = (account.platform || "").toLowerCase();
          const status = (account.status || "").toLowerCase();
          return (
            platform === "instagram" &&
            account.is_connected !== false &&
            account.is_active !== false &&
            status !== "disconnected" &&
            status !== "inactive"
          );
        },
      );

      const audienceResults = await Promise.all(
        instagramAccounts.map(async (account) => {
          const name = accountName(account);
          const savedFollowers = toNumber(
            account.follower_count ?? account.followers,
          );

          try {
            const result = await apiGet(
              `/api/instagram/account-insights/${account.id}`,
              token,
            );

            if (!result.response.ok) {
              return {
                accountId: account.id,
                accountName: name,
                platform: account.platform || "instagram",
                followers: savedFollowers,
                previousFollowers: null,
                followerChange: null,
                error: `Could not load latest insights (${result.response.status})`,
              } satisfies AudienceInsight;
            }

            const data = unwrap(result.data);
            const followers = readMetric(data, [
              "followers",
              "follower_count",
              "followers_count",
              "current_followers",
              "audience_size",
            ]);
            const previous = readMetric(data, [
              "previous_followers",
              "previous_follower_count",
              "followers_previous",
              "previous_followers_count",
            ]);
            const reportedChange = readMetric(data, [
              "follower_change",
              "followers_change",
              "follower_growth",
              "growth",
              "change",
            ]);

            return {
              accountId: account.id,
              accountName: name,
              platform: account.platform || "instagram",
              followers: followers ?? savedFollowers,
              previousFollowers: previous,
              followerChange:
                reportedChange ??
                (followers !== null && previous !== null
                  ? followers - previous
                  : null),
              updatedAt:
                data.updated_at ||
                data.last_updated ||
                data.fetched_at ||
                data.created_at ||
                undefined,
            } satisfies AudienceInsight;
          } catch {
            return {
              accountId: account.id,
              accountName: name,
              platform: account.platform || "instagram",
              followers: savedFollowers,
              previousFollowers: null,
              followerChange: null,
              error: "Could not load audience insights",
            } satisfies AudienceInsight;
          }
        }),
      );

      setAudience(audienceResults);
      setLastRefreshed(new Date().toISOString());
    } catch (err) {
      console.error("Analytics loading error:", err);
      setError("Unable to load analytics. Check that your backend is running.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const publishedPosts = useMemo(
    () => posts.filter((post) => isPublished(post.status)),
    [posts],
  );
  const scheduledPosts = useMemo(
    () => posts.filter((post) => isScheduled(post.status)),
    [posts],
  );
  const draftPosts = useMemo(
    () => posts.filter((post) => isDraft(post.status)),
    [posts],
  );
  const failedPosts = useMemo(
    () => posts.filter((post) => isFailed(post.status)),
    [posts],
  );
  const successfulLogs = logs.filter((log) => isPublished(log.status));
  const failedLogs = logs.filter((log) => isFailed(log.status));
  const successRate =
    logs.length > 0 ? Math.round((successfulLogs.length / logs.length) * 100) : 0;

  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach((log) => {
      const platform = (log.platform || "other").toLowerCase();
      counts[platform] = (counts[platform] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count);
  }, [logs]);

  const engagementTotals = useMemo(() => {
    const totals: Engagement = {
      likes: 0,
      comments: 0,
      shares: 0,
      reach: 0,
      views: 0,
    };
    const available: Record<keyof Engagement, boolean> = {
      likes: false,
      comments: false,
      shares: false,
      reach: false,
      views: false,
    };

    Object.values(engagementByLog).forEach((metrics) => {
      (["likes", "comments", "shares", "reach", "views"] as const).forEach(
        (key) => {
          const value = toNumber(metrics[key]);
          if (value !== null) {
            totals[key] += value;
            available[key] = true;
          }
        },
      );
    });

    return { totals, available };
  }, [engagementByLog]);

  const totalFollowers = useMemo(() => {
    const values = audience
      .map((item) => item.followers)
      .filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }, [audience]);

  const totalFollowerChange = useMemo(() => {
    const values = audience
      .map((item) => item.followerChange)
      .filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }, [audience]);

  const connectedAccounts = accounts.filter(
    (account) =>
      account.is_connected !== false &&
      account.is_active !== false &&
      (account.status || "").toLowerCase() !== "disconnected",
  ).length;

  const engagementCards = [
    { label: "Likes", value: engagementTotals.totals.likes, available: engagementTotals.available.likes, icon: "❤️", color: "from-pink-500 to-rose-500" },
    { label: "Comments", value: engagementTotals.totals.comments, available: engagementTotals.available.comments, icon: "💬", color: "from-blue-500 to-indigo-500" },
    { label: "Shares", value: engagementTotals.totals.shares, available: engagementTotals.available.shares, icon: "🔁", color: "from-violet-500 to-purple-500" },
    { label: "Reach", value: engagementTotals.totals.reach, available: engagementTotals.available.reach, icon: "👥", color: "from-emerald-500 to-teal-500" },
    { label: "Views", value: engagementTotals.totals.views, available: engagementTotals.available.views, icon: "▶️", color: "from-orange-500 to-amber-500" },
  ];

  const statusItems = [
    { label: "Published", count: publishedPosts.length, color: "bg-emerald-500" },
    { label: "Scheduled", count: scheduledPosts.length, color: "bg-blue-500" },
    { label: "Draft", count: draftPosts.length, color: "bg-slate-400" },
    { label: "Failed", count: failedPosts.length, color: "bg-red-500" },
  ];

  // Group real publishing logs by date for the activity chart.
  const publishingTrend = useMemo(() => {
    const days: Record<string, { successful: number; failed: number; total: number }> = {};

    logs.forEach((log) => {
      const rawDate = log.created_at || log.published_at;
      if (!rawDate) return;

      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) return;

      const key = date.toISOString().slice(0, 10);
      if (!days[key]) days[key] = { successful: 0, failed: 0, total: 0 };

      days[key].total += 1;
      if (isPublished(log.status)) days[key].successful += 1;
      if (isFailed(log.status)) days[key].failed += 1;
    });

    return Object.entries(days)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, values]) => ({
        date,
        label: new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        }),
        ...values,
      }));
  }, [logs]);

  
  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Loading header */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-indigo-50 blur-3xl" />

            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50">
                <svg
                  className="h-7 w-7 animate-spin text-indigo-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="opacity-20"
                  />
                  <path
                    d="M21 12a9 9 0 0 0-9-9"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
                  SocialPilot Insights
                </p>

                <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Preparing your analytics dashboard
                </h1>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  We&apos;re gathering your posts, publishing activity, connected
                  accounts and available social insights. Your dashboard will
                  appear as soon as the data is ready.
                </p>

                <div className="mt-4 flex items-center gap-2 text-sm font-medium text-indigo-700">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-40" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-indigo-600" />
                  </span>
                  Fetching the latest available data…
                </div>
              </div>
            </div>
          </section>

          {/* Loading metric cards */}
          <section aria-label="Loading analytics summary" aria-busy="true">
            <div className="mb-3">
              <h2 className="text-lg font-bold text-slate-900">
                Your overview
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Preparing your latest numbers
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
              {[
                { title: "Total Posts", icon: "📝" },
                { title: "Published Posts", icon: "✓" },
                { title: "Publishing Success", icon: "↗" },
                { title: "Connected Accounts", icon: "◎" },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-500 sm:text-sm">
                      {item.title}
                    </span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg text-slate-500">
                      {item.icon}
                    </span>
                  </div>

                  <div className="mt-5 h-8 w-20 animate-pulse rounded-md bg-slate-200" />
                  <div className="mt-3 h-3 w-28 max-w-full animate-pulse rounded bg-slate-100" />
                </div>
              ))}
            </div>
          </section>

          {/* Chart placeholders */}
          <section className="grid gap-5 xl:grid-cols-5" aria-hidden="true">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:col-span-3">
              <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-3 w-64 max-w-full animate-pulse rounded bg-slate-100" />

              <div className="mt-8 flex h-48 items-end justify-around gap-3 rounded-xl bg-slate-50 px-4 pb-4 pt-6">
                {[35, 58, 43, 75, 50, 85, 62].map((height, index) => (
                  <div
                    key={index}
                    className="w-full max-w-10 animate-pulse rounded-t-md bg-slate-200"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>

              <p className="mt-3 text-center text-xs text-slate-400">
                Loading publishing activity
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:col-span-2">
              <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-3 w-48 max-w-full animate-pulse rounded bg-slate-100" />

              <div className="mt-8 flex justify-center">
                <div className="relative flex h-36 w-36 animate-pulse items-center justify-center rounded-full border-[18px] border-slate-200">
                  <div className="h-20 w-20 rounded-full bg-white" />
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                    <div className="h-3 flex-1 animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-8 animate-pulse rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Loading status */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <svg
                  className="h-5 w-5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="opacity-20"
                  />
                  <path
                    d="M21 12a9 9 0 0 0-9-9"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-slate-800">
                  Almost there
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Social platform insights may take a little longer to respond.
                  We&apos;re waiting for the available data before showing your
                  results.
                </p>
              </div>
            </div>
          </section>

          <p className="pb-2 text-center text-xs text-slate-400">
            SocialPilot Analytics · Your real statistics will appear here
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header: no Refresh or Create Post buttons */}
        <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-violet-700 via-indigo-700 to-blue-700 p-6 text-white shadow-lg sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-violet-200">
                <span className="rounded-lg bg-white/15 p-2 text-xl">📊</span>
                SocialPilot Insights
              </div>
              <h1 className="text-2xl font-bold sm:text-3xl">
                Analytics Overview
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-indigo-100 sm:text-base">
                Monitor publishing, engagement, audience, and platform activity.
              </p>
              {lastRefreshed && (
                <p className="mt-3 text-xs text-indigo-200">
                  Last refreshed: {formatDate(lastRefreshed)}
                </p>
              )}
            </div>
            <div className="hidden h-24 w-24 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-5xl sm:flex">
              📈
            </div>
          </div>
        </header>

        {error && (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        {/* Summary cards */}
        <section>
          <div className="mb-3">
            <h2 className="text-lg font-bold text-slate-900">At a glance</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <SummaryCard title="Total Posts" value={formatNumber(posts.length)} subtitle="All post records" icon="📝" accent="violet" />
            <SummaryCard title="Published Posts" value={formatNumber(publishedPosts.length)} subtitle="Successfully published" icon="✅" accent="emerald" />
            <SummaryCard title="Publishing Success" value={`${successRate}%`} subtitle={`${successfulLogs.length} successful attempts`} icon="🎯" accent="blue" />
            <SummaryCard title="Connected Accounts" value={formatNumber(connectedAccounts)} subtitle="Available social accounts" icon="🔗" accent="orange" />
          </div>
        </section>

        {/* New charts */}
        <section className="grid gap-5 xl:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:col-span-3">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Publishing Activity</h2>
                <p className="mt-1 text-sm text-slate-500">Daily publishing attempts over the latest seven recorded dates</p>
              </div>
              <span className="rounded-xl bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700">Last 7 dates</span>
            </div>
            {publishingTrend.length === 0 ? (
              <EmptyState icon="📈" title="No chart data yet" description="Publishing activity will appear after publishing logs are recorded." actionLabel="Create Post" onAction={() => router.push(CREATE_POST_URL)} />
            ) : (
              <PublishingTrendChart data={publishingTrend} />
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:col-span-2">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-slate-900">Post Status Breakdown</h2>
              <p className="mt-1 text-sm text-slate-500">Distribution of your current posts</p>
            </div>
            {posts.length === 0 ? (
              <EmptyState icon="📝" title="No posts yet" description="Create your first post to see status statistics." actionLabel="Create Post" onAction={() => router.push(CREATE_POST_URL)} />
            ) : (
              <StatusDonut items={statusItems} total={posts.length} />
            )}
          </div>
        </section>

        {/* Publishing performance */}
        <section className="grid gap-5 lg:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Publishing Performance</h2>
                <p className="mt-1 text-sm text-slate-500">Results from your publishing attempts</p>
              </div>
              <span className="rounded-xl bg-blue-50 p-2 text-xl">🚀</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard label="Successful" value={successfulLogs.length} color="text-emerald-700" background="bg-emerald-50" />
              <MetricCard label="Failed" value={failedLogs.length} color="text-red-700" background="bg-red-50" />
              <MetricCard label="Total Attempts" value={logs.length} color="text-slate-800" background="bg-slate-100" />
              <MetricCard label="Success Rate" value={`${successRate}%`} color="text-blue-700" background="bg-blue-50" />
            </div>
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-600">Successful publishing rate</span>
                <span className="font-bold text-slate-900">{successRate}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all" style={{ width: `${successRate}%` }} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2 sm:p-6">
            <h2 className="text-lg font-bold text-slate-900">Platform Activity</h2>
            <p className="mb-5 mt-1 text-sm text-slate-500">Publishing attempts by platform</p>
            {platformCounts.length === 0 ? (
              <EmptyState icon="🌐" title="No activity yet" description="Platform activity appears when publishing logs are recorded." actionLabel="Create Post" onAction={() => router.push(CREATE_POST_URL)} />
            ) : (
              <div className="space-y-5">
                {platformCounts.map((item) => (
                  <div key={item.platform}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-medium capitalize text-slate-700">
                        <span>{platformIcon(item.platform)}</span>{item.platform}
                      </span>
                      <span className="text-sm font-bold text-slate-900">{item.count}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" style={{ width: `${Math.round((item.count / Math.max(1, ...platformCounts.map((p) => p.count))) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Engagement: Impressions removed */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Engagement Analytics</h2>
              
            </div>
            
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {engagementCards.map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 p-4 transition hover:border-slate-200 hover:bg-white">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xl">{item.icon}</span>
                  <span className={`h-2 w-2 rounded-full bg-gradient-to-r ${item.color}`} />
                </div>
                <p className="text-xs font-medium text-slate-500">{item.label}</p>
                <p className="mt-1 break-words text-xl font-bold text-slate-900 sm:text-2xl">{item.available ? formatNumber(item.value) : "—"}</p>
                <p className="mt-1 text-xs text-slate-400">{item.available ? "Data received" : "Not available"}</p>
              </div>
            ))}
          </div>
         
        </section>

        {/* Audience analytics */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Audience Analytics</h2>
              <p className="mt-1 text-sm text-slate-500">Follower counts and available follower changes.</p>
            </div>
            <button type="button" onClick={() => router.push(ACCOUNTS_URL)} className="w-fit rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Manage Accounts →
            </button>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 p-5 text-white">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-violet-100">Total Followers</p>
                <span className="text-2xl">👥</span>
              </div>
              <p className="mt-3 text-3xl font-bold">{totalFollowers === null ? "—" : formatNumber(totalFollowers)}</p>
              <p className="mt-1 text-xs text-violet-100">Total follower data</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-600">Follower Change</p>
                <span className="text-2xl">📈</span>
              </div>
              <p className={`mt-3 text-3xl font-bold ${totalFollowerChange === null ? "text-slate-900" : totalFollowerChange > 0 ? "text-emerald-700" : totalFollowerChange < 0 ? "text-red-700" : "text-slate-900"}`}>
                {totalFollowerChange === null ? "—" : `${totalFollowerChange > 0 ? "+" : ""}${formatNumber(totalFollowerChange)}`}
              </p>
              <p className="mt-1 text-xs text-slate-500">Based on change data returned by the API</p>
            </div>
          </div>

          {audience.length === 0 ? (
            <EmptyState icon="👥" title="No Instagram audience data" description="Connect an Instagram account and check that its account-insights endpoint is available." actionLabel="Manage Social Accounts" onAction={() => router.push(ACCOUNTS_URL)} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Account</th>
                    <th className="px-4 py-3 font-semibold">Current Followers</th>
                    <th className="px-4 py-3 font-semibold">Previous Followers</th>
                    <th className="px-4 py-3 font-semibold">Follower Change</th>
                    <th className="px-4 py-3 font-semibold">Last Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {audience.map((item) => (
                    <tr key={String(item.accountId)} className="transition hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-50 text-lg">📸</span>
                          <div>
                            <p className="font-semibold text-slate-800">{item.accountName}</p>
                            <p className="text-xs capitalize text-slate-400">{item.platform}</p>
                            {item.error && <p className="mt-1 text-xs text-amber-700">{item.error}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-900">{formatNumber(item.followers)}</td>
                      <td className="px-4 py-4 text-slate-600">{formatNumber(item.previousFollowers)}</td>
                      <td className="px-4 py-4">
                        {item.followerChange === null ? <span className="text-slate-400">—</span> : (
                          <span className={`font-semibold ${item.followerChange > 0 ? "text-emerald-700" : item.followerChange < 0 ? "text-red-700" : "text-slate-600"}`}>
                            {item.followerChange > 0 ? "+" : ""}{formatNumber(item.followerChange)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500">{formatDate(item.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs leading-5 text-slate-400">Historical follower change requires a previous follower count or calculated change from your backend.</p>
        </section>

        {/* Recent activity now links to the publishing page */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Recent Publishing Activity</h2>
              <p className="mt-1 text-sm text-slate-500">The latest publishing attempts recorded by SocialPilot.</p>
            </div>
            <button type="button" onClick={() => router.push(PUBLISHING_URL)} className="w-fit rounded-xl bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100">
              Go to Publishing →
            </button>
          </div>

          {logs.length === 0 ? (
            <EmptyState icon="📋" title="No publishing activity" description="Publishing attempts will appear here after you start publishing posts." actionLabel="Create Post" onAction={() => router.push(CREATE_POST_URL)} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Platform</th>
                    <th className="px-4 py-3 font-semibold">Post ID</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...logs]
                    .sort((a, b) => new Date(b.created_at || b.published_at || 0).getTime() - new Date(a.created_at || a.published_at || 0).getTime())
                    .slice(0, 6)
                    .map((log) => (
                      <tr key={String(log.id)} className="transition hover:bg-slate-50">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{platformIcon(log.platform)}</span>
                            <span className="font-medium capitalize text-slate-800">{log.platform || "Unknown"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-600">{log.post_id ?? "—"}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusColor(log.status)}`}>
                            {(log.status || "unknown").replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-500">{formatDate(log.published_at || log.created_at)}</td>
                        <td className="max-w-xs px-4 py-4 text-xs text-slate-500">
                          <span className="line-clamp-2">{log.error_message || (log.platform_media_id ? `Media ID: ${log.platform_media_id}` : "No additional details")}</span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* No Analytics Data Sources or bottom Quick Links */}
        <footer className="pb-2 text-center text-xs text-slate-400">
          SocialPilot Analytics · Metrics are based on available post records,
          publishing logs, and platform API responses.
        </footer>
      </div>
    </main>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  accent,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
  accent: "violet" | "emerald" | "blue" | "orange";
}) {
  const colors = {
    violet: "bg-violet-50 text-violet-700",
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    orange: "bg-orange-50 text-orange-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-slate-500 sm:text-sm">{title}</p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${colors[accent]}`}>{icon}</span>
      </div>
      <p className="mt-4 break-words text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
  background,
}: {
  label: string;
  value: number | string;
  color: string;
  background: string;
}) {
  return (
    <div className={`rounded-xl p-4 ${background}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center">
      <span className="text-3xl">{icon}</span>
      <h3 className="mt-3 text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      <button type="button" onClick={onAction} className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700">
        {actionLabel}
      </button>
    </div>
  );
}

function PublishingTrendChart({
  data,
}: {
  data: {
    date: string;
    label: string;
    successful: number;
    failed: number;
    total: number;
  }[];
}) {
  const maxValue = Math.max(1, ...data.map((item) => item.total));
  const chartHeight = 190;
  const chartWidth = 620;
  const left = 35;
  const right = 12;
  const top = 12;
  const bottom = 30;
  const plotWidth = chartWidth - left - right;
  const plotHeight = chartHeight - top - bottom;
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;

  const point = (index: number, value: number) => ({
    x: left + index * step,
    y: top + plotHeight - (value / maxValue) * plotHeight,
  });

  const line = (key: "successful" | "failed") =>
    data
      .map((item, index) => {
        const p = point(index, item[key]);
        return `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`;
      })
      .join(" ");

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4 text-xs font-medium text-slate-600">
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Successful</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />Failed</span>
        <span className="ml-auto text-slate-400">Daily attempts</span>
      </div>

      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full overflow-visible" role="img" aria-label="Publishing attempts trend chart">
        {[0, 1, 2, 3].map((i) => {
          const y = top + (plotHeight / 3) * i;
          return (
            <g key={i}>
              <line x1={left} y1={y} x2={chartWidth - right} y2={y} stroke="#e2e8f0" strokeDasharray="4 5" />
              <text x={left - 8} y={y + 4} fontSize="10" textAnchor="end" fill="#94a3b8">
                {Math.round(maxValue * (1 - i / 3))}
              </text>
            </g>
          );
        })}

        {data.map((item, index) => {
          const p = point(index, item.total);
          const barWidth = Math.min(26, data.length > 1 ? step * 0.45 : 26);
          const successfulHeight = (item.successful / maxValue) * plotHeight;
          const failedHeight = (item.failed / maxValue) * plotHeight;
          const baseY = top + plotHeight;

          return (
            <g key={item.date}>
              <rect
                x={p.x - barWidth / 2}
                y={baseY - successfulHeight}
                width={barWidth}
                height={successfulHeight}
                rx="4"
                fill="#10b981"
                opacity="0.85"
              />
              <rect
                x={p.x - barWidth / 2}
                y={baseY - successfulHeight - failedHeight}
                width={barWidth}
                height={failedHeight}
                rx="4"
                fill="#f43f5e"
                opacity="0.9"
              />
              <text x={p.x} y={chartHeight - 8} fontSize="10" textAnchor="middle" fill="#64748b">
                {item.label}
              </text>
            </g>
          );
        })}

        <path d={line("successful")} fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        {data.map((item, index) => {
          const p = point(index, item.successful);
          return <circle key={`success-${item.date}`} cx={p.x} cy={p.y} r="3.5" fill="#047857" stroke="white" strokeWidth="1.5" />;
        })}
      </svg>

      <p className="mt-3 text-xs text-slate-400">
        Chart values come from your publishing logs. Dates without recorded attempts are not filled with invented data.
      </p>
    </div>
  );
}

function StatusDonut({
  items,
  total,
}: {
  items: { label: string; count: number; color: string }[];
  total: number;
}) {
  const colors: Record<string, string> = {
    Published: "#10b981",
    Scheduled: "#3b82f6",
    Draft: "#94a3b8",
    Failed: "#f43f5e",
  };

  let cumulative = 0;
  const segments = items
    .filter((item) => item.count > 0)
    .map((item) => {
      const start = cumulative;
      const percentage = (item.count / total) * 100;
      cumulative += percentage;
      return { ...item, start, percentage };
    });

  const gradient =
    segments.length === 0
      ? "#e2e8f0 0% 100%"
      : segments
          .map(
            (item) =>
              `${colors[item.label]} ${item.start}% ${item.start + item.percentage}%`,
          )
          .join(", ");

  return (
    <div>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div
          className="relative h-44 w-44 shrink-0 rounded-full"
          style={{ background: `conic-gradient(${gradient})` }}
          role="img"
          aria-label="Post status distribution chart"
        >
          <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white">
            <span className="text-3xl font-bold text-slate-900">{total}</span>
            <span className="text-xs text-slate-500">Total posts</span>
          </div>
        </div>

        <div className="w-full flex-1 space-y-4">
          {items.map((item) => (
            <div key={item.label}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm text-slate-600">
                  <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                  {item.label}
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {item.count}
                  <span className="ml-1 font-normal text-slate-400">
                    ({Math.round((item.count / total) * 100)}%)
                  </span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${item.color}`}
                  style={{ width: `${(item.count / total) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
