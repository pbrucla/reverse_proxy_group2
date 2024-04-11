const listener = Deno.listen({ port: 5000 });
console.log("listening on 0.0.0.0:5000");

for await (const conn of listener) {
    // conn.readable.pipeTo(conn.writable);
    while (true) {
        const buf = new Uint8Array(4096);
        const bytesRead = await conn.read(buf);
        if (!bytesRead) break;
        await conn.write(buf.slice(0, bytesRead));
    }
    conn.close();
}
