"""Schema introspection — builds the context string fed to the LLM."""
from __future__ import annotations

import duckdb

from hermes.semantic.glossary import apply_glossary


def build_schema_context(conn: duckdb.DuckDBPyConnection) -> str:
    """Return a rich schema description for the LLM, including row counts and glossary annotations."""
    tables = [row[0] for row in conn.execute("SHOW TABLES").fetchall()]
    parts: list[str] = []

    for table in sorted(tables):
        try:
            count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        except Exception:
            count = "?"

        parts.append(f"TABLE: {table}  ({count:,} rows)")

        cols = conn.execute(f"DESCRIBE {table}").fetchall()
        for col in cols:
            col_name, col_type = col[0], col[1]
            parts.append(f"  {col_name}  {col_type}")

        # Sample distinct values for categorical columns (quick orientation for the LLM)
        categorical = [c[0] for c in cols if "VARCHAR" in c[1] or "TEXT" in c[1]]
        for col_name in categorical[:3]:
            try:
                vals = conn.execute(
                    f"SELECT DISTINCT {col_name} FROM {table} LIMIT 8"
                ).fetchall()
                sample = ", ".join(str(v[0]) for v in vals if v[0] is not None)
                if sample:
                    parts.append(f"  -- {col_name} sample values: {sample}")
            except Exception:
                pass

        parts.append("")

    # Add date range context
    try:
        date_range = conn.execute(
            "SELECT MIN(date)::VARCHAR, MAX(date)::VARCHAR FROM kpi_daily"
        ).fetchone()
        if date_range:
            parts.append(f"Date range in kpi_daily: {date_range[0]} to {date_range[1]}")
    except Exception:
        pass

    raw = "\n".join(parts)
    from hermes.semantic.autoseed import seed_missing_tables
    from hermes.semantic.retriever import build_schema_index
    seed_missing_tables(raw)
    enriched = apply_glossary(raw)
    build_schema_index()  # best-effort; keeps vector index fresh after glossary changes
    return enriched
