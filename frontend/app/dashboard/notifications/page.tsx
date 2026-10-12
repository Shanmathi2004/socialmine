
"use client";

import { useCallback, useEffect, useState } from "react";

type Notification = {
  id: number;
  user_id: number;
  post_id: number | null;
  title: string;
  message: string;
  notification_type: string;
  platform: string | null;
  is_read: boolean;
  created_at: string;
};

type NotificationResponse = {
  total: number;
  unread_count: number;
  notifications: Notification[];
};

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

function getToken(): string | null {
  if (typeof window === "undefined") return null;

  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("token")
  );
}

function getTypeIcon(type: string) {
  const value = type.toLowerCase();

  if (value.includes("publish") || value.includes("success")) return "✓";
  if (value.includes("fail") || value.includes("error")) return "!";
  if (value.includes("schedule")) return "◷";
  if (value.includes("campaign")) return "◎";
  return "●";
}

function getTypeColor(type: string) {
  const value = type.toLowerCase();

  if (value.includes("fail") || value.includes("error")) {
    return "bg-red-100 text-red-700";
  }

  if (value.includes("publish") || value.includes("success")) {
    return "bg-green-100 text-green-700";
  }

  if (value.includes("schedule")) {
    return "bg-blue-100 text-blue-700";
  }

  return "bg-violet-100 text-violet-700";
}

function formatDate(date: string) {
  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return "Recently";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const request = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const token = getToken();

      if (!token) {
        throw new Error(
          "Login session not found. Please log in again."
        );
      }

      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.body
            ? { "Content-Type": "application/json" }
            : {}),
          ...options.headers,
        },
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "Your session may have expired. Please log in again."
        );
      }

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.detail || `Request failed (${response.status}).`
        );
      }

      if (response.status === 204) return null;

      return response.json();
    },
    []
  );

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const query =
        filter === "unread" ? "?unread_only=true" : "";

      const data = (await request(
        `/api/notifications/${query}`
      )) as NotificationResponse;

      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unread_count ?? 0);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load notifications."
      );
    } finally {
      setLoading(false);
    }
  }, [filter, request]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  async function markAsRead(id: number) {
    setActionId(id);
    setError("");

    try {
      await request(`/api/notifications/${id}/read`, {
        method: "PATCH",
      });

      await loadNotifications();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to mark as read."
      );
    } finally {
      setActionId(null);
    }
  }

  async function markAllAsRead() {
    if (unreadCount === 0) return;

    setMarkingAll(true);
    setError("");

    try {
      await request("/api/notifications/read-all", {
        method: "PATCH",
      });

      await loadNotifications();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to mark notifications as read."
      );
    } finally {
      setMarkingAll(false);
    }
  }

  async function deleteNotification(id: number) {
    setActionId(id);
    setError("");

    try {
      await request(`/api/notifications/${id}`, {
        method: "DELETE",
      });

      await loadNotifications();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete notification."
      );
    } finally {
      setActionId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        {/* Page heading */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 text-sm font-medium text-violet-600">
              SOCIALPILOT / ACTIVITY
            </div>

            <h1 className="text-3xl font-bold tracking-tight">
              Notifications
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Stay updated on your posts, publishing activity, and campaigns.
            </p>
          </div>

          <button
            type="button"
            onClick={markAllAsRead}
            disabled={unreadCount === 0 || markingAll}
            className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {markingAll ? "Updating..." : "✓ Mark all as read"}
          </button>
        </div>

        {/* Summary cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Total notifications</p>
            <p className="mt-2 text-3xl font-bold">{total}</p>
            <p className="mt-1 text-xs text-slate-400">
              Notifications in the selected view
            </p>
          </div>

          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-5 shadow-sm">
            <p className="text-sm text-violet-700">Unread notifications</p>
            <p className="mt-2 text-3xl font-bold text-violet-700">
              {unreadCount}
            </p>
            <p className="mt-1 text-xs text-violet-600">
              Need your attention
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Read notifications</p>
            <p className="mt-2 text-3xl font-bold">
              {Math.max(total - unreadCount, 0)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Already reviewed
            </p>
          </div>
        </div>

        {/* Notification list */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold">Recent activity</h2>
              <p className="mt-1 text-sm text-slate-500">
                Your latest updates and alerts
              </p>
            </div>

            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  filter === "all"
                    ? "bg-white text-violet-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All
              </button>

              <button
                type="button"
                onClick={() => setFilter("unread")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  filter === "unread"
                    ? "bg-white text-violet-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Unread
                {unreadCount > 0 && (
                  <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              <p className="font-semibold">Something went wrong</p>
              <p className="mt-1">{error}</p>
              <button
                type="button"
                onClick={() => void loadNotifications()}
                className="mt-3 font-semibold underline"
              >
                Try again
              </button>
            </div>
          )}

          {loading ? (
            <div className="space-y-4 p-6">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="flex animate-pulse gap-4"
                >
                  <div className="h-12 w-12 rounded-xl bg-slate-200" />
                  <div className="flex-1 space-y-3 py-1">
                    <div className="h-4 w-1/3 rounded bg-slate-200" />
                    <div className="h-3 w-3/4 rounded bg-slate-100" />
                    <div className="h-3 w-1/4 rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50 text-3xl text-violet-600">
                ♧
              </div>

              <h3 className="mt-5 text-lg font-bold">
                {filter === "unread"
                  ? "You're all caught up!"
                  : "No notifications yet"}
              </h3>

              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                {filter === "unread"
                  ? "You have no unread notifications. Check back when there are new updates."
                  : "Updates about your scheduled posts, publishing results, and campaigns will appear here."}
              </p>

              {filter === "unread" && (
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className="mt-5 font-semibold text-violet-600 hover:text-violet-700"
                >
                  View all notifications
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((notification) => (
                <article
                  key={notification.id}
                  className={`flex gap-3 p-5 transition hover:bg-slate-50 sm:gap-4 ${
                    !notification.is_read ? "bg-violet-50/40" : ""
                  }`}
                >
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold ${getTypeColor(
                      notification.notification_type
                    )}`}
                  >
                    {getTypeIcon(notification.notification_type)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words font-semibold text-slate-900">
                        {notification.title}
                      </h3>

                      {!notification.is_read && (
                        <span className="h-2 w-2 rounded-full bg-violet-600" />
                      )}
                    </div>

                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
                      {notification.message}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>{formatDate(notification.created_at)}</span>

                      {notification.platform && (
                        <>
                          <span>·</span>
                          <span className="capitalize">
                            {notification.platform}
                          </span>
                        </>
                      )}

                      {notification.post_id !== null && (
                        <>
                          <span>·</span>
                          <span>Post #{notification.post_id}</span>
                        </>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      {!notification.is_read && (
                        <button
                          type="button"
                          disabled={actionId === notification.id}
                          onClick={() =>
                            void markAsRead(notification.id)
                          }
                          className="text-xs font-semibold text-violet-700 hover:text-violet-900 disabled:opacity-50"
                        >
                          Mark as read
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={actionId === notification.id}
                        onClick={() =>
                          void deleteNotification(notification.id)
                        }
                        className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        {actionId === notification.id
                          ? "Processing..."
                          : "Delete"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!loading && notifications.length > 0 && (
            <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
              Showing {notifications.length} notification
              {notifications.length !== 1 ? "s" : ""}.
            </div>
          )}
        </section>

        <p className="mt-5 text-center text-xs text-slate-400">
          SocialPilot · Your social media activity in one place
        </p>
      </div>
    </main>
  );
}
