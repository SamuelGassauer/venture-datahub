"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type SmartLogoProps = {
  src: string;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
};

/**
 * Logo component that detects white/light logos and adds a dark background.
 * Samples corner + center pixels from the image via an offscreen canvas.
 */
export function SmartLogo({ src, alt = "", className, fallback }: SmartLogoProps) {
  const [isLight, setIsLight] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setIsLight(false);
    setError(false);
  }, [src]);

  function analyzeImage() {
    const img = imgRef.current;
    if (!img || img.naturalWidth === 0) return;

    try {
      const canvas = document.createElement("canvas");
      const size = 32;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;

      // Sample pixels: corners, edges, and scattered points
      const samples: [number, number][] = [
        [0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1], // corners
        [Math.floor(size / 2), 0], [0, Math.floor(size / 2)],       // edge midpoints
        [size - 1, Math.floor(size / 2)], [Math.floor(size / 2), size - 1],
        [Math.floor(size / 4), Math.floor(size / 4)],               // inner quadrants
        [Math.floor(size * 3 / 4), Math.floor(size / 4)],
        [Math.floor(size / 4), Math.floor(size * 3 / 4)],
        [Math.floor(size * 3 / 4), Math.floor(size * 3 / 4)],
      ];

      let lightCount = 0;
      let transparentCount = 0;

      for (const [x, y] of samples) {
        const i = (y * size + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        if (a < 30) {
          // Nearly transparent — doesn't count as light but track it
          transparentCount++;
          continue;
        }

        // Perceived luminance (ITU-R BT.709)
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (luminance > 230) lightCount++;
      }

      const nonTransparent = samples.length - transparentCount;
      // Logo is "light" if >60% of non-transparent samples are very bright
      if (nonTransparent > 0 && lightCount / nonTransparent > 0.6) {
        setIsLight(true);
      }
    } catch {
      // Canvas tainted by CORS — can't analyze, leave default
    }
  }

  if (error) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0",
        isLight && "bg-zinc-800 dark:bg-zinc-700 ring-1 ring-zinc-700/50 dark:ring-zinc-600/50",
        !isLight && "bg-white dark:bg-zinc-100 ring-1 ring-border/40",
        className,
      )}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        crossOrigin="anonymous"
        className="h-full w-full object-contain p-px"
        onLoad={analyzeImage}
        onError={() => setError(true)}
      />
    </span>
  );
}
