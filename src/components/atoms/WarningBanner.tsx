import React from "react";

interface WarningBannerProps {
  type: "warning" | "error";
  children: React.ReactNode;
}

export default function WarningBanner({ type, children }: WarningBannerProps) {
  const styles = {
    warning: "bg-orange-950/60 border-b border-orange-500/20 text-orange-300",
    error: "bg-red-950/60 border-b border-red-500/20 text-red-300",
  };

  return (
    <div className={`px-6 py-2.5 text-xs flex items-center gap-2 ${styles[type]}`}>
      <span className="shrink-0 text-base">⚠️</span>
      <span>{children}</span>
    </div>
  );
}
