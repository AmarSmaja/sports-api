import { FastifyPluginAsync } from "fastify";
import { env } from "../server";
import { getOrSetFileCache } from "../lib/fileCache";
import { fetchNbaGamesByDate, BalldontlieGame } from "../lib/balldontlie";

type NbaGameDto = {
    id: number;
    date: string;
    datetimeUtc: string | null;
    status: string | null;
    home: { id: number; name: string; abbr: string };
    away: { id: number; name: string; abbr: string };
    score: { home: number; away: number; };
};

function isValidDateParam(s: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function todayUtcDateString(): string {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function ttlForDate(date: string): number {
    const today = todayUtcDateString();
    return date === today ? 5 * 60_000 : 6 * 60 * 60_000;
}

function mapGame(g: BalldontlieGame): NbaGameDto {
    return {
        id: g.id,
        date: g.date,
        datetimeUtc: g.datetime,
        status: g.status,
        home: { id: g.home_team.id, name: g.home_team.full_name, abbr: g.home_team.abbreviation },
        away: { id: g.visitor_team.id, name: g.visitor_team.full_name, abbr: g.visitor_team.abbreviation },
        score: { home: g.home_team_score, away: g.visitor_team_score }
    };
}

export const nbaRoutes: FastifyPluginAsync = async (app) => {
    app.get("/games", {
        schema: {
            querystring: {
                type: "object",
                properties: {
                    date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                    forceRefresh: { type: "boolean" }
                },
                additionalProperties: false
            }
        }
    }, async (req, reply) => {
        const q = req.query as { date?: string; forceRefresh?: boolean };
        const date = q.date ?? todayUtcDateString();

        if (!isValidDateParam(date)) {
            return reply.code(400).send({ error: "Invalid date!" });
        }

        const key = `nba/games/${date}.json`;
        const ttlMs = ttlForDate(date);

        if (q.forceRefresh) {
            const games = await fetchNbaGamesByDate(date);
            return { date, provider: "balldontlie", cached: false, stale: false, fetchedAt: new Date().toISOString(), data: games.map(mapGame) };
        }

        const result = await getOrSetFileCache({
            cacheDir: env.cacheDir,
            key,
            ttlMs,
            fetcher: async () => {
                const games = await fetchNbaGamesByDate(date);
                return games.map(mapGame);
            }
        });

        reply.header("cache-control", "public, max-age=30");
        return {
            date,
            provider: "balldontlie",
            cached: result.cached,
            stale: result.stale,
            fetchedAt: result.fetchedAt,
            data: result.value
        };
    });
};