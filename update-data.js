/* Runs on GitHub Actions (Node 20+), NOT in the browser.
   Fetches T1 data from the Leaguepedia Cargo API server-side — no CORS involved —
   and writes data.json. Refuses to overwrite good data with an empty result. */

const fs = require("fs");
const path = require("path");

const TEAM = "T1";
const API = "https://lol.fandom.com/api.php";
const SEASON_START = new Date().getUTCFullYear() + "-01-01";
const OUT = path.join(__dirname, "data.json");
const UA = "t1-schedule-pwa/1.0 (personal fan schedule; github actions)";

async function cargo(params) {
  const qs = new URLSearchParams(Object.assign(
    { action: "cargoquery", format: "json", origin: "*" }, params));
  const url = API + "?" + qs.toString();
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${params.tables}`);
  const j = await res.json();
  if (j.error) throw new Error(`API error on ${params.tables}: ${j.error.info || j.error.code}`);
  if (!j.cargoquery) throw new Error(`No cargoquery in response for ${params.tables}`);
  return j.cargoquery.map(x => x.title);
}

function prettyEvent(page) {
  if (!page) return "";
  return page.replace(/_/g, " ").replace(/\/(\d{4}) Season/, " $1")
             .split("/").filter(Boolean).join(" · ");
}

async function getMatches() {
  const rows = await cargo({
    tables: "MatchSchedule=MS",
    fields: "MS.DateTime_UTC=dt,MS.Team1=t1,MS.Team2=t2,MS.Team1Score=s1,MS.Team2Score=s2,MS.BestOf=bo,MS.OverviewPage=page",
    where: `(MS.Team1='${TEAM}' OR MS.Team2='${TEAM}') AND MS.DateTime_UTC > '${SEASON_START}'`,
    order_by: "MS.DateTime_UTC DESC",
    limit: "300"
  });
  return rows.map(m => {
    const home = m.t1 === TEAM;
    const a = (m.s1 === "" || m.s1 == null) ? null : parseInt(m.s1, 10);
    const b = (m.s2 === "" || m.s2 == null) ? null : parseInt(m.s2, 10);
    const mine = home ? a : b, theirs = home ? b : a;
    const done = mine != null && theirs != null && (mine + theirs) > 0;
    return {
      dt: (m.dt || "").replace(" ", "T") + "Z",
      opp: (home ? m.t2 : m.t1) || "TBD",
      event: prettyEvent(m.page || ""),
      bo: m.bo ? parseInt(m.bo, 10) : null,
      s: done ? `${mine}-${theirs}` : null,
      o: done ? (mine > theirs ? "W" : "L") : null
    };
  }).filter(m => m.dt.length > 10);
}

async function getRoster() {
  const rows = await cargo({
    tables: "Players=P",
    fields: "P.ID=id,P.Role=role,P.Name=name",
    where: `P.Team='${TEAM}'`,
    limit: "40"
  });
  const ORDER = { top: 0, jungle: 1, mid: 2, bot: 3, support: 4 };
  return rows
    .map(p => ({ id: p.id, name: p.name || "", role: (p.role || "").trim() }))
    .filter(p => p.id && ORDER[p.role.toLowerCase()] !== undefined)
    .sort((x, y) => ORDER[x.role.toLowerCase()] - ORDER[y.role.toLowerCase()])
    .map(p => ({ ...p, role: p.role.charAt(0).toUpperCase() + p.role.slice(1) }));
}

async function getTrophies() {
  const rows = await cargo({
    tables: "TournamentResults=TR",
    fields: "TR.Event=event,TR.Place=place,TR.Prize_USD=prize,TR.Date_Sort=date",
    where: `TR.Team='${TEAM}' AND TR.Date_Sort > '2025-01-01'`,
    order_by: "TR.Date_Sort DESC",
    limit: "14"
  });
  return rows.map(t => ({
    event: t.event,
    place: (t.place || "").replace(/[^0-9\-]/g, "") || t.place,
    prize: t.prize ? Math.round(parseFloat(t.prize)) : null
  }));
}

(async () => {
  const results = await Promise.allSettled([getMatches(), getRoster(), getTrophies()]);
  const [mR, rR, tR] = results;

  results.forEach((r, i) => {
    const name = ["matches", "roster", "trophies"][i];
    if (r.status === "rejected") console.error(`FAILED ${name}: ${r.reason.message}`);
    else console.log(`ok ${name}: ${r.value.length} rows`);
  });

  if (mR.status !== "fulfilled" || mR.value.length === 0) {
    console.error("Matches could not be fetched — leaving data.json untouched.");
    process.exit(1);
  }

  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (e) { /* first run */ }

  const out = {
    updatedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    source: "leaguepedia",
    matches: mR.value,
    roster:   rR.status === "fulfilled" && rR.value.length ? rR.value   : (prev.roster   || []),
    subs:     prev.subs || [],
    trophies: tR.status === "fulfilled" && tR.value.length ? tR.value   : (prev.trophies || [])
  };

  const sameData = JSON.stringify({ ...out, updatedAt: 0 }) === JSON.stringify({ ...prev, updatedAt: 0 });
  if (sameData) {
    console.log("No change since last run.");
    process.exit(78);              // neutral: nothing to commit
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`Wrote data.json — ${out.matches.length} matches, ${out.roster.length} players.`);
})().catch(err => { console.error("Fatal:", err); process.exit(1); });
