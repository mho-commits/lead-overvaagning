"use client";

import React from "react";

export type WidgetId =
  | "kpi_total"
  | "kpi_today"
  | "kpi_last7"
  | "kpi_lastReceived"
  | "campaign_table"
  | "recent_leads"
  | "group_barchart";

export type WidgetState = Record<WidgetId, boolean>;

export const WIDGETS: { id: WidgetId; label: string }[] = [
  { id: "kpi_total", label: "KPI: Total" },
  { id: "kpi_today", label: "KPI: I dag" },
  { id: "kpi_last7", label: "KPI: Sidste 7 dage" },
  { id: "kpi_lastReceived", label: "KPI: Sidst modtaget" },
  { id: "campaign_table", label: "Leads per campaign" },
  { id: "recent_leads", label: "Recent leads" },
  { id: "group_barchart", label: "Graf: Leads pr gruppe" },
];

export function defaultWidgetState(): WidgetState {
  const state: WidgetState = {} as WidgetState;
  for (const w of WIDGETS) state[w.id] = true;
  return state;
}

const storageKey = (tenant: string) => `lead_dashboard_widgets_${tenant}`;

export function loadWidgetState(tenant: string): WidgetState {
  try {
    const raw = localStorage.getItem(storageKey(tenant));
    if (!raw) return defaultWidgetState();

    const parsed = JSON.parse(raw) as Partial<WidgetState>;
    const base = defaultWidgetState();

    for (const k of Object.keys(base) as WidgetId[]) {
      if (typeof parsed[k] === "boolean") {
        base[k] = parsed[k] as boolean;
      }
    }

    return base;
  } catch {
    return defaultWidgetState();
  }
}

export function saveWidgetState(tenant: string, state: WidgetState) {
  try {
    localStorage.setItem(storageKey(tenant), JSON.stringify(state));
  } catch {}
}

export type StatsResponse = {
  ok: boolean;
  tenant: string;
  days: number;

  total: number;
  today: number;
  lastNDays: number;

  lastReceivedAt: string | null;

  byCampaign: { campaignKey: string; count: number }[];
  byDay: { date: string; count: number }[];
  byGroup?: { groupKey: string; displayName: string; count: number }[];
};

export function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function KpiCard({
  title,
  value,
  small,
}: {
  title: string;
  value: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 shadow-lg transition hover:shadow-xl">
      <div className="text-xs font-medium text-gray-300">{title}</div>
      <div
        className={
          small
            ? "mt-1 text-sm font-semibold text-white"
            : "mt-1 text-2xl font-semibold text-white"
        }
      >
        {value}
      </div>
    </div>
  );
}