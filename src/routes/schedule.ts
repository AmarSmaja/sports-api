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

    if (!sport) {
      return reply.status(400).send({
        error: 'Missing query param: sport',
        example: '/schedule/?sport=nba&date=2026-01-25'
      });
    }

    if (date && !isValidDate(date)) {
      return reply.status(400).send({ error: 'Invalid date format.', got: date });
    }

    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (forceRefresh) params.set('forceRefresh', 'true');
    const qs = params.toString();

    let targetPath: string | null = null;

    switch (sport) {
      case 'nba':
        targetPath = qs ? `/nba/games?${qs}` : `/nba/games`;
        break;

      case 'nfl':
        targetPath = qs ? `/nfl/games?${qs}` : `/nfl/games`;
        break;

      case 'football':
        targetPath = qs ? `/football/games?${qs}` : `/football/games`;
        break;

      case 'cbb':
        targetPath = qs ? `/cbb/games?${qs}` : `/cbb/games`;
        break;

      case 'cfb':
        targetPath = qs ? `/cfb/games?${qs}` : `/cfb/games`;
        break;

      case 'mma':
        targetPath = qs ? `/mma/games?${qs}` : `/mma/games`;
        break;

      default:
        return reply.status(400).send({
          error: 'Unsupported sport',
          sport,
          supported: ['nba', 'nfl', 'football', 'cbb', 'cfb', 'mma']
        });
    }

    const res = await app.inject({
      method: 'GET',
      url: targetPath,
      headers: { accept: 'application/json' }
    });

    if (res.statusCode >= 400) {
      return reply.status(res.statusCode).send({
        error: 'Upstream route error',
        sport,
        upstream: targetPath,
        body: res.body
      });
    }

    const payload = res.json();
    return reply.send({ sport, ...payload });
  });
};