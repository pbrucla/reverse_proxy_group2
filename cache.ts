const CACHE_NAME = "temp";

async function checkCache(address: string): Promise<Response | undefined> {
    const cache = await caches.open(CACHE_NAME);
    try {
        const cacheResponse = await cache.match(new Request(new URL(`http://${address}/`)));
        return cacheResponse;
    } catch {
        return undefined;
    }
}

async function addCache(address: string, serverResponse: ReadableStream): Promise<void> {
    // new URL(`http://${address}/`);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(new Request(new URL(`http://${address}/`)), new Response(serverResponse));
}

export {checkCache, addCache};
