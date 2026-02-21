// web/app/dashboard/page.tsx
import DashboardClient from "./DashboardClient";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const tenant = (typeof sp.tenant === "string" && sp.tenant) || "horsens";

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Lead Dashboard</h1>
            <p className="text-sm text-gray-300">
              Tenant: <span className="font-medium text-white">{tenant}</span>
            </p>
          </div>

          <form action="/dashboard" method="get" className="flex items-center gap-2">
            <label className="text-sm text-gray-300">Tenant</label>
            <input
              name="tenant"
              defaultValue={tenant}
              className="w-44 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500"
              placeholder="horsens"
            />
            <button
              type="submit"
              className="rounded-lg bg-white px-3 py-2 text-sm text-black hover:bg-gray-200"
            >
              Skift
            </button>
          </form>
        </div>

        <DashboardClient tenant={tenant} />
      </div>
    </main>
  );
}