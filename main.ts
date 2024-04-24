import { indexOfNeedle, concat } from "https://deno.land/std@0.223.0/bytes/mod.ts";


const DOUBLE_CRLF = new Uint8Array([0xd, 0xa, 0xd, 0xa]);

// utility functions to encode and decode to/from Uint8Array
function enc(x: string): Uint8Array {
    return new TextEncoder().encode(x)
}
function dec(x: Uint8Array, encoding?: string): string {
    return new TextDecoder(encoding).decode(x)
}


// utility function to mark areas that need to be done
function todo<T>(): T {
    const stack = new Error().stack;
    throw new Error("Unfilled todo " + stack?.split("\n")?.[2]?.trim());
}

function getBackend(host: string): string[] {
    // Given a host like example.com, return the backend IP address(es) that the request should be forwarded
    // You will also need to create some sort of config system to save this information
    const ips: string[] = todo();

    return ips;
}

function processHeader(line: string): [string, string] {
    // Separate a header into the header name and value.
    // The header name should be converted to lowercase since it is case insensitive.
    // Leading and trailing whitespace should be trimmed from both the header name and value.
    // Values can contain whitespace in the middle which should be kept, e.g. "User-Agent: Mozilla/5.0 Chrome/91.0"
    // Example input: "Content-Length: 42"
    // Example output: ["content-length", "42"]
    // Useful methods: indexOf(), slice(), trim()

    const name: string = todo();
    const value: string = todo();
    
    return [name, value];
}

function parseHeaders(headers: string[]): Map<string, string> {
    // Given an array of headers, return a map from header name to value.
    // Use the processHeader function above to process each header.
    // Don't worry about duplicate headers for now (but technically you're supposed to join them with a comma).
    
    const parsedHeaders: Map<string, string> = new Map();

    todo();
    
    // example input: ["Host: example.com", "Content-Length: 42", "Accept: */*"]
    // example output: Map { "host" => "example.com", "content-length" => "42", "accept" => "*/*" } 
    return parsedHeaders;
}


async function handleConnection(conn: Deno.Conn): Promise<void> {
    try {
        // Read & process in all headers
        // Reminder: the headers continue until you reach 2 CRLFs in a row, and technically can be any arbitrary size, and that the first line in the request is NOT a header
        // That being said, for efficiency and to prevent DOS attacks that flood the reverse proxy with unlimited data it tries to process, 
        // Many popular reverse proxy software like nginx do not allow arbitrary size headers, and have a cap at 8KB.
        // If a too large header is given, it errors out with a 431 request header too large. Stick to a 400 if you choose to go this route.
        // Or if you want to cap or allow unlimited headers: note that you may want portion of the HTTP messageto use the parseHeaders(), which accepts the string of all the headers
        // You also may want to use indexOfNeedle(data: Uint8Array, needle: Uint8Array), which returns the first index of the needle in the data, or -1 if not found
        // Make sure to use DOUBLE_CRLF for the needle instead of a string, as it must be a Uint8Array
        

        
        
        // the buffer that we read into
        const buf = new Uint8Array(4096);
        // the bytes for the request line and the headers, not including the final double CRLF
        let headerBytes = new Uint8Array(0);
        // the start of the body, in case there's some leftover data after the double CRLF
        // there's no guarantee this will be the entire body
        // we'll need to check content-length and keep reading after header parsing is over
        let body = new Uint8Array(0);
        while (true) {
            const nbytes = await conn.read(buf);
            if (nbytes === null) {
                break;
            }
            const data = buf.slice(0, nbytes);
            // concatenate the data being read in to the header bytes
            headerBytes = todo();
            // check for double CRLF
            if (todo()) {
                // slice out the header bytes from the start of the body
                headerBytes = todo();
                body = todo();
                // exit the loop
                break;
            }
        }

        // HTTP uses ISO-8559-1 encoding (latin1) for headers
        
        const decoded = dec(headerBytes, "latin1");

        // get the request line (first line) and the header list (every other line) from the decoded string
        // hint: maybe consider splitting the decoded string?
        const requestLine: string = todo();
        const headerList: string[] = todo();
        // you may want to use the parseHeaders() function from above
        const headers: Map<string, string> = todo();

        // Now that you have the headers, you can finish reading the body according to the content-length if needed

        // Determine your destination server on the backend using the host header
        // use the getBackend() function to determine all of the possible backends, and pick one
        const destIp: string = todo();

        // Forward the request to the backend!
        // Make sure to send all of the original headers received as well as the body exactly as is (unless you are intentionally modifying it)
        // You may want to create a constructResponse() function (not already provided) to help with this
        // Useful methods: https://deno.land/api@v1.42.4?s=Deno.connect (Deno.connect()), conn.read(), conn.write()
        todo();


        // Receive the response from the backend. You can just pipe the response directly to the client.
        // Useful methods/properties: conn.readable, conn.writable, readable.pipeTo(writable)
        todo();
    } catch (err) {
        // If an error occurs while processing the request, *attempt* to respond with an error to the client
        try {
            console.error(err);
            await conn.write(enc(`HTTP/1.1 500 Internal Server Error\r\nContent-Length: ${err.message.length}\r\nContent-Type: text/plain\r\n\r\n${err.message}`));
        } catch (_) {
            // do nothing
        }
    }
    try {
        conn.close();
    } catch (_) {
        // do nothing
    }
}

if (import.meta.main) {
    const listener = Deno.listen({ port: 8080 });

    for await (const conn of listener) {
        // we don't await this, why?
        handleConnection(conn);
    }
}
