"use client";

import { useEffect, useMemo, useState } from "react";

type Group = {
  tenantKey: string;
  groupKey: string;
  displayName: string;
  campaignKeys: string[];
};

type ClubRow = { clubId: string; clubName: string; leads: number };

export default function GroupsPanel({
  open,
  onClose,
  tenant,
  groups,
  availableCampaignKeys,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  tenant: string;
  groups: Group[];
  availableCampaignKeys: string[];
  onSaved: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<"groups" | "clubs">("groups");

  // group editor
  const [mode, setMode] = useState<"list" | "edit">("list");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [groupKey, setGroupKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // clubs tab
  const [clubDays, setClubDays] = useState(7);
  const [clubLoading, setClubLoading] = useState(false);
  const [clubError, setClubError] = useState<string | null>(null);
  const [clubRows, setClubRows] = useState<ClubRow[]>([]);

  const allCampaignKeys = useMemo(() => {
    const set = new Set<string>();
    for (const k of availableCampaignKeys) if (k) set.add(k);
    for (const g of groups) for (const k of g.campaignKeys) if (k) set.add(k);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [availableCampaignKeys, groups]);

  const filteredCampaignKeys = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allCampaignKeys;
    return allCampaignKeys.filter((k) => k.toLowerCase().includes(q));
  }, [allCampaignKeys, search]);

  function selectedKeysFromState(sel: Record<string, boolean>) {
    return Object.entries(sel)
      .filter(([, v]) => v)
      .map(([k]) => k);
  }

  const selectedCount = useMemo(() => selectedKeysFromState(selected).length, [selected]);

  useEffect(() => {
    if (!open) return;
    setTab("groups");
    setMode("list");
    setError(null);
    setSaving(false);
    setSearch("");
    setClubDays(7);
    setClubRows([]);
    setClubLoading(false);
    setClubError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (tab !== "clubs") return;
    if (!tenant) return;

    let cancelled = false;

    async function load() {
      setClubLoading(true);
      setClubError(null);
      try {
        const qs = new URLSearchParams({ tenant, days: String(clubDays) });
        const res = await fetch(`/api/grouped/clubs?${qs.toString()}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.ok) throw new Error(json?.error || `Fetch fejlede (${res.status})`);
        if (!cancelled) {
  const rows: ClubRow[] = (json.rows ?? []).slice().sort((a: ClubRow, b: ClubRow) => (b.leads ?? 0) - (a.leads ?? 0));
  setClubRows(rows);
}
      } catch (e: any) {
        if (!cancelled) setClubError(e?.message ?? "Ukendt fejl");
      } finally {
        if (!cancelled) setClubLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open, tab, tenant, clubDays]);

  if (!open) return null;

  function startCreate() {
    setError(null);
    setMode("edit");
    setGroupKey("");
    setDisplayName("");
    setSearch("");
    const next: Record<string, boolean> = {};
    for (const k of allCampaignKeys) next[k] = false;
    setSelected(next);
  }

  function startEdit(g: Group) {
    setError(null);
    setMode("edit");
    setGroupKey(g.groupKey);
    setDisplayName(g.displayName);
    setSearch("");
    const inGroup = new Set(g.campaignKeys || []);
    const next: Record<string, boolean> = {};
    for (const k of allCampaignKeys) next[k] = inGroup.has(k);
    setSelected(next);
  }

  function toggleKey(k: string) {
    setSelected((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  function selectAllFiltered(value: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const k of filteredCampaignKeys) next[k] = value;
      return next;
    });
  }

  async function save() {
    setError(null);

    const gk = groupKey.trim();
    const dn = displayName.trim();
    const keys = selectedKeysFromState(selected);

    if (!gk) return setError("Group key mangler (fx drupal-32).");
    if (!dn) return setError("Display name mangler (fx Drupal kampagner (32)).");
    if (keys.length === 0) return setError("Vælg mindst 1 campaign i gruppen.");

    setSaving(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantKey: tenant, groupKey: gk, displayName: dn, campaignKeys: keys }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Save fejlede (${res.status})`);

      await onSaved();
      setMode("list");
    } catch (e: any) {
      setError(e?.message ?? "Ukendt fejl");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Overblik</h2>
            <div className="text-xs text-gray-400">Tenant: {tenant}</div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-5 flex items-center gap-2">
          <button
            onClick={() => setTab("groups")}
            className={
              tab === "groups"
                ? "rounded-xl bg-white px-3 py-2 text-sm font-medium text-black"
                : "rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm font-medium text-white hover:bg-black"
            }
          >
            Grupper
          </button>

          <button
            onClick={() => setTab("clubs")}
            className={
              tab === "clubs"
                ? "rounded-xl bg-white px-3 py-2 text-sm font-medium text-black"
                : "rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm font-medium text-white hover:bg-black"
            }
          >
            Klubber (leads)
          </button>
        </div>

        {/* Clubs tab */}
        {tab === "clubs" ? (
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white">Samlet leads pr. klub</div>
                <div className="text-xs text-gray-400">Henter fra /api/grouped/clubs</div>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Periode</label>
                <select
                  value={clubDays}
                  onChange={(e) => setClubDays(Number(e.target.value))}
                  className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white"
                >
                  <option value={1}>1 dag</option>
                  <option value={7}>7 dage</option>
                  <option value={14}>14 dage</option>
                  <option value={30}>30 dage</option>
                </select>
              </div>
            </div>

            {clubLoading ? (
              <div className="text-sm text-gray-300">Henter...</div>
            ) : clubError ? (
              <div className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">
                {clubError}
              </div>
            ) : clubRows.length === 0 ? (
              <div className="text-sm text-gray-300">Ingen data.</div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 text-left">
                    <tr>
                      <th className="px-4 py-3 font-medium text-gray-200">Klub</th>
                      <th className="px-4 py-3 font-medium text-gray-200">Club ID</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-200">Leads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clubRows.map((r) => (
                      <tr key={`${r.clubId ?? "no-id"}-${r.clubName ?? "no-name"}`} className="border-t border-gray-800">
                        <td className="px-4 py-3 text-gray-100">{r.clubName || "Ukendt klub"}</td>
<td className="px-4 py-3 text-gray-300">{r.clubId || "—"}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-100">
                          {r.leads}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={onClose}
                className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-black"
              >
                Luk
              </button>
            </div>
          </div>
        ) : null}

        {/* Groups tab (existing) */}
        {tab === "groups" ? (
          <>
            {mode === "list" ? (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-sm text-gray-300">Saml flere kampagner i én gruppe.</div>
                  <button
                    onClick={startCreate}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-200"
                  >
                    + Ny gruppe
                  </button>
                </div>

                {groups.length === 0 ? (
                  <div className="rounded-xl border border-gray-800 bg-gray-950 p-4 text-sm text-gray-300">
                    Ingen grupper endnu.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-gray-800">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-950 text-left">
                        <tr>
                          <th className="px-4 py-3 font-medium text-gray-200">Navn</th>
                          <th className="px-4 py-3 font-medium text-gray-200">Group key</th>
                          <th className="px-4 py-3 font-medium text-gray-200">Kampagner</th>
                          <th className="px-4 py-3 font-medium text-gray-200"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map((g) => (
                          <tr key={g.groupKey} className="border-t border-gray-800">
                            <td className="px-4 py-3 text-gray-100">{g.displayName}</td>
                            <td className="px-4 py-3 text-gray-300">{g.groupKey}</td>
                            <td className="px-4 py-3 text-gray-300">{g.campaignKeys?.length ?? 0}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => startEdit(g)}
                                className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-xs font-medium text-white hover:bg-black"
                              >
                                Redigér
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-gray-300">Group key</label>
                    <input
                      value={groupKey}
                      onChange={(e) => setGroupKey(e.target.value)}
                      placeholder="drupal-32"
                      className="mt-2 w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    />
                    <p className="mt-2 text-xs text-gray-500">Brug et stabilt key uden mellemrum.</p>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-300">Display name</label>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Drupal kampagner (32)"
                      className="mt-2 w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    />
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-gray-800 bg-gray-950 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-medium text-white">
                      Vælg campaigns <span className="text-gray-400">({selectedCount} valgt)</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => selectAllFiltered(true)}
                        className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-black"
                      >
                        Select all (filter)
                      </button>
                      <button
                        onClick={() => selectAllFiltered(false)}
                        className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-black"
                      >
                        Clear (filter)
                      </button>
                    </div>
                  </div>

                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Søg campaignKey…"
                    className="w-full rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                  />

                  <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-gray-800">
                    {filteredCampaignKeys.length === 0 ? (
                      <div className="p-4 text-sm text-gray-300">Ingen match.</div>
                    ) : (
                      <ul className="divide-y divide-gray-800">
                        {filteredCampaignKeys.map((k) => (
                          <li key={k} className="flex items-center justify-between px-4 py-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm text-gray-100">{k}</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={!!selected[k]}
                              onChange={() => toggleKey(k)}
                              className="h-4 w-4 accent-white"
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {error ? (
                  <div className="mt-4 rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">
                    {error}
                  </div>
                ) : null}

                <div className="mt-6 flex items-center justify-between">
                  <button
                    onClick={() => setMode("list")}
                    className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-black"
                  >
                    Tilbage
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={onClose}
                      className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-black"
                    >
                      Luk
                    </button>

                    <button
                      onClick={save}
                      disabled={saving}
                      className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-200 disabled:opacity-60"
                    >
                      {saving ? "Gemmer..." : "Gem gruppe"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}