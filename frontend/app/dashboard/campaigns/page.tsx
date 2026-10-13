
"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
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

type SortOption = "newest" | "oldest" | "budget" | "revenue" | "roi";

const initialStats: CampaignStats = {
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
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10";

const labelClass =
  "mb-1.5 block text-xs font-semibold text-slate-500";

const cardClass =
  "rounded-2xl border border-slate-200/80 bg-white shadow-sm";

const currency = (value?: number | null) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));

const numberFormat = (value?: number | null) =>
  new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value ?? 0));

const getROI = (
  revenue?: number | null,
  budget?: number | null,
): number | null => {
  const b = Number(budget ?? 0);
  const r = Number(revenue ?? 0);
  return b > 0 ? ((r - b) / b) * 100 : null;
};

const formatDate = (value?: string | null) => {
  if (!value) return "Not set";
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Not set"
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

const statusClass = (status: string) => {
  switch (status?.toLowerCase()) {
    case "active":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    case "completed":
      return "bg-blue-50 text-blue-700 ring-blue-600/20";
    case "paused":
      return "bg-amber-50 text-amber-700 ring-amber-600/20";
    case "cancelled":
      return "bg-rose-50 text-rose-700 ring-rose-600/20";
    case "draft":
      return "bg-slate-100 text-slate-600 ring-slate-500/20";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-500/20";
  }
};

export default function CampaignsPage() {
  const router = useRouter();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [analytics, setAnalytics] = useState<Record<number, CampaignStats>>(
    {},
  );

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [expandedIds, setExpandedIds] = useState<number[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [objectives, setObjectives] = useState("");
  const [status, setStatus] = useState("active");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState("0");
  const [revenue, setRevenue] = useState("0");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    router.replace("/login");
  }, [router]);

  const apiRequest = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const token = localStorage.getItem("access_token");

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
    },
    [handleUnauthorized],
  );

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

      const results = await Promise.all(
        campaignList.map(async (campaign) => {
          try {
            const response = await apiRequest(
              `/api/campaigns/${campaign.id}/stats`,
            );

            if (!response.ok) return [campaign.id, null] as const;

            const stats: CampaignStats = await response.json();
            return [campaign.id, stats] as const;
          } catch {
            return [campaign.id, null] as const;
          }
        }),
      );

      const nextAnalytics: Record<number, CampaignStats> = {};

      results.forEach(([id, stats]) => {
        if (stats) nextAnalytics[id] = stats;
      });

      setAnalytics(nextAnalytics);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unable to load campaign data.",
      );
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    if (!localStorage.getItem("access_token")) {
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

  const openNewCampaign = () => {
    resetForm();
    setError("");
    setSuccess("");
    setShowForm(true);

    window.setTimeout(() => {
      document.getElementById("campaign-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  };

  const editCampaign = (campaign: Campaign) => {
    setEditingId(campaign.id);
    setName(campaign.name);
    setDescription(campaign.description ?? "");
    setPlatform(campaign.platform ?? "Instagram");
    setObjectives(campaign.objectives ?? "");
    setStatus(campaign.status);
    setStartDate(campaign.start_date?.slice(0, 10) ?? "");
    setEndDate(campaign.end_date?.slice(0, 10) ?? "");
    setBudget(String(campaign.budget ?? 0));
    setRevenue(String(campaign.revenue ?? 0));
    setError("");
    setSuccess("");
    setShowForm(true);

    window.setTimeout(() => {
      document.getElementById("campaign-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  };

  const saveCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!name.trim()) {
      setError("Campaign name is required.");
      return;
    }

    if (startDate && endDate && endDate <= startDate) {
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
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Unable to save the campaign. Please check your entries.",
        );
      }

      resetForm();
      setShowForm(false);
      setSuccess(
        isEditing
          ? "Campaign updated successfully."
          : "Campaign created successfully.",
      );

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
    if (
      !window.confirm(
        `Delete "${campaign.name}"? Its posts will remain, but they will no longer be linked to this campaign.`,
      )
    ) {
      return;
    }

    setError("");
    setSuccess("");
    setDeletingId(campaign.id);

    try {
      const response = await apiRequest(`/api/campaigns/${campaign.id}`, {
        method: "DELETE",
      });

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

      setExpandedIds((current) =>
        current.filter((id) => id !== campaign.id),
      );

      if (editingId === campaign.id) {
        resetForm();
        setShowForm(false);
      }

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

  const filteredCampaigns = useMemo(() => {
    const query = search.trim().toLowerCase();
    const minimum = minBudget.trim() === "" ? null : Number(minBudget);
    const maximum = maxBudget.trim() === "" ? null : Number(maxBudget);

    const filtered = campaigns.filter((campaign) => {
      const searchableText = [
        campaign.name,
        campaign.description ?? "",
        campaign.objectives ?? "",
      ]
        .join(" ")
        .toLowerCase();

      if (query && !searchableText.includes(query)) return false;

      if (
        filterStatus !== "all" &&
        campaign.status.toLowerCase() !== filterStatus
      ) {
        return false;
      }

      if (
        filterPlatform !== "all" &&
        (campaign.platform ?? "").toLowerCase() !==
          filterPlatform.toLowerCase()
      ) {
        return false;
      }

      if (filterStartDate) {
        if (!campaign.start_date) return false;
        if (campaign.start_date.slice(0, 10) < filterStartDate) return false;
      }

      if (filterEndDate) {
        if (!campaign.end_date) return false;
        if (campaign.end_date.slice(0, 10) > filterEndDate) return false;
      }

      const campaignBudget = Number(campaign.budget ?? 0);

      if (minimum !== null && campaignBudget < minimum) return false;
      if (maximum !== null && campaignBudget > maximum) return false;

      return true;
    });

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return (
            new Date(a.created_at ?? a.start_date ?? 0).getTime() -
            new Date(b.created_at ?? b.start_date ?? 0).getTime()
          );
        case "budget":
          return Number(b.budget ?? 0) - Number(a.budget ?? 0);
        case "revenue":
          return Number(b.revenue ?? 0) - Number(a.revenue ?? 0);
        case "roi":
          return (
            (getROI(b.revenue, b.budget) ?? -Infinity) -
            (getROI(a.revenue, a.budget) ?? -Infinity)
          );
        case "newest":
        default:
          return (
            new Date(b.created_at ?? b.start_date ?? 0).getTime() -
            new Date(a.created_at ?? a.start_date ?? 0).getTime()
          );
      }
    });
  }, [
    campaigns,
    search,
    filterStatus,
    filterPlatform,
    filterStartDate,
    filterEndDate,
    minBudget,
    maxBudget,
    sortBy,
  ]);

  const hasFilters = Boolean(
    search ||
      filterStatus !== "all" ||
      filterPlatform !== "all" ||
      filterStartDate ||
      filterEndDate ||
      minBudget !== "" ||
      maxBudget !== "",
  );

  const resetFilters = () => {
    setSearch("");
    setFilterStatus("all");
    setFilterPlatform("all");
    setFilterStartDate("");
    setFilterEndDate("");
    setMinBudget("");
    setMaxBudget("");
    setSortBy("newest");
  };

  const filteredTotals = useMemo(() => {
    const totalBudget = filteredCampaigns.reduce(
      (sum, campaign) => sum + Number(campaign.budget ?? 0),
      0,
    );

    const totalRevenue = filteredCampaigns.reduce(
      (sum, campaign) => sum + Number(campaign.revenue ?? 0),
      0,
    );

    const ids = new Set(filteredCampaigns.map((campaign) => campaign.id));

    return {
      count: filteredCampaigns.length,
      budget: totalBudget,
      revenue: totalRevenue,
      roi: getROI(totalRevenue, totalBudget),
      posts: posts.filter(
        (post) => post.campaign_id != null && ids.has(post.campaign_id),
      ).length,
    };
  }, [filteredCampaigns, posts]);

  const workspaceTotals = useMemo(() => {
    const totalBudget = campaigns.reduce(
      (sum, campaign) => sum + Number(campaign.budget ?? 0),
      0,
    );

    const totalRevenue = campaigns.reduce(
      (sum, campaign) => sum + Number(campaign.revenue ?? 0),
      0,
    );

    return {
      count: campaigns.length,
      budget: totalBudget,
      revenue: totalRevenue,
      roi: getROI(totalRevenue, totalBudget),
      posts: posts.filter((post) => post.campaign_id != null).length,
    };
  }, [campaigns, posts]);

  const platformOptions = useMemo(
    () =>
      Array.from(
        new Set(
          campaigns
            .map((campaign) => campaign.platform?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [campaigns],
  );

  const getPostStats = (campaignId: number) => {
    const linked = posts.filter((post) => post.campaign_id === campaignId);
    const count = (value: string) =>
      linked.filter((post) => post.status?.toLowerCase() === value).length;

    return {
      total: linked.length,
      published: count("published"),
      scheduled: count("scheduled"),
      draft: count("draft"),
      failed: count("failed"),
    };
  };

  const activeCampaigns = campaigns.filter(
    (campaign) => campaign.status.toLowerCase() === "active",
  ).length;

  const Metric = ({
    label,
    value,
    hint,
    icon,
    tone,
  }: {
    label: string;
    value: string | number;
    hint: string;
    icon: string;
    tone: string;
  }) => (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <div
        className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-lg ${tone}`}
      >
        {icon}
      </div>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1.5 break-words text-2xl font-bold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-1.5 text-xs text-slate-400">{hint}</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#f6f7fb] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-6">
        {/* HERO */}
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 px-5 py-6 text-white shadow-xl shadow-indigo-950/10 sm:px-8 sm:py-8">
          <div
            className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full bg-violet-400/20 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-32 right-1/3 h-64 w-64 rounded-full bg-indigo-400/15 blur-3xl"
            aria-hidden="true"
          />

          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold tracking-[0.16em] text-indigo-100">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                SOCIALPILOT · CAMPAIGN STUDIO
              </div>

              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Campaigns<span className="text-violet-300">.</span>
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-indigo-100/80">
                Plan smarter, publish consistently, and turn campaign
                performance into measurable growth.
              </p>

              <div className="mt-5 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                  {workspaceTotals.count} total campaigns
                </span>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-emerald-100">
                  {activeCampaigns} active
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                  {numberFormat(workspaceTotals.posts)} linked posts
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => void loadCampaignData()}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
              >
                <span>{loading ? "◌" : "↻"}</span>
                {loading ? "Refreshing" : "Refresh data"}
              </button>

              <button
                type="button"
                onClick={openNewCampaign}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-indigo-950 shadow-lg transition hover:bg-indigo-50"
              >
                <span className="text-lg leading-none">＋</span>
                New campaign
              </button>
            </div>
          </div>
        </header>

        {/* NOTIFICATIONS */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            <span className="font-bold">!</span>
            <p className="flex-1">{error}</p>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
              className="font-bold"
            >
              ×
            </button>
          </div>
        )}

        {success && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            <span>✓ {success}</span>
            <button
              type="button"
              onClick={() => setSuccess("")}
              aria-label="Dismiss success"
              className="font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* OVERVIEW */}
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-600">
                Performance snapshot
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
                {hasFilters ? "Your filtered results" : "Workspace overview"}
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              {hasFilters
                ? `${filteredTotals.count} of ${workspaceTotals.count} campaigns match`
                : "Live totals from your campaign records"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric
              label="Campaigns"
              value={filteredTotals.count}
              hint={`Of ${workspaceTotals.count} in your workspace`}
              icon="◈"
              tone="bg-indigo-50 text-indigo-700"
            />
            <Metric
              label="Linked posts"
              value={numberFormat(filteredTotals.posts)}
              hint="Content in matching campaigns"
              icon="▤"
              tone="bg-sky-50 text-sky-700"
            />
            <Metric
              label="Total budget"
              value={currency(filteredTotals.budget)}
              hint="Combined campaign investment"
              icon="₹"
              tone="bg-violet-50 text-violet-700"
            />
            <Metric
              label="Recorded revenue"
              value={currency(filteredTotals.revenue)}
              hint={
                filteredTotals.roi === null
                  ? "ROI needs a budget above zero"
                  : `Combined ROI ${filteredTotals.roi.toFixed(1)}%`
              }
              icon="↗"
              tone="bg-emerald-50 text-emerald-700"
            />
          </div>
        </section>

        {/* WORKSPACE TOTALS */}
        <section className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Full workspace
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                These totals are not affected by your filters.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 sm:gap-x-8">
              <div>
                <p className="text-[11px] text-slate-500">Campaigns</p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {workspaceTotals.count}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Posts</p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {numberFormat(workspaceTotals.posts)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Budget</p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {currency(workspaceTotals.budget)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">ROI</p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {workspaceTotals.roi === null
                    ? "N/A"
                    : `${workspaceTotals.roi.toFixed(1)}%`}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CREATE / EDIT CAMPAIGN */}
        {showForm && (
          <section
            id="campaign-form"
            className={`${cardClass} scroll-mt-5 overflow-hidden`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white px-4 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-xl text-white shadow-sm">
                  {editingId !== null ? "✎" : "＋"}
                </div>
                <div>
                  <h2 className="font-bold text-slate-950">
                    {editingId !== null ? "Edit campaign" : "Create a campaign"}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Campaign details, schedule, and financial goals
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                  setError("");
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close ×
              </button>
            </div>

            <form onSubmit={saveCampaign} className="space-y-5 p-4 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label htmlFor="campaign-name" className={labelClass}>
                    Campaign name *
                  </label>
                  <input
                    id="campaign-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Summer product launch"
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
                    onChange={(e) => setPlatform(e.target.value)}
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

                <div>
                  <label htmlFor="campaign-status" className={labelClass}>
                    Status
                  </label>
                  <select
                    id="campaign-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={inputClass}
                  >
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <label htmlFor="campaign-description" className={labelClass}>
                    Description
                  </label>
                  <textarea
                    id="campaign-description"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your campaign and target audience..."
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <label htmlFor="campaign-objectives" className={labelClass}>
                    Objectives and goals
                  </label>
                  <textarea
                    id="campaign-objectives"
                    rows={2}
                    value={objectives}
                    onChange={(e) => setObjectives(e.target.value)}
                    placeholder="Increase brand awareness, generate leads, or drive traffic..."
                    className={inputClass}
                  />
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
                    required
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="campaign-revenue" className={labelClass}>
                    Revenue (₹)
                  </label>
                  <input
                    id="campaign-revenue"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={revenue}
                    onChange={(e) => setRevenue(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="campaign-start" className={labelClass}>
                    Start date
                  </label>
                  <input
                    id="campaign-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
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
                    onChange={(e) => setEndDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowForm(false);
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-violet-600/20 transition hover:bg-violet-700 disabled:opacity-50"
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
        )}

        {/* SEARCH & FILTERS */}
        <section className={`${cardClass} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-lg text-indigo-700">
                ⌕
              </div>
              <div>
                <h2 className="font-bold text-slate-950">
                  Find your campaigns
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Search, filter, and sort your campaigns
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {hasFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50"
                >
                  Clear filters
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowFilters((value) => !value)}
                aria-expanded={showFilters}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {showFilters ? "Hide filters ↑" : "Show filters ↓"}
              </button>
            </div>
          </div>

          <div className="px-4 pb-4 sm:px-5">
            <label htmlFor="campaign-search" className="sr-only">
              Search campaigns
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-slate-400">
                ⌕
              </span>
              <input
                id="campaign-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, description, or objectives..."
                className={`${inputClass} pl-10`}
              />
            </div>
          </div>

          {showFilters && (
            <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:px-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <div>
                  <label htmlFor="filter-status" className={labelClass}>
                    Status
                  </label>
                  <select
                    id="filter-status"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className={inputClass}
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="filter-platform" className={labelClass}>
                    Platform
                  </label>
                  <select
                    id="filter-platform"
                    value={filterPlatform}
                    onChange={(e) => setFilterPlatform(e.target.value)}
                    className={inputClass}
                  >
                    <option value="all">All platforms</option>
                    {platformOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="sort-campaigns" className={labelClass}>
                    Sort by
                  </label>
                  <select
                    id="sort-campaigns"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className={inputClass}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="budget">Highest budget</option>
                    <option value="revenue">Highest revenue</option>
                    <option value="roi">Highest ROI</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="filter-start-date" className={labelClass}>
                    Start date after
                  </label>
                  <input
                    id="filter-start-date"
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="filter-end-date" className={labelClass}>
                    End date before
                  </label>
                  <input
                    id="filter-end-date"
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="min-budget" className={labelClass}>
                      Min budget
                    </label>
                    <input
                      id="min-budget"
                      type="number"
                      min="0"
                      value={minBudget}
                      onChange={(e) => setMinBudget(e.target.value)}
                      placeholder="₹ 0"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="max-budget" className={labelClass}>
                      Max budget
                    </label>
                    <input
                      id="max-budget"
                      type="number"
                      min="0"
                      value={maxBudget}
                      onChange={(e) => setMaxBudget(e.target.value)}
                      placeholder="No limit"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Showing{" "}
                  <span className="font-bold text-slate-900">
                    {filteredCampaigns.length}
                  </span>{" "}
                  of {campaigns.length} campaigns
                </p>
                {hasFilters && (
                  <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-700">
                    Filters applied
                  </span>
                )}
              </div>
            </div>
          )}
        </section>

        {/* CAMPAIGN GRID */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-600">
                Campaign library
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
                Your campaigns
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Manage content, monitor results, and take action.
              </p>
            </div>

            <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm">
              {filteredCampaigns.length}{" "}
              <span className="font-medium text-slate-400">results</span>
            </span>
          </div>

          {loading ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {[1, 2, 3, 4].map((item) => (
                <div
                  key={item}
                  className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <div className="flex gap-3">
                    <div className="h-11 w-11 rounded-xl bg-slate-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-2/3 rounded bg-slate-200" />
                      <div className="h-3 w-1/3 rounded bg-slate-100" />
                    </div>
                  </div>
                  <div className="mt-5 h-16 rounded-xl bg-slate-100" />
                  <div className="mt-3 h-20 rounded-xl bg-slate-100" />
                  <div className="mt-4 h-9 rounded-lg bg-slate-100" />
                </div>
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className={`${cardClass} px-5 py-12 text-center`}>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-2xl">
                ◈
              </div>
              <h3 className="mt-4 font-bold text-slate-950">
                Your campaign workspace is ready
              </h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                Create your first campaign to start organizing content and
                tracking performance.
              </p>
              <button
                type="button"
                onClick={openNewCampaign}
                className="mt-5 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white hover:bg-violet-700"
              >
                ＋ Create your first campaign
              </button>
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className={`${cardClass} px-5 py-12 text-center`}>
              <div className="text-3xl text-slate-300">⌕</div>
              <h3 className="mt-3 font-bold text-slate-900">
                No campaigns match your search
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Try different keywords or remove some filters.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid items-start gap-4 xl:grid-cols-2">
              {filteredCampaigns.map((campaign) => {
                const postStats = getPostStats(campaign.id);
                const stats: CampaignStats = {
                  ...initialStats,
                  ...analytics[campaign.id],
                };

                const effectiveBudget = Number(
                  campaign.budget ?? stats.budget ?? 0,
                );
                const effectiveRevenue = Number(
                  campaign.revenue ?? stats.revenue ?? 0,
                );

                const roi =
                  stats.roi != null
                    ? Number(stats.roi)
                    : getROI(effectiveRevenue, effectiveBudget);

                const isExpanded = expandedIds.includes(campaign.id);

                const postMetrics = [
                  {
                    label: "Published",
                    value: postStats.published,
                    style: "bg-emerald-50 text-emerald-700",
                  },
                  {
                    label: "Scheduled",
                    value: postStats.scheduled,
                    style: "bg-sky-50 text-sky-700",
                  },
                  {
                    label: "Drafts",
                    value: postStats.draft,
                    style: "bg-amber-50 text-amber-700",
                  },
                  {
                    label: "Failed",
                    value: postStats.failed,
                    style: "bg-rose-50 text-rose-700",
                  },
                ];

                const analyticsMetrics = [
                  { label: "Likes", value: numberFormat(stats.likes) },
                  { label: "Comments", value: numberFormat(stats.comments) },
                  { label: "Shares", value: numberFormat(stats.shares) },
                  { label: "Reach", value: numberFormat(stats.reach) },
                  { label: "Views", value: numberFormat(stats.views) },
                  {
                    label: "Publish attempts",
                    value: numberFormat(stats.publishing_attempts),
                  },
                  {
                    label: "Successful",
                    value: numberFormat(stats.successful_attempts),
                  },
                  {
                    label: "Failed attempts",
                    value: numberFormat(stats.failed_attempts),
                  },
                  {
                    label: "Success rate",
                    value: `${Number(stats.success_rate ?? 0).toFixed(1)}%`,
                  },
                ];

                return (
                  <article
                    key={campaign.id}
                    className="group min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg hover:shadow-violet-950/5"
                  >
                    <div className="h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-400" />

                    <div className="p-4 sm:p-5">
                      {/* Campaign identity */}
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-lg font-bold text-white shadow-sm">
                          {campaign.name.trim().charAt(0).toUpperCase() ||
                            "C"}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="break-words text-base font-bold text-slate-950">
                              {campaign.name}
                            </h3>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ring-1 ring-inset ${statusClass(campaign.status)}`}
                            >
                              {campaign.status}
                            </span>
                          </div>

                          <p className="mt-1 text-xs text-slate-500">
                            {campaign.platform || "No platform"}{" "}
                            <span className="mx-1 text-slate-300">•</span>
                            Campaign #{campaign.id}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => editCampaign(campaign)}
                          aria-label={`Edit ${campaign.name}`}
                          className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                        >
                          Edit
                        </button>
                      </div>

                      <p className="mt-3 min-h-10 text-sm leading-5 text-slate-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                        {campaign.description ||
                          "Add a description to give your team context for this campaign."}
                      </p>

                      {/* Timeline */}
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs">
                        <div>
                          <span className="text-slate-400">Start </span>
                          <span className="font-semibold text-slate-700">
                            {formatDate(campaign.start_date)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">End </span>
                          <span className="font-semibold text-slate-700">
                            {formatDate(campaign.end_date)}
                          </span>
                        </div>
                      </div>

                      {/* Financial cards */}
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="min-w-0 rounded-xl border border-slate-100 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Budget
                          </p>
                          <p
                            title={currency(effectiveBudget)}
                            className="mt-1 break-words text-sm font-bold text-slate-900"
                          >
                            {currency(effectiveBudget)}
                          </p>
                        </div>

                        <div className="min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            Revenue
                          </p>
                          <p
                            title={currency(effectiveRevenue)}
                            className="mt-1 break-words text-sm font-bold text-emerald-800"
                          >
                            {currency(effectiveRevenue)}
                          </p>
                        </div>

                        <div className="min-w-0 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                            ROI
                          </p>
                          <p
                            className={`mt-1 break-words text-sm font-bold ${
                              roi === null
                                ? "text-slate-400"
                                : roi >= 0
                                  ? "text-violet-800"
                                  : "text-rose-600"
                            }`}
                          >
                            {roi === null ? "N/A" : `${roi.toFixed(1)}%`}
                          </p>
                        </div>
                      </div>

                      {/* Content overview */}
                      <div className="mt-4">
                        <div className="mb-2 flex items-center justify-between">
                          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                            Content tracking
                          </h4>
                          <span className="text-xs font-semibold text-slate-500">
                            {postStats.total} total posts
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                          {postMetrics.map((metric) => (
                            <div
                              key={metric.label}
                              className={`min-w-0 rounded-xl px-1.5 py-2.5 text-center ${metric.style}`}
                            >
                              <p className="text-lg font-bold">
                                {metric.value}
                              </p>
                              <p className="mt-0.5 truncate text-[10px] font-semibold">
                                {metric.label}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Expandable detail area */}
                      <div className="mt-4 border-t border-slate-100 pt-3">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() =>
                            setExpandedIds((current) =>
                              isExpanded
                                ? current.filter((id) => id !== campaign.id)
                                : [...current, campaign.id],
                            )
                          }
                          className="flex w-full items-center justify-between gap-3 rounded-lg py-1 text-left text-sm font-semibold text-violet-700 transition hover:text-violet-900"
                        >
                          <span>
                            {isExpanded
                              ? "Hide detailed analytics"
                              : "View analytics & objectives"}
                          </span>
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-50 text-base">
                            {isExpanded ? "−" : "+"}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="mt-3 space-y-3">
                            {campaign.objectives && (
                              <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700">
                                  Campaign objectives
                                </p>
                                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-5 text-slate-700">
                                  {campaign.objectives}
                                </p>
                              </div>
                            )}

                            <div className="grid grid-cols-3 gap-2">
                              {analyticsMetrics.map((metric) => (
                                <div
                                  key={metric.label}
                                  className="min-w-0 rounded-xl border border-slate-100 p-2.5"
                                >
                                  <p className="text-[10px] leading-4 text-slate-500">
                                    {metric.label}
                                  </p>
                                  <p className="mt-1 break-words text-sm font-bold text-slate-800">
                                    {metric.value}
                                  </p>
                                </div>
                              ))}
                            </div>

                            {!campaign.objectives && (
                              <p className="text-xs text-slate-400">
                                No objectives have been added to this campaign.
                              </p>
                            )}

                            <p className="text-[11px] leading-5 text-slate-400">
                              Engagement and publishing figures depend on the
                              analytics returned by your backend.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/dashboard/posts?campaign=${campaign.id}`,
                            )
                          }
                          className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:text-sm"
                        >
                          View posts
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/dashboard/create-post?campaign=${campaign.id}`,
                            )
                          }
                          className="flex-1 rounded-xl bg-violet-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-violet-700 sm:text-sm"
                        >
                          ＋ Create post
                        </button>

                        <button
                          type="button"
                          onClick={() => void deleteCampaign(campaign)}
                          disabled={deletingId === campaign.id}
                          className="rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 sm:text-sm"
                        >
                          {deletingId === campaign.id
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="flex flex-col items-center justify-between gap-2 border-t border-slate-200/80 py-4 text-xs text-slate-400 sm:flex-row">
          <span>SocialPilot · Campaign management studio</span>
          <span>Plan · Publish · Measure · Grow</span>
        </footer>
      </div>
    </main>
  );
}
