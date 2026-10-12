
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = "http://127.0.0.1:8000";

type Campaign = {
  id: number;
  name: string;
  description?: string | null;
  platform?: string | null;
  objectives?: string | null;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string;
  budget?: number;
  revenue?: number;
};

type Post = {
  id: number;
  campaign_id?: number | null;
  content: string;
  status: string;
  scheduled_at?: string | null;
  created_at?: string;
};

type CampaignStats = {
  campaign_id?: number;
  campaign_name?: string;
  campaign_status?: string;
  platform?: string | null;
  objectives?: string | null;
  total_posts?: number;
  draft_posts?: number;
  scheduled_posts?: number;
  published_posts?: number;
  failed_posts?: number;
  publishing_attempts?: number;
  successful_attempts?: number;
  failed_attempts?: number;
  success_rate?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  reach?: number;
  views?: number;
  budget?: number;
  revenue?: number;
  roi?: number | null;
};

const emptyStats: CampaignStats = {
  total_posts: 0,
  draft_posts: 0,
  scheduled_posts: 0,
  published_posts: 0,
  failed_posts: 0,
  publishing_attempts: 0,
  successful_attempts: 0,
  failed_attempts: 0,
  success_rate: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  reach: 0,
  views: 0,
  budget: 0,
  revenue: 0,
  roi: null,
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const labelClass =
  "mb-2 block text-sm font-medium text-slate-700";

const currency = (amount?: number | null) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount ?? 0);

const numberFormat = (value?: number | null) =>
  new Intl.NumberFormat("en-IN").format(value ?? 0);

