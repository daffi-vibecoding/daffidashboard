# OpenClaw Dashboard

A lightweight, production-ready dashboard for Kanban and API usage tracking. Built with vanilla HTML/CSS/JS and a tiny Node server.

## Run

```bash
node server.js
```

Then open `http://localhost:5177`.

## Configuration

- Logs directory: `~/.openclaw/logs/` (override with `OPENCLAW_LOG_DIR`)
- Kanban storage: `data/kanban.json`
- Pricing (for estimates): `data/pricing.json`

If your logs already include costs, those values are used directly. If not, costs are estimated from the pricing file.

## Notes

- The usage parser is resilient to multiple log formats, but it relies on usage fields being present. If you don’t see data, check that usage logging is enabled in OpenClaw.
- Drag cards between columns. Double-click a card to edit or delete.
