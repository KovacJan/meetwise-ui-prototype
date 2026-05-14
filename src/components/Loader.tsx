"use client";

import {cn} from "@/lib/utils";
import {Loader2} from "lucide-react";

type LoaderVariant = "inline" | "sm" | "md" | "lg" | "page";

interface LoaderProps {
  variant?: LoaderVariant;
  /** Optional message shown below the spinner (used with page or md/lg) */
  message?: string;
  className?: string;
}

const sizeMap: Record<LoaderVariant, string> = {
  inline: "w-4 h-4",
  sm: "w-6 h-6",
  md: "w-10 h-10",
  lg: "w-14 h-14",
  page: "w-12 h-12",
};

export default function Loader({
  variant = "md",
  message,
  className,
}: LoaderProps) {
  const isPage = variant === "page";

  const spinner = (
    <Loader2
      className={cn(
        "animate-spin shrink-0 text-secondary",
        sizeMap[variant],
        !isPage && className,
      )}
      strokeWidth={2.5}
      aria-hidden
    />
  );

  if (isPage) {
    return (
      <div
        className={cn(
          "fixed inset-0 z-50 flex flex-col items-center justify-center gap-4",
          "bg-background/80 backdrop-blur-sm",
          className,
        )}
        role="status"
        aria-label={message ?? "Loading"}
      >
        <div className="glass rounded-2xl p-6 flex flex-col items-center justify-center gap-4 shadow-xl">
          {spinner}
          {message && (
            <p className="text-sm font-medium text-muted-foreground animate-pulse">
              {message}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center justify-center" role="status" aria-label="Loading">
      {spinner}
      {message && (variant === "lg" || variant === "md") && (
        <span className="ml-2 text-sm text-muted-foreground">{message}</span>
      )}
    </span>
  );
}
