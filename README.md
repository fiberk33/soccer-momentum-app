# MomentumTrack — Soccer Heat Score Dashboard

Live football momentum dashboard. Pulls every in-play match from
[api-sports.io](https://www.api-football.com/), computes a Heat Score per
fixture (High Pressure + Red Card × + Vila Effect), and surfaces the hottest
games at a glance with browser notifications when a match crosses into
EXTREME territory.

## Architecture

```
┌─────────────────────┐    /api/live      ┌──────────────────────────┐
│  Vite + React app   │ ─────────────►   │  Flask backend on Render │
│  (Vercel)           │                   │  app.py                  │
└─────────────────────┘ ◄──── JSON ──── ┌─┴───────────────┐
                                          │ api-sports.io │
                                          └───────────────┘
```

- **Frontend (`App.jsx` + `main.jsx` + `index.html`)** — Vite-built React app.
  Single source of truth for the UI. Polls the backend every 60s.
- **Backend (`app.py`)** — Flask service deployed on Render. Reads
  `API_FOOTBALL_KEY` from environment. Computes the heat-score algorithm
  server-side, caches per-fixture statistics for 90s, returns enriched JSON.

## Heat Score Algorithm (server-side)

Total possible score: **100 points**. Bucketed into four alert levels.

| Component          | Max | Trigger |
|--------------------|----:|---------|
| High Pressure      |  35 | Possession >65% (+15) **and** Dangerous Attacks/min >1.5 (+20) |
| Red Card ×         |  30 | The current favourite (or leader) loses a player while drawing or losing |
| Vila Effect        |  35 | Minute is in `[35,45]` or `[80,93]` — pressure-spike windows |

| Score range | Alert |
|-------------|-------|
| 80–100      | 🔥 EXTREME |
| 60–79       | 🟠 HIGH |
| 40–59       | 🟡 MEDIUM |
| 0–39        | 🟢 LOW |

A momentum trend (last 8 readings per fixture) is also tracked server-side and
rendered as a sparkline with `↗ / → / ↘` direction on each card.

## API surface

`GET /api/live` returns:

```json
{
  "matches": [
    {
      "fixture_id": 1023456,
      "league": "Premier League",
      "country": "England",
      "minute": 87,
      "status": "2H",
      "home": { "name": "...", "goals": 1, "possession": 68, "shots_on_target": 9, "corners": 7, "dangerous_attacks": 42, "yellow_cards": 2, "red_cards": 0, "favorite": true, "xg": 1.82 },
      "away": { "...": "..." },
      "dangerous_attacks_per_min": 2.41,
      "heat_score": 91,
      "alert_level": "🔥 EXTREME",
      "breakdown": { "high_pressure": 35, "red_card_multiplier": 20, "vila_effect": 31, "triggers": [ "..." ] },
      "heat_trend": [78, 82, 85, 88, 91],
      "heat_delta": 6.0,
      "heat_direction": "up",
      "stats_loaded": true
    }
  ],
  "count": 14,
  "stats_loaded": 12,
  "stats_top_n": 12
}
```

`stats_loaded` is the number of fixtures that received the full
`/fixtures/statistics` enrichment for this response. The rest carry "partial
heat" (Vila + Red Card components only, computed from the live events list
which arrives in the main `/fixtures?live=all` call).

`GET /api/health` returns `{ ok, cache_size, tracked_fixtures }`.

## Running locally

### Backend
```bash
pip install -r requirements.txt
export API_FOOTBALL_KEY=your_api_sports_key
python app.py
# Serves http://localhost:5000
```

### Frontend
```bash
npm install
# Optional: point at a local backend
echo "VITE_BACKEND_URL=http://localhost:5000" > .env.local
npm run dev
# Serves http://localhost:5173
```

By default the frontend points at the deployed Render backend
(`https://soccer-momentum-app-1.onrender.com`). Override with the
`VITE_BACKEND_URL` env var at build time.

## Deploying

- **Render** (backend): autodeploys `app.py` from this repo. Set
  `API_FOOTBALL_KEY` in environment.
- **Vercel** (frontend): autodetects the Vite framework via `vercel.json`.
  Runs `npm install && npm run build`, serves `dist/`. SPA fallback rewrites
  any path to `/index.html`.

## API-Sports rate-limit notes

A single `/api/live` call to the backend triggers:

1. `/fixtures?live=all` — **1 request**, returns every live fixture with its
   events array (cards, goals).
2. `/fixtures/statistics?fixture={id}` — up to **`TOP_N = 12` requests**,
   one per fixture ranked by partial heat. Cached for `STATS_TTL = 90s`, so
   repeated frontend polls within that window cost zero extra requests.

Worst case per minute when there are >12 live fixtures: ~13 upstream calls.
Fits comfortably inside the api-sports Pro plan (7,500 req/day).
