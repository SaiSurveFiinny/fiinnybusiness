"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import ReelCard from "./components/ReelCard";
import { useActiveReel } from "./hooks/useActiveReel";
import type { FeedReel } from "./lib/types";

export type { FeedReel };

export default function ReelsFeedClient({ reels }: { reels: FeedReel[] }) {
  const searchParams = useSearchParams();
  const targetReelId = searchParams.get("reelId");

  const sortedReels = useMemo(() => {
    if (!targetReelId) return reels;
    const idx = reels.findIndex((r) => r.id === targetReelId);
    if (idx <= 0) return reels;
    const target = reels[idx];
    const rest = reels.filter((_, i) => i !== idx);
    return [target, ...rest];
  }, [reels, targetReelId]);

  const { activeIndex, reportVisible } = useActiveReel();
  const [isMuted, setIsMuted] = useState(true);

  return (
    <div className="h-[calc(100dvh-4rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain bg-black">
      {sortedReels.map((reel, index) => (
        <ReelCard
          key={reel.id}
          reel={reel}
          index={index}
          activeIndex={activeIndex}
          isMuted={isMuted}
          onToggleMute={() => setIsMuted((muted) => !muted)}
          onVisible={reportVisible}
        />
      ))}
    </div>
  );
}
