// Inline-styled HTML for outgoing emails. Matches the palette used by the
// snapshot export (emailSnapshot.ts) so PRISM emails look consistent.
// Every user-supplied string MUST go through esc() before being interpolated.

const BORDER = "#e6e9ef";
const MUTED = "#6b7280";
const BG = "#f7f8fa";
const TEXT = "#1f2937";
const ACCENT = "#1d63ed";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type ListItem = {
  title: string;
  meta?: string;
  url?: string;
  /** Short coloured label shown before the title, e.g. "3d overdue". */
  badge?: string;
  badgeColor?: string;
};

export type Section = {
  title: string;
  items: ListItem[];
  /** Max items to list before "and N more". */
  limit?: number;
  moreUrl?: string;
};

export type Table = {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  /** Optional link per row (applied to the first cell). */
  rowUrls?: (string | undefined)[];
};

function sectionHtml(s: Section): string {
  if (s.items.length === 0) return "";
  const limit = s.limit ?? 15;
  const shown = s.items.slice(0, limit);
  const more = s.items.length - shown.length;
  const rows = shown
    .map((it) => {
      const title = it.url
        ? `<a href="${esc(it.url)}" style="color:${TEXT};text-decoration:none;font-weight:600;">${esc(it.title)}</a>`
        : `<span style="font-weight:600;">${esc(it.title)}</span>`;
      const badge = it.badge
        ? `<span style="display:inline-block;font-size:11px;font-weight:600;color:#fff;background:${it.badgeColor ?? MUTED};border-radius:4px;padding:1px 6px;margin-right:6px;">${esc(it.badge)}</span>`
        : "";
      const meta = it.meta ? `<div style="font-size:12px;color:${MUTED};margin-top:2px;">${esc(it.meta)}</div>` : "";
      return `<tr><td style="padding:8px 0;border-bottom:1px solid ${BORDER};font-size:14px;">${badge}${title}${meta}</td></tr>`;
    })
    .join("");
  const moreRow =
    more > 0
      ? `<tr><td style="padding:8px 0;font-size:12px;color:${MUTED};">…and ${more} more${
          s.moreUrl ? ` — <a href="${esc(s.moreUrl)}" style="color:${ACCENT};">view all</a>` : ""
        }</td></tr>`
      : "";
  return `
  <div style="background:#fff;border:1px solid ${BORDER};border-radius:8px;padding:14px 18px;margin-bottom:14px;">
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${MUTED};margin-bottom:4px;">
      ${esc(s.title)} <span style="color:${ACCENT};">(${s.items.length})</span>
    </div>
    <table style="width:100%;border-collapse:collapse;">${rows}${moreRow}</table>
  </div>`;
}

function tableHtml(t: Table): string {
  if (t.rows.length === 0) return "";
  const head = t.columns
    .map((c, i) => `<th style="text-align:${i === 0 ? "left" : "right"};font-size:11px;color:${MUTED};text-transform:uppercase;padding:6px 8px;border-bottom:1px solid ${BORDER};">${esc(c)}</th>`)
    .join("");
  const body = t.rows
    .map((r, ri) => {
      const cells = r
        .map((c, i) => {
          const url = i === 0 ? t.rowUrls?.[ri] : undefined;
          const content = url ? `<a href="${esc(url)}" style="color:${TEXT};font-weight:600;text-decoration:none;">${esc(c)}</a>` : esc(c);
          return `<td style="text-align:${i === 0 ? "left" : "right"};font-size:13px;padding:7px 8px;border-bottom:1px solid ${BORDER};">${content}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `
  <div style="background:#fff;border:1px solid ${BORDER};border-radius:8px;padding:14px 18px;margin-bottom:14px;">
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${MUTED};margin-bottom:6px;">${esc(t.title)}</div>
    <table style="width:100%;border-collapse:collapse;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  </div>`;
}

export function renderEmail(params: {
  heading: string;
  /** Plain text paragraph(s); escaped. */
  intro?: string;
  sections?: Section[];
  tables?: Table[];
  ctaUrl?: string;
  ctaLabel?: string;
  baseUrl: string;
  /** Why the user is getting this email; shown in the footer. */
  reason?: string;
  showPrefsLink?: boolean;
}): { html: string; text: string } {
  const { heading, intro, sections = [], tables = [], ctaUrl, ctaLabel, baseUrl, reason, showPrefsLink = true } = params;

  const introHtml = intro
    ? intro.split("\n").map((p) => `<p style="font-size:14px;line-height:1.5;margin:0 0 12px 0;">${esc(p)}</p>`).join("")
    : "";
  const cta =
    ctaUrl
      ? `<div style="margin:18px 0 6px 0;"><a href="${esc(ctaUrl)}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:6px;">${esc(ctaLabel ?? "Open in PRISM")}</a></div>`
      : "";
  const prefs = showPrefsLink
    ? ` &nbsp;·&nbsp; <a href="${esc(baseUrl)}/profile" style="color:${MUTED};">Email preferences</a>`
    : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Inter,Segoe UI,Arial,sans-serif;background:${BG};color:${TEXT};padding:20px 12px;margin:0;">
  <div style="max-width:640px;margin:0 auto;">
    <div style="background:#0f172a;background:linear-gradient(90deg,#0f172a,${ACCENT});border-radius:8px;padding:16px 20px;margin-bottom:14px;">
      <div style="font-size:11px;color:#94a3b8;letter-spacing:.08em;font-weight:700;">PRISM</div>
      <h2 style="color:#fff;margin:4px 0 0 0;font-size:19px;font-weight:700;">${esc(heading)}</h2>
    </div>
    ${introHtml || cta ? `<div style="background:#fff;border:1px solid ${BORDER};border-radius:8px;padding:16px 18px;margin-bottom:14px;">${introHtml}${cta}</div>` : ""}
    ${tables.map(tableHtml).join("")}
    ${sections.map(sectionHtml).join("")}
    <div style="font-size:11px;color:${MUTED};text-align:center;margin-top:18px;line-height:1.6;">
      ${reason ? `${esc(reason)}<br>` : ""}Sent by PRISM — please do not reply to this email.${prefs}
    </div>
  </div>
</body></html>`;

  // Plain-text alternative for clients that block HTML.
  const lines: string[] = [heading, ""];
  if (intro) lines.push(intro, "");
  for (const t of tables) {
    if (t.rows.length === 0) continue;
    lines.push(t.title.toUpperCase(), t.columns.join(" | "));
    for (const r of t.rows) lines.push(r.join(" | "));
    lines.push("");
  }
  for (const s of sections) {
    if (s.items.length === 0) continue;
    lines.push(`${s.title.toUpperCase()} (${s.items.length})`);
    for (const it of s.items.slice(0, s.limit ?? 15)) {
      lines.push(`- ${it.badge ? `[${it.badge}] ` : ""}${it.title}${it.meta ? ` — ${it.meta}` : ""}${it.url ? ` <${it.url}>` : ""}`);
    }
    const more = s.items.length - (s.limit ?? 15);
    if (more > 0) lines.push(`  …and ${more} more`);
    lines.push("");
  }
  if (ctaUrl) lines.push(`${ctaLabel ?? "Open in PRISM"}: ${ctaUrl}`, "");
  if (reason) lines.push(reason);
  lines.push("Sent by PRISM — please do not reply.");
  if (showPrefsLink) lines.push(`Email preferences: ${baseUrl}/profile`);

  return { html, text: lines.join("\n") };
}
