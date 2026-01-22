import { env } from "../server";

export type BalldontlieTeam = {
    id: number;
    full_name: string;
    abbreviation: string;
    city: string;
    name: string;
    conference?: string;
    division?: string;
}

export type BalldontlieGame = {
    id: number;
    date: string;
    datetime: string | null;
    season: number;
    status: string | null;
    period: number | null;
    time: string | null;
    postseason: boolean;
    home_team_score: number;
    visitor_team_score: number;
    home_team: BalldontlieTeam;
    visitor_team: BalldontlieTeam;
};

type ListResponse<T> = {
    data: T[];
    meta?: {
        next_cursor?: number;
        per_page?: number;
    };
};

function withTimeout(ms: number) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    return { controller, cancel: () => clearTimeout(id) };
}

export async function fetchNbaGamesByDate(date: string): Promise<BalldontlieGame[]> {
    const url = new URL("/v1/games", env.balldontlieBaseUrl);
    url.searchParams.append("dates[]", date);
    url.searchParams.set("per_page", "100");

    const { controller, cancel } = withTimeout(10_000);

    try {
        const res = await fetch(url.toString(), {
            method: "GET",
            headers: {
                Authorization: env.balldontlieApiKey,
                Accept: "application/json"
            },
            signal: controller.signal
        });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`balldontlie error: ${res.status} ${res.statusText} ${body}`);
        }

        const json = (await res.json()) as ListResponse<BalldontlieGame>;
        return json.data ?? [];
    } finally {
        cancel();
    }
}