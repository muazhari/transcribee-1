import { useState, useEffect, useRef } from "react";

export const DEFAULT_LEFT_WIDTH = 320;
export const DEFAULT_RIGHT_WIDTH = 384;
export const MIN_LEFT_WIDTH = 220;
export const MIN_RIGHT_WIDTH = 260;
const MIN_MAIN_WIDTH = 320;
const KEYBOARD_RESIZE_STEP = 16;

function clampPanelWidth(
  value: number,
  minWidth: number,
  otherPanelWidth: number,
  containerWidth: number,
) {
  const maxWidth =
    containerWidth > 0
      ? Math.max(minWidth, containerWidth - otherPanelWidth - MIN_MAIN_WIDTH)
      : value;
  return Math.round(Math.min(Math.max(value, minWidth), maxWidth));
}

export function useResizablePanels() {
  const layoutRef = useRef<HTMLDivElement>(null);
  const [panelWidths, setPanelWidths] = useState({
    left: DEFAULT_LEFT_WIDTH,
    right: DEFAULT_RIGHT_WIDTH,
  });
  const [dragging, setDragging] = useState<"left" | "right" | null>(null);
  const dragRef = useRef<{
    side: "left" | "right";
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    const clampToViewport = () => {
      const width = layoutRef.current?.clientWidth ?? 0;
      if (width < 1024) return;
      setPanelWidths((prev) => {
        if (prev.left + prev.right <= width - MIN_MAIN_WIDTH) return prev;
        const left = clampPanelWidth(
          prev.left,
          MIN_LEFT_WIDTH,
          prev.right,
          width,
        );
        const right = clampPanelWidth(prev.right, MIN_RIGHT_WIDTH, left, width);
        return left === prev.left && right === prev.right
          ? prev
          : { left, right };
      });
    };
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, []);

  const startResize = (
    side: "left" | "right",
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      side,
      startX: e.clientX,
      startWidth: side === "left" ? panelWidths.left : panelWidths.right,
    };
    setDragging(side);
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const containerWidth = layoutRef.current?.clientWidth ?? 0;
    const delta =
      drag.side === "left" ? e.clientX - drag.startX : drag.startX - e.clientX;
    setPanelWidths((prev) =>
      drag.side === "left"
        ? {
            ...prev,
            left: clampPanelWidth(
              drag.startWidth + delta,
              MIN_LEFT_WIDTH,
              prev.right,
              containerWidth,
            ),
          }
        : {
            ...prev,
            right: clampPanelWidth(
              drag.startWidth + delta,
              MIN_RIGHT_WIDTH,
              prev.left,
              containerWidth,
            ),
          },
    );
  };

  const stopResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleResizeKeyDown = (
    side: "left" | "right",
    e: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const containerWidth = layoutRef.current?.clientWidth ?? 0;
    const sign = (e.key === "ArrowRight" ? 1 : -1) * (side === "left" ? 1 : -1);
    const delta = sign * KEYBOARD_RESIZE_STEP;
    setPanelWidths((prev) =>
      side === "left"
        ? {
            ...prev,
            left: clampPanelWidth(
              prev.left + delta,
              MIN_LEFT_WIDTH,
              prev.right,
              containerWidth,
            ),
          }
        : {
            ...prev,
            right: clampPanelWidth(
              prev.right + delta,
              MIN_RIGHT_WIDTH,
              prev.left,
              containerWidth,
            ),
          },
    );
  };

  return {
    layoutRef,
    panelWidths,
    dragging,
    startResize,
    handleResizeMove,
    stopResize,
    handleResizeKeyDown,
  };
}
