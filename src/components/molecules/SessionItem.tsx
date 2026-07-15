import React from "react";
import { Session } from "../../lib/services/db";
import Button from "../atoms/Button";

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

export default function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
}: SessionItemProps) {
  const dateStr = new Date(session.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const defaultTitle = `Session - ${dateStr}`;

  return (
    <div
      onClick={onSelect}
      className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer border transition-all ${
        isActive
          ? "bg-violet-950/40 border-violet-500/50 shadow-md shadow-violet-950/20"
          : "bg-neutral-900/40 border-white/5 hover:bg-neutral-900/80 hover:border-white/10"
      }`}
    >
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="text-xs font-bold text-white truncate">
          {session.title || defaultTitle}
        </span>
        <span className="text-[0.625rem] text-neutral-500">{dateStr}</span>
      </div>
      <Button
        variant="icon"
        size="none"
        onClick={onDelete}
        className="hover:text-red-400"
        title="Delete session"
      >
        🗑️
      </Button>
    </div>
  );
}
