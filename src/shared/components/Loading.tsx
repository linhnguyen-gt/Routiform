"use client";

import { cn } from "@/shared/utils/cn";
import type { HTMLAttributes } from "react";

type SpinnerSize = "sm" | "md" | "lg" | "xl";
type LoadingType = "spinner" | "page" | "skeleton" | "card";

const spinnerSizes: Record<SpinnerSize, string> = {
  sm: "size-4",
  md: "size-6",
  lg: "size-8",
  xl: "size-12",
};

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

interface PageLoadingProps {
  message?: string;
  className?: string;
}

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

interface LoadingProps extends HTMLAttributes<HTMLDivElement> {
  type?: LoadingType;
  className?: string;
  message?: string;
  size?: SpinnerSize;
  label?: string;
}

// Modern Spinner with CSS animation
export function Spinner({ size = "md", className, label = "Loading" }: SpinnerProps) {
  const sizeClasses: Record<SpinnerSize, string> = {
    sm: "size-4",
    md: "size-6",
    lg: "size-8",
    xl: "size-12",
  };

  const strokeWidths: Record<SpinnerSize, string> = {
    sm: "3",
    md: "3",
    lg: "3",
    xl: "2",
  };

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn("inline-flex items-center justify-center", className)}
    >
      <span className="sr-only">{label}</span>
      <svg
        aria-hidden="true"
        className={cn("text-primary", sizeClasses[size])}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background track */}
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth={strokeWidths[size]}
          strokeLinecap="round"
          className="opacity-20"
        />
        {/* Animated spinner arc - chỉ phần này quay */}
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth={strokeWidths[size]}
          strokeLinecap="round"
          fill="none"
          style={{
            transformOrigin: "center",
            strokeDasharray: "40 100",
            animation: "spinner-rotate 1s linear infinite",
          }}
        />
      </svg>
      <style jsx>{`
        @keyframes spinner-rotate {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </span>
  );
}

// Full page loading with modern design
export function PageLoading({ message = "Loading...", className }: PageLoadingProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg px-6",
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative">
        <Spinner size="xl" />
        <div className="absolute inset-0 -z-10 blur-xl">
          <Spinner size="xl" className="opacity-50 text-primary/50" />
        </div>
      </div>
      <p className="mt-6 text-text-muted text-center animate-pulse">{message}</p>
    </div>
  );
}

// Skeleton loading
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse motion-reduce:animate-none rounded-lg bg-border", className)}
      {...props}
    />
  );
}

// Card skeleton
export function CardSkeleton() {
  return (
    <div className="p-6 rounded-xl border border-border bg-surface" aria-hidden="true">
      <div className="flex items-center justify-between mb-4 gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="size-10 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-16 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

// Default export
export default function Loading({
  type = "spinner",
  className,
  message,
  size,
  label,
  ...props
}: LoadingProps) {
  switch (type) {
    case "page":
      return <PageLoading message={message} className={className} />;
    case "skeleton":
      return <Skeleton className={className} {...props} />;
    case "card":
      return <CardSkeleton />;
    default:
      return <Spinner size={size} className={className} label={label} />;
  }
}
