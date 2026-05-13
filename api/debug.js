// api/debug.js — shows raw stats response for the first live fixture
// Visit /api/debug to diagnose what the stats API actually returns

const BASE_URL = "https://v3.football.api-sports.io";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const apiKey = process.env.APISPORTS_KEY;
  if (!apiKey) return res.status(500).json({ error: "APISPORTS_KEY not set" });

  const headers = { "x-apisports-key": apiKey };

  try {
    // Get first live fixture
    const fixtRes = await fetch(`${BASE_URL}/fixtures?live=all`, { headers });
    const fixtData = await fixtRes.json();
    const fixtures = fixtData.response || [];

    if (fixtures.length === 0) {
      return res.status(200).json({ message: "No live fixtures right now", fixtures: [] });
    }

    // Take first fixture and fetch its raw stats
    const fx = fixtures[0];
    const fid = fx.fixture.id;

    const statRes = await fetch(`${BASE_URL}/fixtures/statistics?fixture=${fid}`, { headers });
    const statData = await statRes.json();

    // Also check account status
    const statusRes = await fetch(`${BASE_URL}/status`, { headers });
    const statusData = await statusRes.json();

    return res.status(200).json({
      account: statusData.response,
      fixture: {
        id: fid,
        league: fx.league.name,
        minute: fx.fixture.status.elapsed,
        home: fx.teams.home.name,
        away: fx.teams.away.name,
      },
      raw_stats: statData,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

