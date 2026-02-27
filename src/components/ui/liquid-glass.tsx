"use client";

import {
  useRef,
  useEffect,
  useId,
  useState,
  type ReactNode,
  type HTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

interface LiquidGlassProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  distortion?: number;
  blur?: number;
  specular?: boolean;
}

function generateDisplacementMap(size: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(size, size);
  const d = imageData.data;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2;
  const n = 4;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = (x - cx) / radius;
      const ny = (y - cy) / radius;
      const dist = Math.pow(
        Math.pow(Math.abs(nx), n) + Math.pow(Math.abs(ny), n),
        1 / n
      );

      if (dist >= 1) {
        d[idx] = 128;
        d[idx + 1] = 128;
        d[idx + 2] = 128;
        d[idx + 3] = 255;
        continue;
      }

      const eps = 0.001;
      const distClamped = Math.max(dist, eps);
      const dhdd = -(Math.pow(distClamped, n - 1)) /
        Math.pow(1 - Math.pow(Math.min(distClamped, 0.999), n), (n - 1) / n);
      const dhdx = dhdd * (nx / Math.max(distClamped, eps));
      const dhdy = dhdd * (ny / Math.max(distClamped, eps));

      const strength = 0.5;
      d[idx] = Math.max(0, Math.min(255, 128 + dhdx * strength * 128));
      d[idx + 1] = Math.max(0, Math.min(255, 128 + dhdy * strength * 128));
      d[idx + 2] = 128;
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

export function LiquidGlass({
  children,
  className,
  distortion = 18,
  blur = 40,
  specular = true,
  style,
  ...props
}: LiquidGlassProps) {
  const uid = useId().replace(/:/g, "");
  const filterId = `lg-${uid}`;
  const ref = useRef<HTMLDivElement>(null);
  const [mapUrl, setMapUrl] = useState<string | null>(null);

  useEffect(() => {
    setMapUrl(generateDisplacementMap(256));
  }, []);

  useEffect(() => {
    if (!specular) return;
    const el = ref.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--lg-mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty("--lg-my", `${((e.clientY - r.top) / r.height) * 100}%`);
      el.style.setProperty("--lg-specular", "1");
    };

    const onLeave = () => {
      el.style.setProperty("--lg-mx", "50%");
      el.style.setProperty("--lg-my", "25%");
      el.style.setProperty("--lg-specular", "0");
    };

    el.style.setProperty("--lg-mx", "50%");
    el.style.setProperty("--lg-my", "25%");
    el.style.setProperty("--lg-specular", "0");

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [specular]);

  const backdropCss = `blur(${blur}px) saturate(180%) brightness(1.05)`;
  const filterCss = mapUrl ? `url(#${filterId})` : undefined;

  return (
    <>
      {mapUrl && (
        <svg
          width="0"
          height="0"
          aria-hidden="true"
          style={{ position: "absolute", width: 0, height: 0 }}
        >
          <defs>
            <filter
              id={filterId}
              x="-10%"
              y="-10%"
              width="120%"
              height="120%"
              colorInterpolationFilters="sRGB"
            >
              <feImage
                href={mapUrl}
                result="dispMap"
                preserveAspectRatio="none"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="dispMap"
                scale={distortion}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>
      )}

      <div
        ref={ref}
        className={cn("liquid-glass relative", className)}
        style={style}
        {...props}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-[inherit] pointer-events-none"
          style={{
            backdropFilter: backdropCss,
            WebkitBackdropFilter: backdropCss,
            filter: filterCss,
          }}
        />
        <div className="relative" style={{ zIndex: 1 }}>
          {children}
        </div>
      </div>
    </>
  );
}
