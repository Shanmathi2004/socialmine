
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

type Post = {
  id: number;
  campaign_id?: number | null;
  content: string;
  status: string;
  scheduled_at?: string | null;
  created_at?: string;
};

type PublishingLog = {
  id: number;
  post_id: number;
  platform: string;
  status: string;
  platform_media_id?: string | null;
  published_at?: string | null;
  error_message?: string | null;
  created_at?: string;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  reach?: number | null;
  views?: number | null;
};

type Campaign = {
  id: number;
  name: string;
  status: string;
  budget?: number;
  revenue?: number;
};

type CampaignStats = {
  campaign_id: number;
  campaign_name: string;
  campaign_status: string;
  total_posts: number;
  draft_posts: number;
  scheduled_posts: number;
  published_posts: number;
  failed_posts: number;
  publishing_attempts: number;
  successful_attempts: number;
  failed_attempts: number;
  success_rate: number;
  budget: number;
  revenue: number;
  roi: number | null;
};

export default function AnalyticsPage() {
  const router = useRouter();

  const [posts, setPosts] = useState<Post[]>([]);
  const [logs, setLogs] = useState<PublishingLog[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignStats, setCampaignStats] = useState<
    Record<number, CampaignStats>
  >({});
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);

  const loadInstagramInsights = async (
    token: string,
    publishingLogs: PublishingLog[]
  ): Promise<PublishingLog[]> => {
    const eligibleLogs = publishingLogs.filter(
      (log) =>
        log.platform?.toLowerCase() === "instagram" &&
        log.status?.toLowerCase() === "published" &&
        Boolean(log.platform_media_id)
    );

    const updatedLogs = [...publishingLogs];

    await Promise.all(
      eligibleLogs.map(async (log) => {
        try {
          const response = await fetch(
            `${API_URL}/api/instagram/insights/${log.id}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (!response.ok) return;

          const insights = await response.json();
          const index = updatedLogs.findIndex(
            (item) => item.id === log.id
          );

          if (index !== -1) {
            updatedLogs[index] = {
              ...updatedLogs[index],
              likes: insights.likes ?? null,
              comments: insights.comments ?? null,
              shares: insights.shares ?? null,
              reach: insights.reach ?? null,
              views: insights.views ?? null,
            };
          }
        } catch {
          // Ignore optional insights failures to keep the dashboard clean.
        }
      })
    );

    return updatedLogs;
  };

  useEffect(() => {
    const token = localStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    void loadAnalytics(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const loadAnalytics = async (token: string) => {
    try {
      setLoading(true);

      const [postsResponse, logsResponse, campaignsResponse] =
        await Promise.all([
          fetch(`${API_URL}/api/posts`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/api/publishing-logs`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/api/campaigns`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

      if (
        postsResponse.status === 401 ||
        logsResponse.status === 401 ||
        campaignsResponse.status === 401
      ) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("user");
        router.replace("/login");
        return;
      }

      const loadedPosts: Post[] = postsResponse.ok
        ? await postsResponse.json().then((data) =>
            Array.isArray(data) ? data : []
          )
        : [];

      const loadedLogs: PublishingLog[] = logsResponse.ok
        ? await logsResponse.json().then((data) =>
            Array.isArray(data) ? data : []
          )
        : [];

      const loadedCampaigns: Campaign[] = campaignsResponse.ok
        ? await campaignsResponse.json().then((data) =>
            Array.isArray(data) ? data : []
          )
        : [];

      const logsWithInsights = await loadInstagramInsights(
        token,
        loadedLogs
      );

      setPosts(loadedPosts);
      setLogs(logsWithInsights);
      setCampaigns(loadedCampaigns);

      await loadCampaignStats(token, loadedCampaigns);
    } catch {
      // Do not display technical errors in the dashboard.
      // Existing data remains visible if a refresh fails.
    } finally {
      setLoading(false);
    }
  };

  const loadCampaignStats = async (
    token: string,
    campaignList: Campaign[]
  ) => {
    try {
      setStatsLoading(true);

      const results = await Promise.all(
        campaignList.map(async (campaign) => {
          try {
            const response = await fetch(
              `${API_URL}/api/campaigns/${campaign.id}/stats`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            if (!response.ok) return null;

            const data = (await response.json()) as CampaignStats;

            return { id: campaign.id, stats: data };
          } catch {
            return null;
          }
        })
      );

      const statsMap: Record<number, CampaignStats> = {};

      results.forEach((result) => {
        if (result) statsMap[result.id] = result.stats;
      });

      setCampaignStats(statsMap);
    } catch {
      // Campaign statistics are optional; keep the main page usable.
    } finally {
      setStatsLoading(false);
    }
  };

  const totalPosts = posts.length;

  const publishedPosts = posts.filter(
    (post) => post.status?.toLowerCase() === "published"
  ).length;

  const scheduledPosts = posts.filter(
    (post) => post.status?.toLowerCase() === "scheduled"
  ).length;

  const draftPosts = posts.filter(
    (post) => post.status?.toLowerCase() === "draft"
  ).length;

  const failedPosts = posts.filter(
    (post) => post.status?.toLowerCase() === "failed"
  ).length;

  const successfulLogs = logs.filter(
    (log) => log.status?.toLowerCase() === "published"
  ).length;

  const failedLogs = logs.filter(
    (log) => log.status?.toLowerCase() === "failed"
  ).length;

  const successRate =
    logs.length === 0
      ? 0
      : Math.round((successfulLogs / logs.length) * 100);

  const platformCounts = logs.reduce<Record<string, number>>(
    (result, log) => {
      const platform = log.platform || "unknown";
      result[platform] = (result[platform] || 0) + 1;
      return result;
    },
    {}
  );

  const sortedPlatforms = useMemo(
    () =>
      Object.entries(platformCounts).sort(
        ([, a], [, b]) => b - a
      ),
    [platformCounts]
  );

  const publishedLogs = logs.filter(
    (log) => log.status?.toLowerCase() === "published"
  );

  const totalLikes = publishedLogs.reduce(
    (total, log) => total + (log.likes || 0),
    0
  );

  const totalComments = publishedLogs.reduce(
    (total, log) => total + (log.comments || 0),
    0
  );

  const totalShares = publishedLogs.reduce(
    (total, log) => total + (log.shares || 0),
    0
  );

  const totalReach = publishedLogs.reduce(
    (total, log) => total + (log.reach || 0),
    0
  );

  const totalViews = publishedLogs.reduce(
    (total, log) => total + (log.views || 0),
    0
  );

  const hasEngagementData = publishedLogs.some(
    (log) =>
      log.likes != null ||
      log.comments != null ||
      log.shares != null ||
      log.reach != null ||
      log.views != null
  );

  const totalBudget = Object.values(campaignStats).reduce(
    (total, stats) => total + (stats.budget || 0),
    0
  );

  const totalRevenue = Object.values(campaignStats).reduce(
    (total, stats) => total + (stats.revenue || 0),
    0
  );

  const overallROI =
    totalBudget > 0
      ? Math.round(((totalRevenue - totalBudget) / totalBudget) * 100)
      : null;

  const formatPercentage = (value: number, total: number) =>
    total === 0 ? "0%" : `${Math.round((value / total) * 100)}%`;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);

  const formatNumber = (value: number) =>
    new Intl.NumberFormat("en-IN").format(value);

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case "instagram":
        return "📸";
      case "facebook":
        return "📘";
      case "linkedin":
        return "💼";
      case "youtube":
        return "▶️";
      case "x":
      case "twitter":
        return "𝕏";
      case "pinterest":
        return "📌";
      default:
        return "📱";
    }
  };

  const getPlatformColor = (platform: string) => {
    switch (platform.toLowerCase()) {
      case "instagram":
        return "bg-pink-50 text-pink-600 border-pink-100";
      case "facebook":
        return "bg-blue-50 text-blue-600 border-blue-100";
      case "linkedin":
        return "bg-sky-50 text-sky-600 border-sky-100";
      case "youtube":
        return "bg-red-50 text-red-600 border-red-100";
      case "x":
      case "twitter":
        return "bg-slate-100 text-slate-800 border-slate-200";
      case "pinterest":
        return "bg-rose-50 text-rose-600 border-rose-100";
      default:
        return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "published":
      case "active":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "scheduled":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "draft":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "failed":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  return (
    <div className="mx-auto max-w-7xl pb-10">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Analytics Overview
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Analytics
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Understand publishing performance, engagement, audience metrics and
            campaign ROI.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard/reports")}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            📊 Reports
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard/create-post")}
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            + Create Post
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
          <p className="mt-5 text-sm font-medium text-slate-600">
            Loading analytics...
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Preparing your publishing insights
          </p>
        </div>
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Total Posts
              </p>
              <p className="mt-3 text-3xl font-bold text-slate-950">
                {totalPosts}
              </p>
              <p className="mt-4 text-xs text-slate-500">
                All content created
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                Published
              </p>
              <p className="mt-3 text-3xl font-bold text-emerald-700">
                {publishedPosts}
              </p>
              <p className="mt-4 text-xs text-emerald-700">
                {formatPercentage(publishedPosts, totalPosts)} of all posts
              </p>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
                Success Rate
              </p>
              <p className="mt-3 text-3xl font-bold text-blue-700">
                {successRate}%
              </p>
              <p className="mt-4 text-xs text-blue-700">
                Publishing attempts
              </p>
            </div>
            <div className="rounded-2xl border border-purple-100 bg-purple-50/70 p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-purple-600">
                Campaigns
              </p>
              <p className="mt-3 text-3xl font-bold text-purple-700">
                {campaigns.length}
              </p>
              <p className="mt-4 text-xs text-purple-700">
                Campaigns created
              </p>
            </div>
          </div>

          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Campaign Budget
              </p>
              <p className="mt-3 text-2xl font-bold text-slate-950">
                {formatCurrency(totalBudget)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Total campaign budget
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                Revenue
              </p>
              <p className="mt-3 text-2xl font-bold text-emerald-700">
                {formatCurrency(totalRevenue)}
              </p>
              <p className="mt-2 text-xs text-emerald-700">
                Total campaign revenue
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                ROI
              </p>
              <p className="mt-3 text-2xl font-bold text-indigo-700">
                {overallROI === null ? "Not available" : `${overallROI}%`}
              </p>
              <p className="mt-2 text-xs text-indigo-700">
                Based on budget and revenue
              </p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-600">
                Failed Attempts
              </p>
              <p className="mt-3 text-2xl font-bold text-amber-700">
                {failedLogs}
              </p>
              <p className="mt-2 text-xs text-amber-700">
                Publishing failures
              </p>
            </div>
          </div>

          <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Publishing Performance
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Track the outcome of publishing attempts.
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                {logs.length} total attempts
              </div>
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5">
                <div className="text-xl">✓</div>
                <p className="mt-4 text-sm font-medium text-emerald-700">
                  Successful
                </p>
                <p className="mt-1 text-3xl font-bold text-emerald-800">
                  {successfulLogs}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xl">!</div>
                <p className="mt-4 text-sm font-medium text-slate-700">
                  Failed
                </p>
                <p className="mt-1 text-3xl font-bold text-slate-800">
                  {failedLogs}
                </p>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
                <div className="text-xl">↗</div>
                <p className="mt-4 text-sm font-medium text-blue-700">
                  Total Attempts
                </p>
                <p className="mt-1 text-3xl font-bold text-blue-800">
                  {logs.length}
                </p>
              </div>
              <div className="rounded-xl border border-purple-100 bg-purple-50 p-5">
                <div className="text-xl">%</div>
                <p className="mt-4 text-sm font-medium text-purple-700">
                  Success Rate
                </p>
                <p className="mt-1 text-3xl font-bold text-purple-800">
                  {successRate}%
                </p>
              </div>
            </div>
          </div>

          <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                  ❤️
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-950">
                    Engagement Analytics
                  </h2>
                  <p className="text-sm text-slate-500">
                    Engagement metrics collected from publishing analytics.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { label: "Likes", value: totalLikes },
                { label: "Comments", value: totalComments },
                { label: "Shares", value: totalShares },
                { label: "Reach", value: totalReach },
                { label: "Views", value: totalViews },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                >
                  <p className="text-xs font-medium text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-800">
                    {hasEngagementData
                      ? formatNumber(item.value)
                      : "Not available"}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">
                    {hasEngagementData
                      ? "Recorded platform data"
                      : "Platform analytics API required"}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50">
                  👥
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-950">
                    Audience Growth
                  </h2>
                  <p className="text-sm text-slate-500">
                    Audience follower tracking.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 p-6 md:grid-cols-3">
              {[
                {
                  label: "Current Followers",
                  detail: "Requires platform account analytics.",
                },
                {
                  label: "Growth",
                  detail: "Historical follower data required.",
                },
                {
                  label: "Trend",
                  detail: "Platform audience API required.",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-5"
                >
                  <p className="text-xs font-medium text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-3 text-2xl font-bold text-slate-800">
                    Not available
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-lg font-bold text-slate-950">
                Platform Activity
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Publishing attempts grouped by platform.
              </p>
            </div>
            {sortedPlatforms.length === 0 ? (
              <div className="p-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
                  📊
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">
                  No platform activity yet
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                  Platform activity will appear after publishing attempts.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
                {sortedPlatforms.map(([platform, count]) => {
                  const percentage =
                    logs.length === 0
                      ? 0
                      : Math.round((count / logs.length) * 100);

                  return (
                    <div
                      key={platform}
                      className="rounded-2xl border border-slate-200 p-5 transition hover:border-slate-300 hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xl ${getPlatformColor(
                            platform
                          )}`}
                        >
                          {getPlatformIcon(platform)}
                        </div>
                        <span className="text-xs font-semibold text-slate-400">
                          {percentage}%
                        </span>
                      </div>
                      <p className="mt-5 text-sm font-semibold capitalize text-slate-900">
                        {platform}
                      </p>
                      <p className="mt-1 text-2xl font-bold text-slate-950">
                        {count}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        publishing attempts
                      </p>
                      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-slate-900"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Campaign Comparison
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Compare publishing performance, budget, revenue and ROI.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/dashboard/campaigns")}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                View Campaigns →
              </button>
            </div>

            {campaigns.length === 0 ? (
              <div className="p-10 text-center">
                <div className="text-3xl">🚀</div>
                <p className="mt-3 text-sm font-medium text-slate-700">
                  No campaigns available
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Create a campaign to see campaign performance.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1250px] text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {[
                        "Campaign",
                        "Posts",
                        "Published",
                        "Attempts",
                        "Success",
                        "Budget",
                        "Revenue",
                        "ROI",
                        "Status",
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-slate-500"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((campaign) => {
                      const stats = campaignStats[campaign.id];

                      return (
                        <tr
                          key={campaign.id}
                          className="border-t border-slate-100 transition hover:bg-slate-50/70"
                        >
                          <td className="px-5 py-4">
                            <p className="font-semibold text-slate-900">
                              {campaign.name}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-400">
                              Campaign #{campaign.id}
                            </p>
                          </td>
                          <td className="px-5 py-4 text-slate-700">
                            {stats ? stats.total_posts : "-"}
                          </td>
                          <td className="px-5 py-4 font-semibold text-emerald-600">
                            {stats ? stats.published_posts : "-"}
                          </td>
                          <td className="px-5 py-4 text-slate-600">
                            {stats ? stats.publishing_attempts : "-"}
                          </td>
                          <td className="px-5 py-4">
                            {stats ? `${stats.success_rate}%` : "-"}
                          </td>
                          <td className="px-5 py-4 font-semibold text-slate-700">
                            {stats ? formatCurrency(stats.budget) : "-"}
                          </td>
                          <td className="px-5 py-4 font-semibold text-emerald-600">
                            {stats ? formatCurrency(stats.revenue) : "-"}
                          </td>
                          <td className="px-5 py-4 font-bold text-indigo-600">
                            {!stats
                              ? "-"
                              : stats.roi == null
                                ? "N/A"
                                : `${stats.roi}%`}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${getStatusBadge(
                                campaign.status
                              )}`}
                            >
                              {campaign.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
              <p className="text-xs leading-5 text-slate-500">
                {statsLoading
                  ? "Loading campaign statistics..."
                  : "Campaign statistics are displayed when available."}
              </p>
            </div>
          </div>

          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="text-lg font-bold text-slate-950">
                  Post Status
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Current distribution of your post statuses.
                </p>
              </div>
              <div className="space-y-6 p-6">
                {[
                  {
                    label: "Published",
                    value: publishedPosts,
                    color: "bg-emerald-500",
                    text: "text-emerald-700",
                  },
                  {
                    label: "Scheduled",
                    value: scheduledPosts,
                    color: "bg-blue-500",
                    text: "text-blue-700",
                  },
                  {
                    label: "Draft",
                    value: draftPosts,
                    color: "bg-amber-500",
                    text: "text-amber-700",
                  },
                  {
                    label: "Failed",
                    value: failedPosts,
                    color: "bg-slate-400",
                    text: "text-slate-600",
                  },
                ].map((item) => {
                  const percentage =
                    totalPosts === 0
                      ? 0
                      : Math.round((item.value / totalPosts) * 100);

                  return (
                    <div key={item.label}>
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${item.color}`}
                          />
                          <span className="text-sm font-medium text-slate-600">
                            {item.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">
                            {item.value}
                          </span>
                          <span className={`text-xs font-semibold ${item.text}`}>
                            {percentage}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${item.color}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="text-lg font-bold text-slate-950">
                  Analytics Data Sources
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Current availability of analytics information.
                </p>
              </div>
              <div className="space-y-3 p-6">
                {[
                  {
                    title: "Publishing statistics",
                    detail: "Posts and publishing logs",
                    status: "Posts and logs",
                  },
                  {
                    title: "Campaign statistics",
                    detail: "Posts, attempts, budget, revenue and ROI",
                    status: "When available",
                  },
                  {
                    title: "Engagement metrics",
                    detail: "Likes, comments, shares, reach and views",
                    status: hasEngagementData
                      ? "Data received"
                      : "Awaiting platform data",
                  },
                  {
                    title: "Audience growth",
                    detail: "Follower history",
                    status: "Platform data required",
                  },
                  {
                    title: "ROI",
                    detail: "Campaign cost and revenue",
                    status: "When available",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {item.detail}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-slate-600">
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm">
            <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Quick Actions
                </p>
                <h2 className="mt-2 text-xl font-bold text-white">
                  Manage your SocialPilot workspace
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Create content, review your schedule or manage connected
                  social accounts.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/create-post")}
                  className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                >
                  + Create Post
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/calendar")}
                  className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  📅 Calendar
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/social-accounts")}
                  className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  📱 Accounts
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
