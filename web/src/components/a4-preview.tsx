"use client";

import { useEffect, useRef, useState } from "react";

// A4 at 96dpi.
const A4_W = 794;
const A4_H = 1123;

/**
 * Renders a self-contained A4 report document scaled to the container's
 * width. The sheet always fits horizontally, so the only scrollbar is the
 * vertical one of whatever wraps this component; the iframe itself never
 * scrolls.
 */
export function A4Preview({ html, title }: { html: string; title: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / A4_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="w-full">
      <div style={{ height: scale ? A4_H * scale : undefined, overflow: "hidden" }}>
        {scale > 0 && (
          <iframe
            srcDoc={html}
            title={title}
            className="rounded bg-white shadow-card"
            style={{
              width: A4_W,
              height: A4_H,
              border: 0,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        )}
      </div>
    </div>
  );
}
