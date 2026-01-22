import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

type CacheEnvelope<T> = {
    fetchedAt: string;
    value: T;
};

export type CacheResult<T> = {
    value: T;
    cached: boolean;
    stale: boolean;
    fetchedAt: string;
}

async function ensureDir(dir: string) {
    await mkdir(dir, { recursive: true });
}

export async function getOrSetFileCache<T>(opts: {
    cacheDir: string;
    key: string;
    ttlMs: number;
    fetcher: () => Promise<T>;
}): Promise<CacheResult<T>> {
    const fullPath = path.join(opts.cacheDir, opts.key);

    try {
        const raw = await readFile(fullPath, "utf8");
        const envelope = JSON.parse(raw) as CacheEnvelope<T>;
        const ageMs = Date.now() - new Date(envelope.fetchedAt).getTime();

        if (ageMs <= opts.ttlMs) {
            return { value: envelope.value, cached: true, stale: false, fetchedAt: envelope.fetchedAt };
        } 
    } catch {
        // ubaci ako se desi cache miss, kao sto prof. dr. kaze
    }

    try {
        const value = await opts.fetcher();
        const envelope: CacheEnvelope<T> = { fetchedAt: new Date().toISOString(), value };

        await ensureDir(path.dirname(fullPath));

        const tmp = `${fullPath}.tmp`;
        await writeFile(tmp, JSON.stringify(envelope), "utf8");
        await writeFile(fullPath, JSON.stringify(envelope), "utf8");

        return { value, cached: false, stale: false, fetchedAt: envelope.fetchedAt };
    } catch (err) {
        try {
            const raw = await readFile(fullPath, "utf8");
            const envelope = JSON.parse(raw) as CacheEnvelope<T>;
            return { value: envelope.value, cached: true, stale: true, fetchedAt: envelope.fetchedAt };
        } catch {
            throw err;
        }
    }
}