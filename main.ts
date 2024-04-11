

/**
 * echo_server.ts
 */

const listener = Deno.listen({ port: 8080 });
console.log("listening on 0.0.0.0:8080");

for await (const conn of listener) {
    while(true) {    
        const data = new Uint8Array(1024);
        const bytesRead = await conn.read(data);
        console.log("bytes read: ", bytesRead);
        const bytesWritten = await conn.write(data);
        console.log("bytes written: ", bytesWritten);
    }
}