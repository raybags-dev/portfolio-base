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

    fig, ax = plt.subplots(figsize=(width / 100, height / 100), dpi=100)
    fig.patch.set_facecolor(_WHITE)

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
            return Image(io.BytesIO(png), width=3.2 * inch, height=2.8 * inch)
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
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm, inch
    from reportlab.platypus import (
        HRFlowable,
        KeepTogether,
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
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title="UDE Extraction Report",
    )

    W, _ = A4
    content_w = W - 3.6 * cm

    getSampleStyleSheet()  # ensure styles are registered
    BLUE_RL = colors.HexColor(_BLUE)
    DARK_RL = colors.HexColor(_DARK)
    MID_RL  = colors.HexColor(_MID)
    LIGHT_RL= colors.HexColor(_LIGHT)
    SURF_RL = colors.HexColor(_SURFACE)

    h1 = ParagraphStyle("h1", fontSize=22, textColor=DARK_RL, spaceAfter=4,
                        fontName="Helvetica-Bold", leading=28)
    h2 = ParagraphStyle("h2", fontSize=13, textColor=DARK_RL, spaceBefore=14, spaceAfter=6,
                        fontName="Helvetica-Bold", leading=18)
    body = ParagraphStyle("body", fontSize=9, textColor=DARK_RL, leading=14)
    muted = ParagraphStyle("muted", fontSize=8, textColor=LIGHT_RL, leading=12)

    story = []

    # ── Header bar ────────────────────────────────────────────────────────────
    header_data = [[
        Paragraph('<font color="#2563eb"><b>UDE</b></font> Extraction Report', h1),
        Paragraph(
            f'<font color="{_LIGHT}">Generated {_today()}</font>',
            ParagraphStyle("right", fontSize=8, textColor=LIGHT_RL, alignment=TA_RIGHT),
        ),
    ]]
    header_tbl = Table(header_data, colWidths=[content_w * 0.72, content_w * 0.28])
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_tbl)
    story.append(HRFlowable(width="100%", thickness=2, color=BLUE_RL, spaceAfter=14))

    # ── Session info ──────────────────────────────────────────────────────────
    session_name = session_data.get("name", "Extraction Session")
    source_url   = session_data.get("source_url", "")
    source_type  = session_data.get("source_type_detected", session_data.get("source_type", ""))

    story.append(Paragraph(session_name, h1))
    info_rows = []
    if source_url:
        info_rows.append(["Source", source_url[:90]])
    if source_type:
        info_rows.append(["Type", source_type])
    if info_rows:
        it = Table(info_rows, colWidths=[1.2 * inch, content_w - 1.2 * inch])
        it.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TEXTCOLOR", (0, 0), (0, -1), BLUE_RL),
            ("TEXTCOLOR", (1, 0), (1, -1), MID_RL),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(it)
    story.append(Spacer(1, 10))

    # ── Key metrics strip ─────────────────────────────────────────────────────
    total_records  = analytics.get("total_records", 0)
    fields_found   = analytics.get("fields_found", [])
    numeric_fields = analytics.get("numeric_fields", [])
    category_fields= analytics.get("category_fields", [])
    charts         = analytics.get("charts", [])
    summary_stats  = analytics.get("summary_stats", {})

    metrics = [
        ("Total Records",    f"{total_records:,}"),
        ("Fields Detected",  str(len(fields_found))),
        ("Numeric Fields",   str(len(numeric_fields))),
        ("Category Fields",  str(len(category_fields))),
        ("Charts Generated", str(len(charts))),
    ]
    def _metric_cell(title: str, val: str):
        return [
            Paragraph(f'<font color="{_BLUE}"><b>{val}</b></font>',
                      ParagraphStyle("mv", fontSize=18, fontName="Helvetica-Bold",
                                     textColor=BLUE_RL, alignment=TA_CENTER)),
            Paragraph(title, ParagraphStyle("ml", fontSize=7, textColor=LIGHT_RL,
                                            alignment=TA_CENTER)),
        ]

    metric_data = [[_metric_cell(t, v) for t, v in metrics]]
    metric_col_w = content_w / len(metrics)
    mt = Table(metric_data, colWidths=[metric_col_w] * len(metrics))
    mt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SURF_RL),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [SURF_RL]),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor(_BORDER)),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor(_BORDER)),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(mt)
    story.append(Spacer(1, 16))

    # ── Statistical summary ───────────────────────────────────────────────────
    if summary_stats:
        story.append(Paragraph("Statistical Summary", h2))
        stat_header = [
            Paragraph("<b>Field</b>", muted),
            Paragraph("<b>Min</b>",   muted),
            Paragraph("<b>Max</b>",   muted),
            Paragraph("<b>Avg</b>",   muted),
            Paragraph("<b>Count</b>", muted),
        ]
        stat_rows = [stat_header]
        for field, s in list(summary_stats.items())[:12]:
            stat_rows.append([
                Paragraph(field.replace("_", " ").title(), body),
                Paragraph(str(s.get("min", "")), body),
                Paragraph(str(s.get("max", "")), body),
                Paragraph(str(s.get("avg", "")), body),
                Paragraph(f"{s.get('count', 0):,}", body),
            ])
        cw = content_w / 5
        st = Table(stat_rows, colWidths=[cw * 2, cw * 0.75, cw * 0.75, cw * 0.75, cw * 0.75])
        st.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(_SURFACE)),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [_WHITE, colors.HexColor("#f9fafb")]),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor(_BORDER)),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(st)
        story.append(Spacer(1, 16))

    # ── Charts ────────────────────────────────────────────────────────────────
    if charts:
        story.append(Paragraph("Analytics Charts", h2))
        story.append(Spacer(1, 4))

        pie_charts  = [c for c in charts if c.get("type") == "pie"]
        bar_charts  = [c for c in charts if c.get("type") == "bar"]
        line_charts = [c for c in charts if c.get("type") == "line"]

        # Pie charts: 2 per row
        for i in range(0, len(pie_charts), 2):
            pair = pie_charts[i:i + 2]
            imgs = []
            for c in pair:
                img = _chart_to_image(c)
                if img:
                    imgs.append(img)
            if len(imgs) == 2:
                tbl = Table([[imgs[0], imgs[1]]], colWidths=[content_w / 2, content_w / 2])
                tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                          ("LEFTPADDING", (0, 0), (-1, -1), 4),
                                          ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))
                story.append(KeepTogether([tbl, Spacer(1, 10)]))
            elif imgs:
                story.append(KeepTogether([imgs[0], Spacer(1, 10)]))

        # Bar & line charts: full width
        for c in bar_charts + line_charts:
            img = _chart_to_image(c)
            if img:
                story.append(KeepTogether([img, Spacer(1, 10)]))

    # ── Fields list ───────────────────────────────────────────────────────────
    if fields_found:
        story.append(Paragraph("Fields Detected", h2))
        field_text = "  ·  ".join(fields_found[:60])
        story.append(Paragraph(field_text, muted))
        if len(fields_found) > 60:
            story.append(Paragraph(f"… and {len(fields_found) - 60} more fields.", muted))
        story.append(Spacer(1, 12))

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor(_BORDER), spaceBefore=10))
    story.append(Paragraph(
        "Generated by <b>Universal Data Extractor</b> · Playwright · Groq AI · FastAPI · S3 · MongoDB",
        ParagraphStyle("footer", fontSize=7, textColor=LIGHT_RL, alignment=TA_CENTER),
    ))

    doc.build(story)
    return buf.getvalue()


def _today() -> str:
    from datetime import date
    return date.today().strftime("%B %d, %Y")
