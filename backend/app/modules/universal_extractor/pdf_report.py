"""PDF report generator for UDE extraction sessions.

Uses matplotlib for chart images and ReportLab Platypus for layout.
Called synchronously (run in thread executor by the async endpoint).
"""

from __future__ import annotations

import io
from typing import Any

# ── Colour palette ────────────────────────────────────────────────────────────
_BLUE    = "#2563eb"
_DARK    = "#111827"
_MID     = "#374151"
_LIGHT   = "#6b7280"
_SURFACE = "#f3f4f6"
_BORDER  = "#e5e7eb"
_WHITE   = "#ffffff"

_CHART_COLORS = [
    "#2563eb", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16",
]


# ── Chart rendering (matplotlib) ──────────────────────────────────────────────

def _render_bar(chart: dict[str, Any], width: int = 520, height: int = 260) -> bytes:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.ticker as mticker

    data = chart.get("data", [])
    x_key = chart.get("x_key", "label")
    y_key = chart.get("y_key", "count")
    labels = [str(d.get(x_key, ""))[:18] for d in data]
    values = [float(d.get(y_key, 0) or 0) for d in data]

    fig, ax = plt.subplots(figsize=(width / 100, height / 100), dpi=100)
    fig.patch.set_facecolor(_WHITE)
    ax.set_facecolor(_SURFACE)

    ax.bar(range(len(labels)), values, color=_BLUE, width=0.65, zorder=2)
    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=35 if len(labels) > 5 else 0, ha="right",
                       fontsize=8, color=_MID)
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{int(v):,}"))
    ax.tick_params(axis="y", labelsize=8, colors=_MID)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color(_BORDER)
    ax.spines["bottom"].set_color(_BORDER)
    ax.grid(axis="y", color=_BORDER, linewidth=0.7, zorder=1)
    ax.set_title(chart.get("title", ""), fontsize=10, color=_DARK, pad=8, fontweight="bold")

    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format="png", bbox_inches="tight", facecolor=_WHITE)
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def _render_pie(chart: dict[str, Any], width: int = 320, height: int = 280) -> bytes:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    data = chart.get("data", [])
    x_key = chart.get("x_key", "name")
    y_key = chart.get("y_key", "value")
    labels = [str(d.get(x_key, ""))[:20] for d in data]
    values = [float(d.get(y_key, 0) or 0) for d in data]

    if not any(v > 0 for v in values):
        values = [1] * len(values)

    colors = (_CHART_COLORS * (len(labels) // len(_CHART_COLORS) + 1))[:len(labels)]

    # Force a square figure so the pie renders as a perfect circle.
    sq = min(width, height) / 100
    fig, ax = plt.subplots(figsize=(sq, sq), dpi=100)
    fig.patch.set_facecolor(_WHITE)
    ax.set_aspect("equal")

    wedges, texts, autotexts = ax.pie(
        values,
        labels=None,
        colors=colors,
        autopct=lambda p: f"{p:.0f}%" if p >= 5 else "",
        startangle=140,
        pctdistance=0.78,
        wedgeprops={"linewidth": 0.6, "edgecolor": _WHITE},
    )
    for at in autotexts:
        at.set_fontsize(7)
        at.set_color(_WHITE)

    ax.legend(
        wedges, labels,
        loc="lower center",
        bbox_to_anchor=(0.5, -0.22),
        ncol=min(3, len(labels)),
        fontsize=7,
        frameon=False,
    )
    ax.set_title(chart.get("title", ""), fontsize=10, color=_DARK, pad=4, fontweight="bold")

    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format="png", bbox_inches="tight", facecolor=_WHITE)
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def _render_line(chart: dict[str, Any], width: int = 520, height: int = 240) -> bytes:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    data = chart.get("data", [])
    x_key = chart.get("x_key", "month")
    y_key = chart.get("y_key", "count")
    labels = [str(d.get(x_key, "")) for d in data]
    values = [float(d.get(y_key, 0) or 0) for d in data]

    fig, ax = plt.subplots(figsize=(width / 100, height / 100), dpi=100)
    fig.patch.set_facecolor(_WHITE)
    ax.set_facecolor(_SURFACE)

    ax.plot(range(len(labels)), values, color=_BLUE, linewidth=2, marker="o",
            markersize=5, markerfacecolor=_WHITE, markeredgecolor=_BLUE, zorder=3)
    ax.fill_between(range(len(labels)), values, alpha=0.1, color=_BLUE)

    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=35 if len(labels) > 6 else 0, ha="right",
                       fontsize=8, color=_MID)
    ax.tick_params(axis="y", labelsize=8, colors=_MID)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color(_BORDER)
    ax.spines["bottom"].set_color(_BORDER)
    ax.grid(axis="y", color=_BORDER, linewidth=0.7, zorder=1)
    ax.set_title(chart.get("title", ""), fontsize=10, color=_DARK, pad=8, fontweight="bold")

    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format="png", bbox_inches="tight", facecolor=_WHITE)
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def _chart_to_image(chart: dict[str, Any]):
    from reportlab.lib.units import inch
    from reportlab.platypus import Image

    ctype = chart.get("type", "bar")
    try:
        if ctype == "pie":
            png = _render_pie(chart)
            return Image(io.BytesIO(png), width=3 * inch, height=3 * inch)
        elif ctype == "line":
            png = _render_line(chart)
            return Image(io.BytesIO(png), width=6 * inch, height=2.4 * inch)
        else:
            png = _render_bar(chart)
            return Image(io.BytesIO(png), width=6 * inch, height=2.6 * inch)
    except Exception:
        return None


