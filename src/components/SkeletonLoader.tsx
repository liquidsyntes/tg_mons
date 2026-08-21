'use client';

import React from 'react';

export function OverviewSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Top Banner Skeleton */}
      <div className="h-44 bg-surface rounded-2xl border border-border p-6 space-y-4">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-slate-800 rounded"></div>
            <div className="h-4 w-32 bg-slate-800/60 rounded"></div>
          </div>
          <div className="h-8 w-24 bg-slate-800 rounded"></div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
          <div className="h-14 bg-slate-800/40 rounded-xl"></div>
          <div className="h-14 bg-slate-800/40 rounded-xl"></div>
          <div className="h-14 bg-slate-800/40 rounded-xl"></div>
          <div className="h-14 bg-slate-800/40 rounded-xl"></div>
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <div className="h-6 w-36 bg-slate-800 rounded"></div>
          <div className="h-8 w-64 bg-slate-800 rounded"></div>
        </div>
        <div className="divide-y divide-border">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-800"></div>
                <div className="space-y-1.5">
                  <div className="h-4 w-40 bg-slate-800 rounded"></div>
                  <div className="h-3 w-24 bg-slate-800/50 rounded"></div>
                </div>
              </div>
              <div className="h-4 w-20 bg-slate-800 rounded"></div>
              <div className="h-4 w-24 bg-slate-800 rounded"></div>
              <div className="h-4 w-16 bg-slate-800 rounded"></div>
              <div className="h-8 w-8 bg-slate-800 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="h-10 w-24 bg-slate-800 rounded-lg"></div>
        <div className="h-8 w-48 bg-slate-800 rounded"></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-28 bg-surface rounded-2xl border border-border"></div>
        <div className="h-28 bg-surface rounded-2xl border border-border"></div>
        <div className="h-28 bg-surface rounded-2xl border border-border"></div>
      </div>
      <div className="h-80 bg-surface rounded-2xl border border-border p-6"></div>
      <div className="h-80 bg-surface rounded-2xl border border-border p-6"></div>
    </div>
  );
}
