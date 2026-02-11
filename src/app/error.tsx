"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">500</h1>
        <p className="mt-2 text-muted-foreground">Something went wrong</p>
        <button
          className="mt-4 rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={reset}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
