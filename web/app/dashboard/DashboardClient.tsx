"use client";

import { useEffect, useRef, useState } from "react";
import CustomizePanel from "@/app/dashboard/CustomizePanel";
import GroupsPanel from "./GroupsPanel";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  KpiCard,
  StatsResponse,
  WidgetState,
  defaultWidgetState,
  formatTime,
  loadWidgetState,
  saveWidgetState,
} from "./widgets";

export type LeadEvent = {
  id: string;
  tenantKey: string;
  campaignKey: string;
  source: string;
  externalLeadId: string;
  email?: string | null;
  phone?: string | null;
  formId?: string | null;
  clubName?: string | null; // ✅ NY (kommer fra /api/events)
  receivedAt: string;
};

type EventsResponse = { ok: boolean; events: LeadEvent[] };

type Group = {
  tenantKey: string;
  groupKey: string;
  displayName: string;
  campaignKeys: string[];
};

type GroupsResponse = { ok: boolean; groups: Group[] };

export default function DashboardClient({ tenant }: { tenant: string }) {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroupKey, setActiveGroupKey] = useState<string>(""); // "" = ingen filter
  const [error, setError] = useState<string | null>(null);

  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [widgetState, setWidgetState] = useState<WidgetState>(defaultWidgetState());

  const [realtime, setRealtime] = useState<"checking" | "live" | "off" | "error">(
    "checking"
  );
  const esRef = useRef<EventSource | null>(null);

  const days = 7;
  const limit = 20;

  // Load widget prefs per tenant
  useEffect(() => {
    const loaded = loadWidgetState(tenant);
    setWidgetState(loaded);
  }, [tenant]);

  // Persist on change
  useEffect(() => {
    saveWidgetState(tenant, widgetState);
  }, [tenant, widgetState]);

  async function fetchGroups(t: string) {
    const res = await fetch(`/api/groups?tenant=${encodeURIComponent(t)}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`groups ${res.status}`);
    const json = (await res.json()) as GroupsResponse;
    return json.groups ?? [];
  }

  async function fetchStats(t: string, groupKey: string) {
    const q =
      `/api/stats?tenant=${encodeURIComponent(t)}&days=${days}` +
      (groupKey ? `&group=${encodeURIComponent(groupKey)}` : "");
    const res = await fetch(q, { cache: "no-store" });
    if (!res.ok) throw new Error(`stats ${res.status}`);
    return (await res.json()) as StatsResponse;
  }

  async function fetchEvents(t: string, groupKey: string) {
    const q =
      `/api/events?tenant=${encodeURIComponent(t)}&limit=${limit}` +
      (groupKey ? `&group=${encodeURIComponent(groupKey)}` : "");
    const res = await fetch(q, { cache: "no-store" });
    if (!res.ok) throw new Error(`events ${res.status}`);
    const json = (await res.json()) as EventsResponse;
    return json.events ?? [];
  }

  async function refreshAll(t: string, groupKey: string) {
    const [g, s, e] = await Promise.all([
      fetchGroups(t),
      fetchStats(t, groupKey),
      fetchEvents(t, groupKey),
    ]);
    setGroups(g);
    setStats(s);
    setEvents(e);
  }

  async function refreshGroupsOnly(t: string) {
    const res = await fetch(`/api/groups?tenant=${encodeURIComponent(t)}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`groups ${res.status}`);
    const json = (await res.json()) as GroupsResponse;
    setGroups(json.groups ?? []);
  }

  // Load data on tenant / group change
  useEffect(() => {
    setError(null);
    refreshAll(tenant, activeGroupKey).catch((e: any) =>
      setError(e?.message ?? "Kunne ikke hente data")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, activeGroupKey]);

  // Realtime SSE
  useEffect(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    setRealtime("checking");
    const url = `/api/stream?tenant=${encodeURIComponent(tenant)}`;

    (async () => {
      try {
        let ok = false;

        // Try HEAD first
        try {
          const head = await fetch(url, { method: "HEAD" });
          ok = head.ok;
        } catch {
          ok = false;
        }

        // Fallback GET check content-type
        if (!ok) {
          try {
            const get = await fetch(url, { method: "GET" });
            ok =
              get.ok &&
              (get.headers.get("content-type") || "").includes("text/event-stream");
          } catch {
            ok = false;
          }
        }

        if (!ok) {
          setRealtime("off");
          return;
        }

        const es = new EventSource(url);
        esRef.current = es;

        const onUpdate = async () => {
          try {
            await refreshAll(tenant, activeGroupKey);
            setRealtime("live");
          } catch {
            setRealtime("error");
          }
        };

        es.onopen = () => setRealtime("live");
        es.addEventListener("lead_created", onUpdate);
        es.onmessage = onUpdate;
        es.onerror = () => setRealtime("error");
      } catch {
        setRealtime("off");
      }
    })();

    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [tenant, activeGroupKey]);

  const activeGroupName =
    activeGroupKey && groups.find((g) => g.groupKey === activeGroupKey)?.displayName;

  // Widgets
  const renderKpis = () => {
    const kpiWidgets = [
      { id: "kpi_total" as const, title: "Total", value: stats?.total ?? "—" },
      { id: "kpi_today" as const, title: "I dag", value: stats?.today ?? "—" },
      {
        id: "kpi_last7" as const,
        title: `Sidste ${days} dage`,
        value: stats?.lastNDays ?? "—",
      },
      {
        id: "kpi_lastReceived" as const,
        title: "Sidst modtaget",
        value: formatTime(stats?.lastReceivedAt),
        small: true,
      },
    ].filter((w) => (widgetState as any)[w.id]);

    if (kpiWidgets.length === 0) return null;

    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiWidgets.map((w) => (
          <KpiCard
            key={w.id}
            title={w.title}
            value={w.value}
            small={(w as any).small}
          />
        ))}
      </div>
    );
  };

  const renderGroupFilter = () => {
    const rows = stats?.byGroup ?? [];
    if (rows.length === 0) return null;

    return (
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-lg">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Grupper</h2>

          <div className="text-xs text-gray-300">
            Filter:{" "}
            {activeGroupKey ? (
              <span className="font-medium text-white">
                {activeGroupName || activeGroupKey}
              </span>
            ) : (
              <span className="text-gray-400">Ingen</span>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-950 text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-200">Gruppe</th>
                <th className="px-4 py-3 font-medium text-gray-200">Leads</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-800">
                <td className="px-4 py-3">
                  <button
                    onClick={() => setActiveGroupKey("")}
                    className={
                      !activeGroupKey
                        ? "text-white font-semibold"
                        : "text-gray-300 hover:text-white"
                    }
                  >
                    Alle kampagner
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-100">{stats?.lastNDays ?? 0}</td>
              </tr>

              {rows.map((g) => (
                <tr key={g.groupKey} className="border-t border-gray-800">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setActiveGroupKey(g.groupKey)}
                      className={
                        activeGroupKey === g.groupKey
                          ? "text-white font-semibold"
                          : "text-gray-300 hover:text-white"
                      }
                    >
                      {g.displayName}
                    </button>
                    <div className="text-xs text-gray-500">{g.groupKey}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-100">{g.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  const renderGroupBarChart = () => {
    if (!widgetState.group_barchart) return null;

    const rows = stats?.byGroup ?? [];
    // Hvis du allerede har valgt en gruppe som filter, giver grafen typisk mindre mening
    if (activeGroupKey) return null;
    if (rows.length === 0) return null;

    const data = rows.slice(0, 12).map((g) => ({ name: g.displayName, count: g.count }));

    return (
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-lg">
        <h2 className="mb-4 text-base font-semibold text-white">Leads pr gruppe</h2>

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: "#cbd5e1" }}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={70}
              />
              <YAxis tick={{ fontSize: 12, fill: "#cbd5e1" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "#0b1220",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#fff",
                }}
                labelStyle={{ color: "#fff" }}
                itemStyle={{ color: "#fff" }}
              />
              <Bar dataKey="count" fill="#ffffff" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 text-xs text-gray-400">
          Viser top 12 grupper (sorteret som API’et returnerer).
        </div>
      </section>
    );
  };

  const renderLeadsOverTime = () => {
    if (!stats?.byDay || stats.byDay.length === 0) return null;

    return (
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-lg">
        <h2 className="mb-4 text-base font-semibold text-white">Leads over tid</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.byDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#cbd5e1" }} />
              <YAxis tick={{ fontSize: 12, fill: "#cbd5e1" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "#0b1220",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#fff",
                }}
                labelStyle={{ color: "#fff" }}
                itemStyle={{ color: "#fff" }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#ffffff"
                strokeWidth={3}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    );
  };

  const renderCampaignTable = () => {
    if (!widgetState.campaign_table) return null;

    return (
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-lg">
        <h2 className="mb-4 text-base font-semibold text-white">
          Leads per campaign{" "}
          {activeGroupName ? <span className="text-gray-400">({activeGroupName})</span> : null}
        </h2>

        {(stats?.byCampaign?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-300">Ingen campaign data endnu.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-950 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-200">Campaign</th>
                  <th className="px-4 py-3 font-medium text-gray-200">Leads</th>
                </tr>
              </thead>
              <tbody>
                {stats!.byCampaign!.slice(0, 50).map((c) => (
                  <tr key={c.campaignKey} className="border-t border-gray-800">
                    <td className="px-4 py-3 text-gray-100">{c.campaignKey}</td>
                    <td className="px-4 py-3 text-gray-100">{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  const renderRecentLeads = () => {
    if (!widgetState.recent_leads) return null;

    return (
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-lg">
        <h2 className="mb-4 text-base font-semibold text-white">
          Recent leads{" "}
          {activeGroupName ? <span className="text-gray-400">({activeGroupName})</span> : null}
        </h2>

        {events.length === 0 ? (
          <p className="text-sm text-gray-300">Ingen leads endnu.</p>
        ) : (
          <div className="space-y-3">
            {events.map((e) => {
              const primary = (e.clubName && e.clubName.trim()) || e.campaignKey;
              return (
                <div
                  key={e.id}
                  className="rounded-xl border border-gray-800 px-4 py-3 transition hover:bg-gray-950"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      {/* ✅ Primær linje: Klubnavn hvis vi har det */}
                      <div className="truncate text-sm font-medium text-white">
                        {primary === "unknown" ? (
                          <span className="font-bold text-red-400">unknown</span>
                        ) : (
                          primary
                        )}{" "}
                        <span
                          className={
                            e.source === "meta"
                              ? "text-blue-400 font-medium"
                              : e.source === "drupal"
                              ? "text-green-400 font-medium"
                              : "text-gray-400"
                          }
                        >
                          ({e.source})
                        </span>
                      </div>

                      {/* ✅ Sekundær linje: campaignKey hvis clubName er sat */}
                      <div className="mt-1 truncate text-xs text-gray-300">
                        {e.clubName ? (
                          <>
                            <span className="text-gray-400">{e.campaignKey}</span>
                            {" • "}
                          </>
                        ) : null}
                        {e.email || "—"}
                        {e.phone ? ` • ${e.phone}` : ""}
                        {e.formId ? ` • ${e.formId}` : ""}
                      </div>
                    </div>

                    <div className="shrink-0 text-xs text-gray-400">
                      {formatTime(e.receivedAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  const anyLeft = widgetState.campaign_table;
  const anyRight = widgetState.recent_leads;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-900 px-5 py-4 shadow-lg">
        <div className="text-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">Lead Dashboard</span>
            <span className="text-gray-600">•</span>
            <span className="text-gray-300">
              Tenant: <span className="font-medium text-white">{tenant}</span>
            </span>
            {activeGroupKey ? (
              <>
                <span className="text-gray-600">•</span>
                <span className="text-gray-300">
                  Gruppe:{" "}
                  <span className="font-medium text-white">
                    {activeGroupName || activeGroupKey}
                  </span>
                </span>
              </>
            ) : null}
          </div>

          <div className="mt-1 text-xs text-gray-300">
            <span className="font-medium text-gray-200">Realtime:</span>{" "}
            <span
              className={
                realtime === "live"
                  ? "font-semibold text-green-400"
                  : realtime === "error"
                  ? "font-semibold text-red-400"
                  : "font-semibold text-gray-200"
              }
            >
              {realtime.toUpperCase()}
            </span>
            {error ? <span className="ml-2 text-red-400">{error}</span> : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeGroupKey ? (
            <button
              onClick={() => setActiveGroupKey("")}
              className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-black"
            >
              Clear group filter
            </button>
          ) : null}

          <button
            onClick={() => setGroupsOpen(true)}
            className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-black"
          >
            Grupper
          </button>

          <button
            onClick={() => setCustomizeOpen(true)}
            className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-black"
          >
            Customize metrics
          </button>

          <button
            onClick={() =>
              refreshAll(tenant, activeGroupKey).catch((e: any) =>
                setError(e?.message ?? "Refresh fejlede")
              )
            }
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-200"
          >
            Refresh
          </button>
        </div>
      </div>

      {renderKpis()}
      {renderGroupFilter()}

      {anyLeft || anyRight ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            {renderLeadsOverTime()}
            {renderGroupBarChart()}
            {renderCampaignTable()}
          </div>
          <div className="space-y-6">{renderRecentLeads()}</div>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 text-sm text-gray-300 shadow-lg">
          Ingen widgets aktive. Klik{" "}
          <span className="font-medium text-white">Customize metrics</span> for at slå noget til.
        </div>
      )}

      <GroupsPanel
        open={groupsOpen}
        onClose={() => setGroupsOpen(false)}
        tenant={tenant}
        groups={groups}
        availableCampaignKeys={(stats?.byCampaign ?? []).map((x) => x.campaignKey)}
        onSaved={async () => {
          await refreshGroupsOnly(tenant);
          await refreshAll(tenant, activeGroupKey);
        }}
      />

      <CustomizePanel
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        state={widgetState}
        onChange={(next) => setWidgetState(next)}
      />
    </div>
  );
}