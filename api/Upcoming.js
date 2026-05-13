// api/upcoming.js — fetches today's upcoming fixtures from API-Sports
// Returns next 24 hours of scheduled matches sorted by kickoff time

const BASE_URL = "https://v3.football.api-sports.io";

// Top leagues to show upcoming fixtures for
const FEATURED_LEAGUES = [
  39,  // Premier League
  140, // La Liga
  78,  // Bundesliga
  135, // Serie A
  61,  // Ligue 1
  2,   // Champions League
  3,   // Europa League
  848, // Conference League
  45,  // FA Cup
  143, // Copa del Rey
  137, // Coppa Italia
  66,  // League Cup
  40,  // Championship
  88,  // Eredivisie
  94,  // Primeira Liga
  179, // Scottish Premiership
  203, // Super Lig
  253, // MLS
  262, // Liga MX
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.APISPORTS_KEY;
  if (!apiKey) return res.status(500).json({ error: "APISPORTS_KEY not set in Vercel environment variables" });

  const headers = { "x-apisports-key": apiKey };

  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];

    // Fetch upcoming fixtures for today across all leagues
    const fixtRes = await fetch(`${BASE_URL}/fixtures?date=${today}&status=NS`, { headers });
    if (!fixtRes.ok) {
      const text = await fixtRes.text();
      return res.status(502).json({ error: `API error: ${fixtRes.status}`, detail: text });
    }

    const fixtData = await fixtRes.json();
    if (fixtData.errors && Object.keys(fixtData.errors).length > 0)
      return res.status(401).json({ error: "Auth error", detail: fixtData.errors });

    const fixtures = fixtData.response || [];

    // Filter to featured leagues only, sort by kickoff time
    const upcoming = fixtures
      .filter(fx => FEATURED_LEAGUES.includes(fx.league.id))
      .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))
      .slice(0, 50)
      .map(fx => {
        const kickoff = new Date(fx.fixture.date);
        const now = new Date();
        const diffMs = kickoff - now;
        const diffMins = Math.round(diffMs / 60000);
        const diffHrs = Math.floor(diffMins / 60);
        const remMins = diffMins % 60;

        const timeLabel = diffMins <= 0 ? "Starting"
          : diffMins < 60 ? `${diffMins}m`
          : `${diffHrs}h ${remMins}m`;

        // Format kickoff time locally
        const kickoffStr = kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        return {
          fixture_id: fx.fixture.id,
          league: fx.league.name,
          country: fx.league.country,
          league_logo: fx.league.logo,
          minute: 0,
          status: "NS",
          kickoff: fx.fixture.date,
          kickoff_display: kickoffStr,
          time_until: timeLabel,
          mins_until: diffMins,
          heat_score: 0,
          alert_level: "⏰ UPCOMING",
          has_full_stats: false,
          breakdown: { high_pressure: 0, red_card_multiplier: 0, vila_effect: 0, triggers: [] },
          home: {
            name: fx.teams.home.name,
            logo: fx.teams.home.logo || "",
            goals: null,
            possession: 0, shots_on_target: 0, corners: 0,
            dangerous_attacks: 0, yellow_cards: 0, red_cards: 0,
            favorite: fx.teams.home.winner,
          },
          away: {
            name: fx.teams.away.name,
            logo: fx.teams.away.logo || "",
            goals: null,
            possession: 0, shots_on_target: 0, corners: 0,
            dangerous_attacks: 0, yellow_cards: 0, red_cards: 0,
            favorite: fx.teams.away.winner,
          },
          dangerous_attacks_per_min: 0,
          odds: null,
        };
      });

    return res.status(200).json({
      source: "api-sports-upcoming",
      count: upcoming.length,
      date: today,
      generated_at: new Date().toISOString(),
      matches: upcoming,
    });

  } catch (err) {
    console.error("Upcoming handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}

