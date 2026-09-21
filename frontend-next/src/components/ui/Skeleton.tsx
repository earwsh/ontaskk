'use client';

interface SkeletonProps {
  className?: string;
}

/** Placeholder block sized to match the content it stands in for. */
export default function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse rounded-lg bg-surface-hover ${className}`} />;
}
