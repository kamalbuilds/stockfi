"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PositionDetail } from "@/components/position/PositionDetail";
import Link from "next/link";

function PositionPageContent() {
  const params = useSearchParams();
  const id = params.get("id") as `0x${string}` | null;

  if (!id) {
    return (
      <div className="min-h-screen py-12">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <p className="text-zinc-400">No position ID provided.</p>
          <Link href="/dashboard" className="text-emerald-400 hover:underline text-sm mt-2 inline-block">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12">
      <div className="mx-auto max-w-3xl px-4">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-300 mb-6 inline-block">
          &larr; Back to Dashboard
        </Link>
        <PositionDetail positionId={id} />
      </div>
    </div>
  );
}

export default function PositionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen py-12 text-center text-zinc-500">Loading...</div>}>
      <PositionPageContent />
    </Suspense>
  );
}