export default function CampaignsPage() {
  const router = useRouter();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [analytics, setAnalytics] = useState<
    Record<number, CampaignStats>
  >({});

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [objectives, setObjectives] = useState("");
  const [status, setStatus] = useState("active");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState("0");
  const [revenue, setRevenue] = useState("0");

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    router.replace("/login");
  }, [router]);

  const getToken = () => localStorage.getItem("access_token");

  const apiRequest = async (
    path: string,
    options: RequestInit = {},
  ) => {
    const token = getToken();

    if (!token) {
      handleUnauthorized();
      throw new Error("Your session has expired. Please log in again.");
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });

    if (response.status === 401) {
      handleUnauthorized();
      throw new Error("Your session has expired. Please log in again.");
    }

    return response;
  };

  const loadCampaignData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [campaignResponse, postsResponse] = await Promise.all([
        apiRequest("/api/campaigns"),
        apiRequest("/api/posts"),
      ]);

      if (!campaignResponse.ok) {
        throw new Error("Failed to load campaigns.");
      }

      if (!postsResponse.ok) {
        throw new Error("Failed to load posts.");
      }

      const campaignData = await campaignResponse.json();
      const postsData = await postsResponse.json();

      const campaignList: Campaign[] = Array.isArray(campaignData)
        ? campaignData
        : [];

      setCampaigns(campaignList);
      setPosts(Array.isArray(postsData) ? postsData : []);

      // Load analytics for each campaign independently.
      const results = await Promise.all(
        campaignList.map(async (campaign) => {
          try {
            const response = await apiRequest(
              `/api/campaigns/${campaign.id}/stats`,
            );

            if (!response.ok) {
              return [campaign.id, null] as const;
            }

            const stats: CampaignStats = await response.json();
            return [campaign.id, stats] as const;
          } catch {
            return [campaign.id, null] as const;
          }
        }),
      );

      const nextAnalytics: Record<number, CampaignStats> = {};

      results.forEach(([id, stats]) => {
        if (stats) {
          nextAnalytics[id] = stats;
        }
      });

      setAnalytics(nextAnalytics);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load campaign data.",
      );
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    if (!getToken()) {
      handleUnauthorized();
      setLoading(false);
      return;
    }

    void loadCampaignData();
  }, [handleUnauthorized, loadCampaignData]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setPlatform("Instagram");
    setObjectives("");
    setStatus("active");
    setStartDate("");
    setEndDate("");
    setBudget("0");
    setRevenue("0");
  };

  const editCampaign = (campaign: Campaign) => {
    setEditingId(campaign.id);
    setName(campaign.name);
    setDescription(campaign.description ?? "");
    setPlatform(campaign.platform ?? "Instagram");
    setObjectives(campaign.objectives ?? "");
    setStatus(campaign.status);
    setStartDate(
      campaign.start_date ? campaign.start_date.slice(0, 10) : "",
    );
    setEndDate(
      campaign.end_date ? campaign.end_date.slice(0, 10) : "",
    );
    setBudget(String(campaign.budget ?? 0));
    setRevenue(String(campaign.revenue ?? 0));
    setError("");
    setSuccess("");

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!name.trim()) {
      setError("Campaign name is required.");
      return;
    }

    if (
      startDate &&
      endDate &&
      new Date(endDate).getTime() <= new Date(startDate).getTime()
    ) {
      setError("End date must be after the start date.");
      return;
    }

    const parsedBudget = Number(budget);
    const parsedRevenue = Number(revenue);

    if (
      !Number.isFinite(parsedBudget) ||
      !Number.isFinite(parsedRevenue) ||
      parsedBudget < 0 ||
      parsedRevenue < 0
    ) {
      setError("Budget and revenue must be valid non-negative numbers.");
      return;
    }

    setCreating(true);

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        platform: platform || null,
        objectives: objectives.trim() || null,
        status,
        start_date: startDate || null,
        end_date: endDate || null,
        budget: parsedBudget,
        revenue: parsedRevenue,
      };

      const isEditing = editingId !== null;
      const path = isEditing
        ? `/api/campaigns/${editingId}`
        : "/api/campaigns";

      const response = await apiRequest(path, {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail = data.detail;
        throw new Error(
          typeof detail === "string"
            ? detail
            : "Unable to save the campaign. Please check your entries.",
        );
      }

      const savedCampaign: Campaign = data;

      setCampaigns((current) =>
        isEditing
          ? current.map((campaign) =>
              campaign.id === savedCampaign.id
                ? savedCampaign
                : campaign,
            )
          : [savedCampaign, ...current],
      );

      resetForm();
      setSuccess(
        isEditing
          ? "Campaign updated successfully."
          : "Campaign created successfully.",
      );

      // Refresh the post counts and analytics from the backend.
      await loadCampaignData();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to save campaign.",
      );
    } finally {
      setCreating(false);
    }
  };

  const deleteCampaign = async (campaign: Campaign) => {
    const confirmed = window.confirm(
      `Delete "${campaign.name}"? Its posts will remain, but they will no longer be linked to this campaign.`,
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");
    setDeletingId(campaign.id);

    try {
      const response = await apiRequest(
        `/api/campaigns/${campaign.id}`,
        { method: "DELETE" },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || "Failed to delete campaign.");
      }

      setCampaigns((current) =>
        current.filter((item) => item.id !== campaign.id),
      );

      setPosts((current) =>
        current.map((post) =>
          post.campaign_id === campaign.id
            ? { ...post, campaign_id: null }
            : post,
        ),
      );

      setAnalytics((current) => {
        const next = { ...current };
        delete next[campaign.id];
        return next;
      });

      if (editingId === campaign.id) resetForm();

      setSuccess("Campaign deleted successfully.");
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to delete campaign.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const getCampaignStats = (campaignId: number) => {
    const campaignPosts = posts.filter(
      (post) => post.campaign_id === campaignId,
    );

    return {
      total: campaignPosts.length,
      published: campaignPosts.filter(
        (post) => post.status?.toLowerCase() === "published",
      ).length,
      scheduled: campaignPosts.filter(
        (post) => post.status?.toLowerCase() === "scheduled",
      ).length,
      draft: campaignPosts.filter(
        (post) => post.status?.toLowerCase() === "draft",
      ).length,
      failed: campaignPosts.filter(
        (post) => post.status?.toLowerCase() === "failed",
      ).length,
    };
  };

  const getStatusClasses = (value: string) => {
    switch (value?.toLowerCase()) {
      case "active":
        return "bg-green-100 text-green-700";
      case "completed":
        return "bg-blue-100 text-blue-700";
      case "paused":
        return "bg-yellow-100 text-yellow-700";
      case "cancelled":
        return "bg-red-100 text-red-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  const formatDate = (date?: string | null) => {
    if (!date) return "Not set";

    const parsed = new Date(date);

    return Number.isNaN(parsed.getTime())
      ? "Not set"
      : parsed.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
  };

  const totalBudget = campaigns.reduce(
    (sum, campaign) => sum + Number(campaign.budget ?? 0),
    0,
  );

  const totalRevenue = campaigns.reduce(
    (sum, campaign) => sum + Number(campaign.revenue ?? 0),
    0,
  );

  const overallRoi =
    totalBudget > 0
      ? ((totalRevenue - totalBudget) / totalBudget) * 100
      : null;

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
            SocialPilot workspace
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Campaigns
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Plan campaigns, organize posts, and monitor performance.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadCampaignData()}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh data"}
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700"
        >
          {success}
        </div>
      )}

      {/* OVERVIEW */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total campaigns</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {campaigns.length}
          </p>
          <p className="mt-1 text-xs text-slate-400">Across your workspace</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total campaign posts</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {posts.filter((post) => post.campaign_id != null).length}
          </p>
          <p className="mt-1 text-xs text-slate-400">Linked to campaigns</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total budget</p>
          <p className="mt-2 break-words text-2xl font-bold text-slate-900">
            {currency(totalBudget)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Sum of campaign budgets
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Recorded revenue</p>
          <p className="mt-2 break-words text-2xl font-bold text-slate-900">
            {currency(totalRevenue)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {overallRoi === null
              ? "Set a budget to calculate overall ROI"
              : `Overall ROI: ${overallRoi.toFixed(2)}%`}
          </p>
        </div>
      </section>

      {/* CREATE / EDIT FORM */}
      <section
        id="campaign-form"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-900">
            {editingId !== null ? "Edit campaign" : "Create campaign"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Configure your campaign details, timeline, objectives, and budget.
          </p>
        </div>

        <form onSubmit={saveCampaign} className="space-y-6 p-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="campaign-name" className={labelClass}>
                Campaign name *
              </label>
              <input
                id="campaign-name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Summer Product Launch"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="campaign-platform" className={labelClass}>
                Platform *
              </label>
              <select
                id="campaign-platform"
                required
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                className={inputClass}
              >
                <option value="Instagram">Instagram</option>
                <option value="Facebook">Facebook</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="X">X (Twitter)</option>
                <option value="YouTube">YouTube</option>
                <option value="Pinterest">Pinterest</option>
                <option value="Multiple">Multiple platforms</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="campaign-description" className={labelClass}>
                Description
              </label>
              <textarea
                id="campaign-description"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the campaign and its target audience..."
                className={inputClass}
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="campaign-objectives" className={labelClass}>
                Objectives and goals
              </label>
              <textarea
                id="campaign-objectives"
                rows={3}
                value={objectives}
                onChange={(event) => setObjectives(event.target.value)}
                placeholder="Example: Increase brand awareness, generate leads, or drive website traffic..."
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="campaign-status" className={labelClass}>
                Status
              </label>
              <select
                id="campaign-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className={inputClass}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="draft">Draft</option>
              </select>
            </div>

            <div>
              <label htmlFor="campaign-budget" className={labelClass}>
                Budget (₹)
              </label>
              <input
                id="campaign-budget"
                type="number"
                min="0"
                step="0.01"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="campaign-revenue" className={labelClass}>
                Recorded revenue (₹)
              </label>
              <input
                id="campaign-revenue"
                type="number"
                min="0"
                step="0.01"
                value={revenue}
                onChange={(event) => setRevenue(event.target.value)}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-400">
                Enter the revenue attributed to this campaign.
              </p>
            </div>

            <div>
              <label htmlFor="campaign-start" className={labelClass}>
                Start date
              </label>
              <input
                id="campaign-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="campaign-end" className={labelClass}>
                End date
              </label>
              <input
                id="campaign-end"
                type="date"
                min={startDate || undefined}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
            {editingId !== null && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel editing
              </button>
            )}

            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating
                ? "Saving..."
                : editingId !== null
                  ? "Save changes"
                  : "Create campaign"}
            </button>
          </div>
        </form>
      </section>

      {/* CAMPAIGN LIST */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Your campaigns
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Track publishing progress, engagement, budget, and return on investment.
          </p>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Loading campaigns and analytics...
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl">📢</div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">
              No campaigns yet
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Create your first campaign using the form above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {campaigns.map((campaign) => {
              const postStats = getCampaignStats(campaign.id);
              const stats = {
                ...emptyStats,
                ...analytics[campaign.id],
              };

              return (
                <article
                  key={campaign.id}
                  className="space-y-6 p-6 hover:bg-slate-50/70"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="break-words text-xl font-bold text-slate-900">
                          {campaign.name}
                        </h3>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(campaign.status)}`}
                        >
                          {campaign.status}
                        </span>
                        {campaign.platform && (
                          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                            {campaign.platform}
                          </span>
                        )}
                      </div>

                      {campaign.description && (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                          {campaign.description}
                        </p>
                      )}

                      {campaign.objectives && (
                        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                            Objectives
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {campaign.objectives}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 rounded-lg bg-white p-4 text-sm ring-1 ring-slate-200 xl:min-w-64">
                      <div>
                        <p className="text-xs text-slate-500">Start date</p>
                        <p className="mt-1 font-semibold text-slate-800">
                          {formatDate(campaign.start_date)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">End date</p>
                        <p className="mt-1 font-semibold text-slate-800">
                          {formatDate(campaign.end_date)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Budget</p>
                        <p className="mt-1 font-semibold text-slate-800">
                          {currency(campaign.budget)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Revenue</p>
                        <p className="mt-1 font-semibold text-slate-800">
                          {currency(campaign.revenue)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* POST TRACKING */}
                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-slate-800">
                      Content tracking
                    </h4>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                      {[
                        {
                          label: "Total posts",
                          value: postStats.total,
                          style: "border-slate-200 bg-white text-slate-900",
                        },
                        {
                          label: "Published",
                          value: postStats.published,
                          style: "border-green-200 bg-green-50 text-green-700",
                        },
                        {
                          label: "Scheduled",
                          value: postStats.scheduled,
                          style: "border-blue-200 bg-blue-50 text-blue-700",
                        },
                        {
                          label: "Drafts",
                          value: postStats.draft,
                          style: "border-yellow-200 bg-yellow-50 text-yellow-700",
                        },
                        {
                          label: "Failed",
                          value: postStats.failed,
                          style: "border-red-200 bg-red-50 text-red-700",
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className={`rounded-lg border p-4 ${item.style}`}
                        >
                          <p className="text-xs opacity-80">{item.label}</p>
                          <p className="mt-1 text-2xl font-bold">
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* PERFORMANCE ANALYTICS */}
                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-slate-800">
                      Performance analytics
                    </h4>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                      {[
                        {
                          label: "Likes",
                          value: numberFormat(stats.likes),
                        },
                        {
                          label: "Comments",
                          value: numberFormat(stats.comments),
                        },
                        {
                          label: "Shares",
                          value: numberFormat(stats.shares),
                        },
                        {
                          label: "Reach",
                          value: numberFormat(stats.reach),
                        },
                        {
                          label: "Views",
                          value: numberFormat(stats.views),
                        },
                        {
                          label: "Publish attempts",
                          value: numberFormat(stats.publishing_attempts),
                        },
                        {
                          label: "Successful attempts",
                          value: numberFormat(stats.successful_attempts),
                        },
                        {
                          label: "Success rate",
                          value: `${Number(stats.success_rate ?? 0).toFixed(2)}%`,
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-lg border border-slate-200 bg-white p-4"
                        >
                          <p className="text-xs text-slate-500">
                            {item.label}
                          </p>
                          <p className="mt-1 break-words text-xl font-bold text-slate-900">
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs text-slate-500">Budget</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">
                          {currency(stats.budget ?? campaign.budget)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs text-slate-500">Revenue</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">
                          {currency(stats.revenue ?? campaign.revenue)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs text-slate-500">
                          Return on investment (ROI)
                        </p>
                        <p
                          className={`mt-1 text-lg font-bold ${
                            stats.roi != null && stats.roi >= 0
                              ? "text-green-700"
                              : "text-slate-900"
                          }`}
                        >
                          {stats.roi == null
                            ? "Not available"
                            : `${Number(stats.roi).toFixed(2)}%`}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Calculated from recorded revenue and budget
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ACTIONS */}
                  <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-5">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/dashboard/posts?campaign=${campaign.id}`,
                        )
                      }
                      className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      View campaign posts
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/dashboard/create-post?campaign=${campaign.id}`,
                        )
                      }
                      className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Create campaign post
                    </button>

                    <button
                      type="button"
                      onClick={() => editCampaign(campaign)}
                      className="rounded-lg border border-blue-200 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      Edit campaign
                    </button>

                    <button
                      type="button"
                      onClick={() => void deleteCampaign(campaign)}
                      disabled={deletingId === campaign.id}
                      className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === campaign.id
                        ? "Deleting..."
                        : "Delete campaign"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
