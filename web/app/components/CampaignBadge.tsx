// web/app/components/CampaignBadge.tsx
import React from "react";

export function CampaignBadge({ campaignKey }: { campaignKey: string }) {
  const isUnknown = !campaignKey || campaignKey === "unknown";

  if (!isUnknown) {
    return (
      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
        {campaignKey}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs text-red-700">
      unknown
    </span>
  );
}