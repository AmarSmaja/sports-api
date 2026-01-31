type Sport = "nfl" | "football" | "cbb" | "cfb" | "mma";

export type TeamRef = { id: string | number; name: string; abbr?: string | null };
export type Score = { home: number | null; away: number | null };

export type UnifiedGame = {
  id: string | number;
  sport: Sport;
  date: string;
  datetimeUtc: string | null;
  status: string | null;
  home: TeamRef;
  away: TeamRef;
  score: Score;
};

const ESPN_BASE_URL = process.env.ESPN_BASE_URL ?? 'https://site.api.espn.com/apis/site/v2';
const ESPN_TIMEOUT_MS = Number(process.env.ESPN_TIMEOUT_MS ?? 12_000);

const FOOTBALL_LEAGUES = (process.env.FOOTBALL_LEAGUES ?? 'eng.1')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const CFB_GROUPS = (process.env.CFB_GROUPS ?? '80')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const CBB_GROUPS = (process.env.CBB_GROUPS ?? "50")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function yyyymmddFromIsoDate(isoYYYYMMDD: string): string {
  return isoYYYYMMDD.replace(/-/g, '');
}

function asIsoOrNull(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function toIntOrNull(v: any): number | null {
  if (v == null) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ESPN_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'sportify/1.0' },
      signal: ctrl.signal
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`ESPN HTTP ${res.status}: ${text.slice(0, 300)}`);

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`ESPN invalid JSON: ${text.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(t);
  }
}

async function fetchEspnScoreboard(pathAfterSports: string, dateIsoYYYYMMDD: string, extraParams?: Record<string, string>): Promise<any[]> {
  const params = new URLSearchParams();
  params.set('dates', yyyymmddFromIsoDate(dateIsoYYYYMMDD));
  params.set('limit', '500');

  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) params.set(k, v);
  }

  const url = `${ESPN_BASE_URL}/sports/${pathAfterSports}/scoreboard?${params.toString()}`;
  const json = await fetchJson(url);
  return Array.isArray(json?.events) ? json.events : [];
}

function pickCompetition(evt: any): any | null {
  const comps = evt?.competitions;
  if (Array.isArray(comps) && comps.length) return comps[0];
  return null;
}

function pickCompetitors(comp: any): any[] {
  const arr = comp?.competitors;
  return Array.isArray(arr) ? arr : [];
}

function extractSide(c: any): TeamRef {
  const team = c?.team;
  if (team) {
    const id = team.id ?? team.uid ?? 'team';
    const name = team.displayName ?? team.name ?? team.shortDisplayName ?? 'Team';
    const abbr = team.abbreviation ?? null;
    return { id, name, abbr };
  }

  const athlete = c?.athlete;
  if (athlete) {
    const id = athlete.id ?? athlete.uid ?? 'athlete';
    const name = athlete.displayName ?? athlete.fullName ?? 'Fighter';
    return { id, name, abbr: null };
  }

  return { id: c?.id ?? 'side', name: c?.displayName ?? 'Side', abbr: null };
}

export function mapEspnEventToUnified(evt: any, sport: Sport, dateIsoYYYYMMDD: string): UnifiedGame {
  const comp = pickCompetition(evt);
  const competitors = comp ? pickCompetitors(comp) : [];

  const homeC = competitors.find((x) => x?.homeAway === 'home') ?? competitors[0] ?? null;
  const awayC = competitors.find((x) => x?.homeAway === 'away') ?? competitors[1] ?? null;

  const datetimeUtc = asIsoOrNull(evt?.date ?? comp?.date);
  const status =
    asIsoOrNull(comp?.status?.type?.description) ??
    asIsoOrNull(comp?.status?.type?.shortDetail) ??
    asIsoOrNull(comp?.status?.type?.name) ??
    null;

  const home = homeC ? extractSide(homeC) : { id: 'home', name: 'Home', abbr: null };
  const away = awayC ? extractSide(awayC) : { id: 'away', name: 'Away', abbr: null };

  const homeScore = homeC ? toIntOrNull(homeC?.score) : null;
  const awayScore = awayC ? toIntOrNull(awayC?.score) : null;

  const id = evt?.id ?? comp?.id ?? `${sport}-${dateIsoYYYYMMDD}-${home.id}-${away.id}`;

  return {
    id,
    sport,
    date: dateIsoYYYYMMDD,
    datetimeUtc,
    status,
    home,
    away,
    score: { home: homeScore, away: awayScore }
  };
}

export async function fetchFootballEvents(dateIsoYYYYMMDD: string): Promise<any[]> {
  const leagues = FOOTBALL_LEAGUES.length ? FOOTBALL_LEAGUES : ['eng.1'];
  const all: any[] = [];
  const seen = new Set<string>();

  for (const league of leagues) {
    const evts = await fetchEspnScoreboard(`soccer/${league}`, dateIsoYYYYMMDD);
    for (const e of evts) {
      const id = String(e?.id ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      all.push(e);
    }
  }
  return all;
}

export async function fetchCfbEvents(dateIsoYYYYMMDD: string): Promise<any[]> {
  const groups = CFB_GROUPS.length ? CFB_GROUPS : ['80'];
  const all: any[] = [];
  const seen = new Set<string>();

  for (const grp of groups) {
    const evts = await fetchEspnScoreboard('football/college-football', dateIsoYYYYMMDD, { groups: grp });
    for (const e of evts) {
      const id = String(e?.id ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      all.push(e);
    }
  }
  return all;
}

export async function fetchCbbEvents(dateIsoYYYYMMDD: string): Promise<any[]> {
  const groups = CBB_GROUPS.length ? CBB_GROUPS : ['100'];
  const all: any[] = [];
  const seen = new Set<string>();

  for (const grp of groups) {
    const evts = await fetchEspnScoreboard('basketball/mens-college-basketball', dateIsoYYYYMMDD, { groups: grp });
    for (const e of evts) {
      const id = String(e?.id ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      all.push(e);
    }
  }
  return all;
}

export async function fetchMmaEvents(dateIsoYYYYMMDD: string): Promise<any[]> {
  return fetchEspnScoreboard('mma/ufc', dateIsoYYYYMMDD);
}

export async function fetchNflEvents(dateIsoYYYYMMDD: string): Promise<any[]> {
  return fetchEspnScoreboard("football/nfl", dateIsoYYYYMMDD);
}