# ── PDF assembly ──────────────────────────────────────────────────────────────

def generate_pdf(
    session_data: dict[str, Any],
    analytics: dict[str, Any],
    records_sample: list[dict[str, Any]] | None = None,
) -> bytes:
    """Render a UDE extraction session as a PDF report. Returns raw bytes."""
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm, inch
    from reportlab.platypus import (
        HRFlowable,
        Image,
        KeepTogether,
        PageBreak,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2.2 * cm,
        bottomMargin=2.2 * cm,
        title="UDE Extraction Report",
    )

    W, H = A4
    CONTENT_W = W - 4 * cm      # usable width in points
    CHART_W_HALF = CONTENT_W / 2 - 6  # half-width for pie pairs

    BLUE_RL  = colors.HexColor(_BLUE)
    DARK_RL  = colors.HexColor(_DARK)
    MID_RL   = colors.HexColor(_MID)
    LIGHT_RL = colors.HexColor(_LIGHT)
    SURF_RL  = colors.HexColor(_SURFACE)
    BORDER_RL= colors.HexColor(_BORDER)

    def _h1(**kw):
        return ParagraphStyle("h1", fontSize=20, textColor=DARK_RL, spaceAfter=6,
                               spaceBefore=0, fontName="Helvetica-Bold", leading=26, **kw)

    def _h2(**kw):
        return ParagraphStyle("h2", fontSize=12, textColor=DARK_RL, spaceBefore=20,
                               spaceAfter=8, fontName="Helvetica-Bold", leading=16, **kw)

    body  = ParagraphStyle("body",  fontSize=9,  textColor=DARK_RL, leading=14)
    muted = ParagraphStyle("muted", fontSize=8,  textColor=LIGHT_RL, leading=12)
    right_small = ParagraphStyle("rs", fontSize=8, textColor=LIGHT_RL,
                                  alignment=TA_RIGHT, leading=11)

    story: list = []

    # ── Cover header ──────────────────────────────────────────────────────────
    hdr_data = [[
        Paragraph('<font color="#2563eb"><b>UDE</b></font> Extraction Report', _h1()),
        Paragraph(f'Generated {_today()}', right_small),
    ]]
    hdr = Table(hdr_data, colWidths=[CONTENT_W * 0.70, CONTENT_W * 0.30])
    hdr.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(hdr)
    story.append(HRFlowable(width="100%", thickness=2, color=BLUE_RL, spaceAfter=18))

    # ── Session metadata ──────────────────────────────────────────────────────
    session_name = session_data.get("name", "Extraction Session")
    source_url   = session_data.get("source_url", "")
    source_type  = session_data.get("source_type_detected",
                                    session_data.get("source_type", ""))

    story.append(Paragraph(session_name, _h1()))
    story.append(Spacer(1, 6))

    meta_rows = []
    if source_url:
        meta_rows.append(["Source", source_url[:100]])
    if source_type:
        meta_rows.append(["Type", source_type])
    if meta_rows:
        mt = Table(meta_rows, colWidths=[1.1 * inch, CONTENT_W - 1.1 * inch])
        mt.setStyle(TableStyle([
            ("FONTNAME",      (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, -1), 8),
            ("TEXTCOLOR",     (0, 0), (0, -1), BLUE_RL),
            ("TEXTCOLOR",     (1, 0), (1, -1), MID_RL),
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(mt)
    story.append(Spacer(1, 20))

    # ── Key metrics strip ─────────────────────────────────────────────────────
    total_records   = analytics.get("total_records", 0)
    fields_found    = analytics.get("fields_found", [])
    numeric_fields  = analytics.get("numeric_fields", [])
    category_fields = analytics.get("category_fields", [])
    charts          = analytics.get("charts", [])
    summary_stats   = analytics.get("summary_stats", {})

    metrics = [
        ("Records",    f"{total_records:,}"),
        ("Fields",     str(len(fields_found))),
        ("Numeric",    str(len(numeric_fields))),
        ("Categories", str(len(category_fields))),
        ("Charts",     str(len(charts))),
    ]

    def _metric_cell(title: str, val: str) -> list:
        return [
            Paragraph(f'<font color="{_BLUE}"><b>{val}</b></font>',
                      ParagraphStyle("mv", fontSize=16, fontName="Helvetica-Bold",
                                     textColor=BLUE_RL, alignment=TA_CENTER, leading=20)),
            Paragraph(title, ParagraphStyle("ml", fontSize=7, textColor=LIGHT_RL,
                                            alignment=TA_CENTER, leading=10)),
        ]

    metric_col_w = CONTENT_W / len(metrics)
    metric_tbl = Table(
        [[_metric_cell(t, v) for t, v in metrics]],
        colWidths=[metric_col_w] * len(metrics),
    )
    metric_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), SURF_RL),
        ("BOX",           (0, 0), (-1, -1), 0.5, BORDER_RL),
        ("INNERGRID",     (0, 0), (-1, -1), 0.4, BORDER_RL),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(metric_tbl)
    story.append(Spacer(1, 28))

    # ── AI Summary (if present) ───────────────────────────────────────────────
    summary_text = analytics.get("summary", "")
    if summary_text:
        story.append(Paragraph("AI Insights Summary", _h2()))
        story.append(Paragraph(summary_text, body))
        story.append(Spacer(1, 20))

    # ── Statistical summary table ─────────────────────────────────────────────
    if summary_stats:
        story.append(Paragraph("Statistical Summary", _h2()))
        stat_header = [
            Paragraph("<b>Field</b>",   muted),
            Paragraph("<b>Min</b>",     muted),
            Paragraph("<b>Max</b>",     muted),
            Paragraph("<b>Avg</b>",     muted),
            Paragraph("<b>Count</b>",   muted),
        ]
        stat_rows: list = [stat_header]
        for field, s in list(summary_stats.items())[:14]:
            stat_rows.append([
                Paragraph(field.replace("_", " ").title(), body),
                Paragraph(str(s.get("min", "")),  body),
                Paragraph(str(s.get("max", "")),  body),
                Paragraph(str(s.get("avg", "")),  body),
                Paragraph(f"{s.get('count', 0):,}", body),
            ])
        cw = CONTENT_W / 5
        st = Table(stat_rows, colWidths=[cw * 2.0, cw * 0.75, cw * 0.75, cw * 0.75, cw * 0.75])
        st.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0),   SURF_RL),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1),  [_WHITE, colors.HexColor("#f9fafb")]),
            ("GRID",          (0, 0), (-1, -1),   0.4, BORDER_RL),
            ("FONTSIZE",      (0, 0), (-1, -1),   8),
            ("TOPPADDING",    (0, 0), (-1, -1),   5),
            ("BOTTOMPADDING", (0, 0), (-1, -1),   5),
            ("VALIGN",        (0, 0), (-1, -1),  "MIDDLE"),
        ]))
        story.append(st)
        story.append(Spacer(1, 28))

    # ── Charts — each on its own fresh area, page-break before section ────────
    if charts:
        story.append(PageBreak())
        story.append(Paragraph("Analytics Charts", _h2()))
        story.append(Spacer(1, 8))

        pie_charts  = [c for c in charts if c.get("type") == "pie"]
        bar_charts  = [c for c in charts if c.get("type") == "bar"]
        line_charts = [c for c in charts if c.get("type") == "line"]

        # Pie charts — render as matching-width images (avoid platypus inline)
        for i in range(0, len(pie_charts), 2):
            pair = pie_charts[i: i + 2]
            img_bytes = []
            for c in pair:
                try:
                    sq = int(CHART_W_HALF * 1.3)
                    png = _render_pie(c, width=sq, height=sq)
                    img_bytes.append(png)
                except Exception:
                    img_bytes.append(None)

            cells = []
            for png in img_bytes:
                if png:
                    img = Image(io.BytesIO(png), width=CHART_W_HALF, height=CHART_W_HALF)
                    cells.append(img)
                else:
                    cells.append(Paragraph("(chart unavailable)", muted))

            if len(cells) == 2:
                tbl = Table([cells],
                            colWidths=[CONTENT_W / 2, CONTENT_W / 2])
                tbl.setStyle(TableStyle([
                    ("VALIGN",        (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING",   (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
                    ("TOPPADDING",    (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]))
                story.append(tbl)
            elif cells:
                story.append(cells[0])
            story.append(Spacer(1, 20))

        # Bar charts — full width, one per block with title above
        for c in bar_charts:
            title = c.get("title", "")
            try:
                chart_h = CONTENT_W * 0.42
                png = _render_bar(c,
                                  width=int(CONTENT_W * 1.35),
                                  height=int(chart_h * 1.35))
                img = Image(io.BytesIO(png), width=CONTENT_W, height=chart_h)
                block: list = []
                if title:
                    block.append(Paragraph(title, _h2()))
                block.append(img)
                story.append(KeepTogether(block))
                story.append(Spacer(1, 20))
            except Exception:
                pass

        # Line charts — full width
        for c in line_charts:
            title = c.get("title", "")
            try:
                chart_h = CONTENT_W * 0.36
                png = _render_line(c,
                                   width=int(CONTENT_W * 1.35),
                                   height=int(chart_h * 1.35))
                img = Image(io.BytesIO(png), width=CONTENT_W, height=chart_h)
                block = []
                if title:
                    block.append(Paragraph(title, _h2()))
                block.append(img)
                story.append(KeepTogether(block))
                story.append(Spacer(1, 20))
            except Exception:
                pass

    # ── Fields detected ───────────────────────────────────────────────────────
    if fields_found:
        story.append(Paragraph("Fields Detected", _h2()))
        story.append(Paragraph("  ·  ".join(fields_found[:80]), muted))
        if len(fields_found) > 80:
            story.append(Paragraph(f"… and {len(fields_found) - 80} more fields.", muted))
        story.append(Spacer(1, 20))

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 16))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_RL, spaceBefore=4))
    story.append(Paragraph(
        "Generated by <b>Universal Data Extractor</b> · Playwright · Groq AI · FastAPI · S3",
        ParagraphStyle("footer", fontSize=7, textColor=LIGHT_RL, alignment=TA_CENTER),
    ))

    doc.build(story)
    return buf.getvalue()


def _today() -> str:
    from datetime import date
    return date.today().strftime("%B %d, %Y")
