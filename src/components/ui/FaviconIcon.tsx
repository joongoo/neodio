"use client";

import { useState } from "react";
import { Globe } from "lucide-react";

// Google's favicon proxy — no API key, works for arbitrary domains, and
// almost never hard-fails (returns a generic globe icon of its own for
// unknown domains) — simpler than fetching /favicon.ico directly, which
// many sites don't have and which CORS blocks from the browser anyway.
// We still fall back to our own Globe icon on error/before load so a slow
// or blocked request never leaves a broken image icon in the table.
function faviconUrl(domain: string, size: number) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

export function FaviconIcon({ domain, size = 16 }: { domain: string; size?: number }) {
  const [errored, setErrored] = useState(false);

  if (!domain || errored) {
    return <Globe size={size} className="shrink-0 text-neutral-400" aria-hidden />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external favicon, not a local/optimizable asset
    <img
      src={faviconUrl(domain, size)}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-sm"
      onError={() => setErrored(true)}
    />
  );
}
