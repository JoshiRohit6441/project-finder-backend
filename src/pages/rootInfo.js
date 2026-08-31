import { config } from "../config/index.js";

export const SERVICE_NAME = "PROJECT FINDER API";
export const SERVICE_VERSION = "1.0.0";

export const API_CATALOG = [
  { method: "GET", path: "/", auth: false, description: "This service info page" },
  { method: "GET", path: "/health", auth: false, description: "Liveness check" },
  { method: "POST", path: "/api/auth/login", auth: false, description: "Admin login" },
  { method: "GET", path: "/api/auth/me", auth: true, description: "Current session" },
  { method: "GET", path: "/api/dashboard", auth: true, description: "Overview totals" },
  { method: "GET", path: "/api/campaigns", auth: true, description: "Campaign list and create" },
  { method: "GET", path: "/api/jobs", auth: true, description: "Scrape job queue" },
  { method: "GET", path: "/api/leads", auth: true, description: "Qualified and scraped leads" },
  { method: "GET", path: "/api/mailbox", auth: true, description: "Gmail status and inbox" },
  { method: "GET", path: "/api/outreach", auth: true, description: "Draft, send, approve mail" },
  { method: "GET", path: "/api/tasks", auth: true, description: "Human review queue" },
  { method: "GET", path: "/api/meetings", auth: true, description: "Suggested and booked meetings" },
  { method: "POST", path: "/api/public/unsubscribe", auth: false, description: "Public unsubscribe" },
  { method: "GET", path: "/api/live/stream", auth: true, description: "SSE live job and lead events" },
];

export function serviceInfo() {
  return {
    name: SERVICE_NAME,
    product: "Project Finder Outreach Desk",
    role: "backend-api",
    version: SERVICE_VERSION,
    env: config.env,
    port: config.port,
    health: "/health",
    adminUi: config.frontendOrigin,
    docsHint: "JSON responses use http_status_code, http_status_msg, success, data, message, timestamp.",
    routes: API_CATALOG,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderInfoPage() {
  const info = serviceInfo();
  const rows = info.routes
    .map(
      (item) => `
        <tr>
          <td><code>${escapeHtml(item.method)}</code></td>
          <td><code>${escapeHtml(item.path)}</code></td>
          <td>${item.auth ? "Auth" : "Public"}</td>
          <td>${escapeHtml(item.description)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(info.name)}</title>
    <style>
      :root {
        --bg: #14110e;
        --panel: #1d1914;
        --line: #3a3126;
        --ink: #f4efe6;
        --muted: #b6aa98;
        --accent: #c4a574;
        --ok: #8fbf7f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
        background: radial-gradient(circle at top left, #2a2218, var(--bg) 45%);
        color: var(--ink);
      }
      main {
        max-width: 920px;
        margin: 0 auto;
        padding: 48px 24px 72px;
      }
      .eyebrow {
        color: var(--accent);
        letter-spacing: 0.16em;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }
      h1 {
        margin: 8px 0 8px;
        font-size: 42px;
        line-height: 1.1;
      }
      p { color: var(--muted); line-height: 1.6; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin: 28px 0 32px;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 16px 18px;
      }
      .card span {
        display: block;
        color: var(--muted);
        font-size: 12px;
        margin-bottom: 6px;
      }
      .card strong { font-size: 18px; }
      .ok { color: var(--ok); }
      table {
        width: 100%;
        border-collapse: collapse;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 14px;
        overflow: hidden;
      }
      th, td {
        text-align: left;
        padding: 12px 14px;
        border-bottom: 1px solid var(--line);
        font-size: 14px;
      }
      th { color: var(--muted); font-weight: 600; font-size: 12px; letter-spacing: 0.04em; }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        color: var(--accent);
      }
      a { color: var(--accent); }
      footer { margin-top: 28px; font-size: 13px; }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">Local backend · port ${escapeHtml(info.port)}</div>
      <h1>${escapeHtml(info.name)}</h1>
      <p>${escapeHtml(info.product)} backend. This is the API, not the admin UI.</p>
      <div class="grid">
        <div class="card"><span>Status</span><strong class="ok">Online</strong></div>
        <div class="card"><span>Version</span><strong>${escapeHtml(info.version)}</strong></div>
        <div class="card"><span>Environment</span><strong>${escapeHtml(info.env)}</strong></div>
        <div class="card"><span>Health</span><strong><a href="/health">/health</a></strong></div>
      </div>
      <div class="card" style="margin-bottom:24px">
        <span>Admin UI</span>
        <strong><a href="${escapeHtml(info.adminUi)}">${escapeHtml(info.adminUi)}</a></strong>
        <p style="margin:10px 0 0">JSON envelope: <code>http_status_code</code>, <code>http_status_msg</code>, <code>success</code>, <code>data</code>, <code>message</code>, <code>timestamp</code></p>
      </div>
      <table>
        <thead>
          <tr><th>Method</th><th>Path</th><th>Access</th><th>Purpose</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <footer>Ask for JSON with <code>Accept: application/json</code> on this same URL.</footer>
    </main>
  </body>
</html>`;
}
