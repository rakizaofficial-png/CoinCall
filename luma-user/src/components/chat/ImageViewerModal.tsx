"use client";

import { X } from "lucide-react";
import Image from "next/image";

export function ImageViewerModal({
  uri,
  onClose,
}: {
  uri: string | null;
  onClose: () => void;
}) {
  if (!uri) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-12 rounded-full p-2 text-white"
        aria-label="Close"
      >
        <X className="h-6 w-6" />
      </button>
      <Image src={uri} alt="attachment" width={900} height={900} unoptimized className="max-h-[80vh] w-auto object-contain" />
    </div>
  );
}
