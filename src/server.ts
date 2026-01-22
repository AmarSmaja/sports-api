import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";
import { nbaRoutes } from "./routes/nba";

function requiredEnv(name: string): String {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
}

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export const env = {
    balldontlieApiKey: requiredEnv("BALLDONTLIE_API_KEY"),
    balldontlieBaseUrl: process.env.BALLDONTLIE_BASE_URL ?? "https://api.balldontlie.io",
    cacheDir: process.env.CACHE_DIR ?? ".cache"
};

async function main() {
    const app = Fastify({ logger: true });

    await app.register(cors, { origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS: true, credentials: false })

    app.get("/health", async () => ({ ok: true }));

    await app.register(nbaRoutes, { prefix: "/nba" });

    await app.listen({ port: PORT, host: HOST });
    app.log.info(`API is listening on http://${HOST}:${PORT}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
})