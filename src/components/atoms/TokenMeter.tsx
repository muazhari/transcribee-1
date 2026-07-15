import React from "react";

interface TokenMeterProps {
  tokenCount: number;
  tokenLimit: number;
}

export default function TokenMeter({ tokenCount, tokenLimit }: TokenMeterProps) {
  const tokenPercentage = Math.min(100, (tokenCount / (tokenLimit || 1)) * 100);

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex justify-between text-[0.625rem] text-neutral-400 font-semibold">
        <span>Token Load</span>
        <span>
          {tokenCount.toLocaleString()} / {tokenLimit.toLocaleString()}
        </span>
      </div>
      <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden border border-white/5">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            tokenPercentage >= 85
              ? "bg-gradient-to-r from-orange-500 to-red-500"
              : "bg-gradient-to-r from-violet-500 to-indigo-500"
          }`}
          style={{ width: `${tokenPercentage}%` }}
        />
      </div>
    </div>
  );
}
