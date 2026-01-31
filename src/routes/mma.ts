import type { FastifyPluginAsync } from "fastify";
import { fetchMmaEvents, mapEspnEventToUnified } from "../lib/espn";

type GamesQuery = { date?: string; forceRefresh?: string };

function isValidDate(s: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export const mmaRoutes: FastifyPluginAsync = async (app) => {
    app.get('/games', async (req, reply) => {
        const q = (req.query ?? {}) as GamesQuery;
        const date = (q.date ?? '').trim();

        if (date && !isValidDate(date)) return reply.status(400).send({ error: 'Invalid date format', got: date });

        const effectiveDate = date || new Date().toISOString().slice(0, 10);
        const events = await fetchMmaEvents(effectiveDate);
        const data = events.map((e) => mapEspnEventToUnified(e, 'mma', effectiveDate));

        return { date: effectiveDate, provider: 'espn', cached: false, stale: false, fetchedAt: new Date().toISOString(), data };
    })
}