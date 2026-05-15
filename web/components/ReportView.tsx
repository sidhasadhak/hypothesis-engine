"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DataQualityNote, QueryCitation, Report } from "@/lib/types";
import { InvestigationChart } from "@/components/InvestigationChart";

interface Props {
  report: Report;
  queryCount: number;
  queryHistory?: QueryCitation[];
  queryMode?: "direct" | "investigate" | null;
}

const SHARE_COL_PATTERN = /share|pct|percent|rate|ratio|proportion/i;
// Columns that are ordinal integers (year, month, day, rank, id) — never locale-format these
const ORDINAL_COL_PATTERN = /year|month|day|week|rank|_id$|^id$/i;

function formatCell(col: string, val: unknown): string {
  if (val === null || val === undefined) return "";
  const n = Number(val);
  if (isNaN(n)) return String(val);
  // Percentage columns stored as 0-1 fractions
  if (SHARE_COL_PATTERN.test(col) && n >= 0 && n <= 1) {
    return `${(n * 100).toFixed(2)}%`;
  }
  // Long decimals — cap at 2 dp
  if (n % 1 !== 0) return n.toFixed(2);
  // Ordinal/ID integers: render bare, never add thousands comma
  if (ORDINAL_COL_PATTERN.test(col)) return String(n);
  return n.toLocaleString();
}

