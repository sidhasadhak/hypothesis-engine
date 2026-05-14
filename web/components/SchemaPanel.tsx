"use client";

import { useEffect, useState } from "react";
import { getSchema } from "@/lib/api";

interface Props {
  connId: string | null;
  connName?: string;
}

export function SchemaPanel({ connId, connName }: Props) {
  const [schema, setSchema] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connId) { setSchema(""); return; }
    setLoading(true);
    setError(null);
    getSchema(connId)
      .then(setSchema)
      .catch(() => setError("Failed to load schema."))
      .finally(() => setLoading(false));
  }, [connId]);

  if (!connId) {
    return (
      <div className="flex-1 flex items-center justify-center border-l border-zinc-800">
        <p className="text-xs text-zinc-600">Select a connection to view its schema</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 border-l border-zinc-800">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2 shrink-0">
        <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Schema</p>
        {connName && (
          <span className="text-xs text-zinc-500 font-mono">— {connName}</span>
        )}
        {loading && (
          <span className="text-xs text-zinc-600 ml-auto">Loading…</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error ? (
          <p className="text-xs text-red-400">{error}</p>
        ) : loading ? (
          <div className="space-y-2 animate-pulse">
            {[80, 60, 90, 50, 70].map((w, i) => (
              <div key={i} className="h-3 bg-zinc-800 rounded" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed">
            {schema}
          </pre>
        )}
      </div>
    </div>
  );
}
