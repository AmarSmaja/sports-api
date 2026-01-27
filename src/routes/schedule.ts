import type { FastifyPluginAsync } from 'fastify';

type ScheduleQuery = {
  sport?: string;
  date?: string;        
  forceRefresh?: string;
};

function isValidDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function normalizeSport(s?: string) {
  return (s ?? '').trim().toLowerCase();
}

function truthyParam(v?: string) {
  const x = (v ?? '').trim().toLowerCase();
  return x === '1' || x === 'true' || x === 'yes';
}

export const scheduleRoutes: FastifyPluginAsync = async (app) => {
  app.get('/schedule', {
    config: {
      rateLimit: {
        max: 120,
        timeWindow: '1 minute'
      }
    }
  } as any, async (req, reply) => {
    const q = (req.query ?? {}) as ScheduleQuery;

    const sport = normalizeSport(q.sport);
    const date = (q.date ?? '').trim();
    const forceRefresh = truthyParam(q.forceRefresh);

    if (!sport) return reply.status(400).send({ error: 'Missing query param: sport', example: '/schedule/?sport=nba&date=2026-01-25' });

    if (date && !isValidDate(date)) return reply.status(400).send({ error: 'Invalid date format.', got: date });

    let targetPath: string | null = null;

    if (sport === 'nba') {
      const params = new URLSearchParams();
      if (date) params.set('date', date);
      if (forceRefresh) params.set('forceRefresh', 'true');
      targetPath = `/nba/games${params.toString()}`;
    }

    if (sport === 'nfl') {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      if (forceRefresh) params.set('forceRefresh', 'true');
      targetPath = `/nfl/games?${params.toString()}`;
    }

    if (!targetPath) return reply.status(400).send({ error: 'Unsupported sport', sport, supported: ['nba', 'nfl'] });

    const res = await app.inject({ method: "GET", url: targetPath, headers: { accept: 'application/json' } });

    if (res.statusCode >= 400) {
      return reply.status(res.statusCode).send({ error: 'Upstream route error', sport, upstream: targetPath, body: res.body });
    }

    const payload = res.json();

    return reply.send({ sport, ...payload })
  })
};