function CollapsibleSection({
  title,
  badge,
  titleClass = "text-zinc-300",
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  titleClass?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full text-left group py-1"
      >
        <h3 className={`text-sm font-semibold uppercase tracking-wide ${titleClass}`}>{title}</h3>
        {badge}
        <span className="ml-auto text-zinc-600 group-hover:text-zinc-400 text-xs transition">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function ReportView({ report, queryCount, queryHistory = [], queryMode }: Props) {
  const dqNotes = report.data_quality_notes ?? [];
  const isDirect = queryMode === "direct";
  const isQueryFailure = isDirect && !report.verdict && report.headline === "Query execution failed";

  const directTable = isDirect
    ? queryHistory.find(q => !q.error && q.columns?.length && q.rows?.length)
    : undefined;

  return (
    <div className="space-y-6">
      {/* 1. Headline */}
      <div className={`rounded-lg border p-5 ${isQueryFailure ? "border-red-500/30 bg-red-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
        <p className={`text-xs font-medium uppercase tracking-widest mb-2 ${isQueryFailure ? "text-red-400" : "text-emerald-400"}`}>
          {isQueryFailure ? "Query Failed" : isDirect ? "Top Insight" : "Verdict"}
        </p>
        <p className="text-lg font-semibold text-white leading-snug">{report.headline}</p>
      </div>

      {/* 2. Executive Summary / Diagnosis — immediately after headline */}
      {!isQueryFailure && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
            {isDirect ? "Executive Summary" : "Diagnosis"}
          </h3>
          <p className="text-sm text-zinc-300 leading-relaxed">{report.verdict}</p>
          {isDirect && report.key_findings.length > 0 && (
            <ul className="space-y-2 mt-1">
              {report.key_findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-400 leading-relaxed">
                  <span className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-zinc-600" />
                  <span>{f.claim}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 3. Chart */}
      {isDirect && !isQueryFailure && directTable?.columns && directTable?.rows && (
        <InvestigationChart
          columns={directTable.columns}
          rows={directTable.rows}
        />
      )}

      {/* 4. KPI highlight — single-row scalar results */}
      {isDirect && !isQueryFailure && directTable && <KPIHighlight table={directTable} />}

      {/* 5. Query Results table */}
      {isDirect && !isQueryFailure && directTable && (
        <DirectResultTable table={directTable} />
      )}

      <Separator className="bg-zinc-800" />

      {/* 6. Supportive Evidences — investigate mode only */}
      {!isDirect && report.key_findings.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Supportive Evidences</h3>
          <div className="space-y-2">
            {report.key_findings.map((f, i) => {
              const citations = queryHistory.filter(
                q => q.hypothesis_id && f.hypothesis_id &&
                     q.hypothesis_id.toUpperCase() === f.hypothesis_id.toUpperCase()
              );
              return <FindingRow key={i} index={i} finding={f} citations={citations} />;
            })}
          </div>
        </div>
      )}

      {/* 7. Data Quality Issues — collapsible, collapsed by default */}
      {dqNotes.length > 0 && (
        <CollapsibleSection
          title={isQueryFailure ? "Execution Error" : "Data Quality Issues"}
          titleClass="text-orange-400"
          badge={
            <Badge variant="outline" className="border-orange-500/30 bg-orange-500/10 text-orange-400 text-xs">
              {isQueryFailure ? "query failed" : `${dqNotes.length} found`}
            </Badge>
          }
        >
          <p className="text-xs text-zinc-500 mb-3">
            {isQueryFailure
              ? "The query was automatically corrected and retried but still could not execute successfully."
              : "These structural issues were detected during the investigation and may affect analysis accuracy."}
          </p>
          <div className="space-y-3">
            {dqNotes.map((note, i) => <DataQualityCard key={i} note={note} />)}
          </div>
        </CollapsibleSection>
      )}

      {/* 8. Risks & Considerations — collapsible */}
      {report.risks.length > 0 && (
        <CollapsibleSection title="Risks & Considerations">
          <div className="space-y-2">
            {report.risks.map((risk, i) => (
              <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 flex items-start gap-3">
                <span className="shrink-0 mt-0.5 text-amber-400 text-xs">⚠</span>
                <p className="text-sm text-zinc-300 leading-relaxed">{risk}</p>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* 9. Recommended Actions — collapsible */}
      {report.recommended_actions.length > 0 && (
        <CollapsibleSection title="Recommended Actions">
          <div className="space-y-2">
            {report.recommended_actions.map((action, i) => (
              <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 flex items-start gap-3">
                <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-xs font-mono text-zinc-400 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-zinc-300 leading-relaxed">{action}</p>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* 10. Excluded Causes — collapsible */}
      {report.what_is_not_the_cause.length > 0 && (
        <CollapsibleSection title="Excluded Causes" titleClass="text-zinc-500">
          <ul className="space-y-1">
            {report.what_is_not_the_cause.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-500 leading-relaxed">
                <span className="mt-0.5 text-red-500/60 shrink-0">✕</span>
                {item}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      <p className="text-xs text-zinc-600 text-center">{queryCount} SQL queries executed</p>
    </div>
  );
}

function FindingRow({
  index,
  finding,
  citations,
}: {
  index: number;
  finding: { claim: string; evidence: string; confidence: number; hypothesis_id: string | null };
  citations: QueryCitation[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="flex items-start gap-3 p-3">
        <span className="shrink-0 mt-0.5 text-xs font-mono text-zinc-600 w-5 text-right">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-300 leading-snug">{finding.claim}</p>
          <p className="mt-0.5 text-sm text-zinc-500 leading-relaxed line-clamp-2">{finding.evidence}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className={
              finding.confidence >= 0.7
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-amber-500/30 bg-amber-500/10 text-amber-400"
            }
          >
            {Math.round(finding.confidence * 100)}%
          </Badge>
          {citations.length > 0 && (
            <button
              onClick={() => setOpen(o => !o)}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded px-1.5 py-0.5 transition"
              title="Show source queries"
            >
              <span className="font-mono">{finding.hypothesis_id}</span>
              <span className="text-zinc-700">{open ? "▲" : "▼"}</span>
            </button>
          )}
        </div>
      </div>
      {open && citations.length > 0 && (
        <div className="border-t border-zinc-800 divide-y divide-zinc-800/60">
          {citations.map((c, i) => (
            <div key={i} className="px-4 py-2 space-y-1">
              <pre className="text-xs text-zinc-400 bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                {c.sql}
              </pre>
              <p className="text-xs text-zinc-600">
                {c.error
                  ? <span className="text-red-400">{c.error}</span>
                  : <span>{c.row_count} row{c.row_count !== 1 ? "s" : ""}</span>
                }
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KPIHighlight({ table }: { table: QueryCitation }) {
  const columns = table.columns ?? [];
  const rows = table.rows ?? [];

  if (rows.length !== 1 || columns.length === 0) return null;

  const row = rows[0] as unknown[];
  const metrics = columns
    .map((col, i) => ({ col, val: row[i] }))
    .filter(({ val }) => val !== null && !isNaN(Number(val)) && Number(val) !== 0);

  if (!metrics.length) return null;

  const fmt = (col: string, v: unknown) => {
    const n = Number(v);
    if (SHARE_COL_PATTERN.test(col) && n >= 0 && n <= 1) return `${(n * 100).toFixed(2)}%`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    if (n % 1 !== 0) return n.toFixed(2);
    return n.toLocaleString();
  };

  return (
    <div className={`grid gap-3 ${metrics.length > 2 ? "grid-cols-3" : metrics.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
      {metrics.slice(0, 3).map(({ col, val }) => (
        <div key={col} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-center space-y-1">
          <p className="text-2xl font-mono font-semibold text-emerald-400 tracking-tight">{fmt(col, val)}</p>
          <p className="text-xs text-zinc-500 uppercase tracking-wide">{col.replace(/_/g, " ")}</p>
        </div>
      ))}
    </div>
  );
}

function DirectResultTable({ table }: { table: QueryCitation }) {
  const columns = table.columns ?? [];
  const rows = table.rows ?? [];
  const VISIBLE_ROWS = 20;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Query Results</h3>
        <span className="text-xs text-zinc-600 font-mono">
          {table.row_count} row{table.row_count !== 1 ? "s" : ""}
          {rows.length > VISIBLE_ROWS ? ` · scroll to see all` : ""}
        </span>
      </div>
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                {columns.map(col => (
                  <TableHead key={col} className="text-xs text-zinc-500 font-mono whitespace-nowrap bg-zinc-900/80 h-8">
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, ri) => (
                <TableRow key={ri} className="border-zinc-800/50 hover:bg-zinc-800/30">
                  {(row as unknown[]).map((cell, ci) => (
                    <TableCell key={ci} className="text-xs text-zinc-300 font-mono py-1.5 whitespace-nowrap">
                      {cell === null || cell === undefined ? (
                        <span className="text-zinc-600 italic">null</span>
                      ) : (
                        formatCell(columns[ci], cell)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <details className="group">
        <summary className="text-xs text-zinc-600 cursor-pointer hover:text-zinc-400 transition list-none flex items-center gap-1">
          <span className="group-open:hidden">▶</span>
          <span className="hidden group-open:inline">▼</span>
          SQL
        </summary>
        <pre className="mt-1 text-xs text-zinc-400 bg-zinc-950 rounded p-3 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
          {table.sql}
        </pre>
      </details>
    </div>
  );
}

function DataQualityCard({ note }: { note: DataQualityNote }) {
  const target = note.column ? `${note.table}.${note.column}` : note.table;
  return (
    <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <code className="text-xs font-mono text-orange-300 bg-orange-500/10 px-2 py-0.5 rounded">
          {target}
        </code>
      </div>
      <p className="text-sm text-zinc-300 whitespace-pre-wrap font-mono text-xs leading-relaxed">{note.issue}</p>
      <p className="text-xs text-zinc-500">
        <span className="text-zinc-400 font-medium">Impact: </span>{note.impact}
      </p>
      <div className="border-t border-orange-500/10 pt-2">
        <p className="text-xs text-zinc-500">
          <span className="text-orange-400 font-medium">Fix: </span>{note.recommended_fix}
        </p>
      </div>
    </div>
  );
}
