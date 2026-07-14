import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "violet" | "red" | "yellow" | "green" | "neutral" | "violet-filled";
  pulsing?: boolean;
  className?: string;
}

export default function Badge({
  children,
  variant = "neutral",
  pulsing = false,
  className = "",
}: BadgeProps) {
  const baseStyles = "text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md border flex items-center gap-1.5 transition-colors select-none";

  const variants = {
    violet: "bg-violet-950/40 border-violet-500/20 text-violet-300",
    "violet-filled": "bg-violet-500 border-violet-400 text-white",
    red: "bg-red-950/40 border-red-500/20 text-red-400",
    yellow: "bg-yellow-950/40 border-yellow-500/20 text-yellow-400",
    green: "bg-green-950/40 border-green-500/20 text-green-400",
    neutral: "bg-neutral-950/40 border-white/5 text-neutral-300",
  };

  return (
    <span className={`${baseStyles} ${variants[variant]} ${className}`}>
      {pulsing && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
        </span>
      )}
      {children}
    </span>
  );
}
