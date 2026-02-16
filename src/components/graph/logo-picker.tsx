"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, ImageIcon, Loader2 } from "lucide-react";

type LogoCandidate = {
  url: string;
  score: number;
  source: string;
};

type LogoPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  website: string;
  onSelect: (logoUrl: string) => void;
};

export function LogoPicker({
  open,
  onOpenChange,
  companyName,
  website,
  onSelect,
}: LogoPickerProps) {
  const [candidates, setCandidates] = useState<LogoCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setCandidates([]);
      setSelected(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const encodedName = encodeURIComponent(companyName);
    fetch(`/api/companies/${encodedName}/logos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ website }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        setCandidates(data.candidates ?? []);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, companyName, website]);

  const handleSave = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/update-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "company",
          entityName: companyName,
          field: "logoUrl",
          value: selected,
        }),
      });
      if (res.ok) {
        onSelect(selected);
        onOpenChange(false);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Save failed (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [selected, companyName, onSelect, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose Logo for {companyName}</DialogTitle>
          <DialogDescription>
            Select the correct logo from images found on the company website.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          {loading && (
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && candidates.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              <p className="text-sm">No logo candidates found on this website.</p>
            </div>
          )}

          {!loading && candidates.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {candidates.map((c) => (
                <button
                  key={c.url}
                  onClick={() => setSelected(c.url === selected ? null : c.url)}
                  className={`relative flex flex-col items-center justify-center rounded-lg border-2 bg-white p-3 aspect-square transition-all hover:shadow-md ${
                    selected === c.url
                      ? "border-blue-500 shadow-md ring-2 ring-blue-500/20"
                      : "border-muted hover:border-muted-foreground/30"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.url}
                    alt={c.source}
                    className="max-h-full max-w-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  {selected === c.url && (
                    <div className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                  <span className="absolute bottom-1 left-1 right-1 truncate text-center text-[10px] text-muted-foreground">
                    {c.source}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!selected || saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
