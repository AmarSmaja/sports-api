import type { FastifyPluginAsync } from "fastify";
import { env } from "../server";
import { promises as fs, write } from "node:fs";
import path from "node:path";

type NflGamesQuery = {
    date?: string;
    forceRefresh?: string;
}

function truthyParam(v: unknown): boolean {
    if (v == null) return false;
    const s = String(v).trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "y";
}

function isValidDate(d: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function toEspnDatesParam(dateYmd: string): string {
    return dateYmd.replaceAll("-", "");
}

async function readJsonIfFresh(cachePath: string, ttlMs: number) {
    try {
        const st = await fs.stat(cachePath);
        const age = Date.now() - st.mtimeMs;
        if (age > ttlMs) return null;
        const raw = await fs.readFile(cachePath, "utf8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function writeJson(cachePath: string, date: unknown) {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(date), "utf8");
}

function parseEspnNflScoreboard(payload: any) {
    const events = Array.isArray(payload?.events) ? payload.events : [];

    const games = events.map((ev: any) => {
        const comp = Array.isArray(ev?.competitions) ? ev.competitions[0] : null;
        const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];

        const home = competitors.find((c: any) => c?.homeAway === "home") ?? "null";
        const away = competitors.find((c: any) => c?.homeAway === "away") ?? "null";

        const statusType = comp?.status?.type ?? {};
        const status = {
            state: statusType?.state ?? null,
            detail: statusType?.detail ?? null,
            completed: Boolean(statusType?.completed),
        };

        return {
            id: String(ev?.id ?? comp?.id ?? ""),
            startTimeUtc: ev?.date ?? comp?.date ?? null,
            name: ev?.name ?? null,
            status,
            home: home
            ? {
                id: String(home?.team?.id ?? ""),
                name: home?.team?.displayName ?? null,
                abbr: home?.team?.abbreviation ?? null,
                score: home?.score != null ? Number(home.score) : null,
            } : null,
            away: away
            ? {
                id: String(away?.team?.id ?? ""),
                name: away?.team?.displayName ?? null,
                abbr: away?.team?.abbreviation ?? null,
                score: away?.score != null ? Number(away.score) : null,
            } : null,
        };
    });

    return { games };
}

export const nflRoutes: FastifyPluginAsync = async (app) => {
    app.get<{ QueryString: NflGamesQuery }>("/games", async (req, reply) => {
        const date = (req.query?.date ?? "").trim();
        const forceRefresh = truthyParam(req.query?.forceRefresh);

        if (date && !isValidDate(date)) return reply.status(400).send({ error: "Invalid date format", got: date });

        const base = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
        const dates = date ? toEspnDatesParam(date) : "";
        const url = dates ? `${base}?dates=${encodeURIComponent((dates))}` : base;

        const cacheKey = date ? `nfl_${date}` : "nfl_today";
        const cachePath = path.join(env.cacheDir, `${cacheKey}.json`);

        const ttlMs = date ? 5 * 60_000 : 60_000;

        if (!forceRefresh) {
            const cached = await readJsonIfFresh(cachePath, ttlMs);
            if (cached) return reply.send({ sport: "nfl", source: "espn", cached: true, date: date || null, ...cached });
        }

        const r = await fetch(url, { headers: { accept: "application/json" } });
        if (!r.ok) {
            const txt = await r.text().catch(() => "");
            return reply.status(502).send({ error: "ESPN upstream error", status: r.status, body: txt.slice(0, 500) });
        }

        const json = await r.json();
        const parsed = parseEspnNflScoreboard(json);

        await writeJson(cachePath, parsed);

        return reply.send({ sport: "nfl", source: "espn", cached: false, date: date || null, ...parsed });
    });
};