import { indexOfNeedle, concat } from "https://deno.land/std@0.223.0/bytes/mod.ts";

const CLRF = new Uint8Array([0xd, 0xa]);
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

/**
 * Backend interface, contains an address and a port number.
 */
interface BackendInterface {
    address: string,
    port: number
}

function getBackend(host: string): BackendInterface[] {
    // Given a host like example.com, return the backend IP address(es) and port(s) that the request should be forwarded
    // You will also need to create some sort of config system to save this information
    // For now, you can have one backend, IP 155.248.199.0 and port 25563
    
    // const ips: string[] = ["155.248.199.0:25563"]; 

    const arrayOfHosts = new Map<string, BackendInterface>(
        [
            ["example.com", {address: "155.248.199.0", port: 25563}]
        ]
    )


    const backendObjects : BackendInterface[] = [];
    for (const [_, value] of arrayOfHosts) {
        // create a backend object 
        const backend: BackendInterface = {
            address: value.address,
            port: value.port
        };
        backendObjects.push(backend);
    }    
    return backendObjects;
    // return ips
}

function processHeader(line: string): [string, string] {
    // Separate a header into the header name and value.
    // The header name should be converted to lowercase since it is case insensitive.
    // Leading and trailing whitespace should be trimmed from both the header name and value.
    // Values can contain whitespace in the middle which should be kept, e.g. "User-Agent: Mozilla/5.0 Chrome/91.0"
    // Example input: "Content-Length: 42"
    // Example output: ["content-length", "42"]
    // Useful methods: indexOf(), slice(), trim()

    const name: string = line.split(":")[0].toLowerCase().trim();
    const value: string = line.split(":")[1].trim();
    
    return [name, value];
}

function parseHeaders(headers: string[]): Map<string, string> {
    // Given an array of headers, return a map from header name to value.
    // Use the processHeader function above to process each header.
    // Don't worry about duplicate headers for now (but technically you're supposed to join them with a comma).
    
    const parsedHeaders: Map<string, string> = new Map();

    for (let i=0; i<headers.length; i++) {
        const header = headers[i];
        const [name, value] = processHeader(header);
        parsedHeaders.set(name, value);
    }
    
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
        let requestLine: Uint8Array;
        // the bytes for the request line and the headers, not including the final double CRLF
        let headerBytes = new Uint8Array();
        // the start of the body, in case there's some leftover data after the double CRLF
        // there's no guarantee this will be the entire body
        // we'll need to check content-length and keep reading after header parsing is over
        let partialBody = new Uint8Array();
        let bodyBytesRead = 0;

        while (true) {
            const nbytes = await conn.read(buf);
            if (nbytes === null) {
                break;
            }
            const data = buf.slice(0, nbytes);
            // concatenate the data being read in to the header bytes
            headerBytes = new Uint8Array(data);
            // check for double CRLF
            const idxDoubleCRLF = indexOfNeedle(buf, DOUBLE_CRLF)
            if (idxDoubleCRLF != -1) {
                // slice out the header bytes from the start of the body
                headerBytes = buf.slice(0, idxDoubleCRLF);
                partialBody = buf.slice(idxDoubleCRLF + 1, nbytes);

                // Update the number of bytes of the body read
                bodyBytesRead = nbytes - idxDoubleCRLF;
                break;  // exit the loop
            }
        }

        // HTTP uses ISO-8559-1 encoding (latin1) for headers
        const decoded = dec(headerBytes, "latin1");

        // get the request line (first line) and the header list (every other line) from the decoded string
        // hint: maybe consider splitting the decoded string?
        // requestLine: string = decoded.split('\r\n')[0];
        const headerList: string[] = decoded.split('\r\n').slice(1);
        // you may want to use the parseHeaders() function from above
        const headers: Map<string, string> = parseHeaders(headerList);

        // Determine your destination server on the backend using the host header
        // use the getBackend() function to determine all of the possible backends, and pick one
        const address: string = headers.get("Host")!;   // get host from request header
        const destIp: BackendInterface = getBackend(address)[0];
        
        // throw an error if destIp empty
        if (!destIp) {
            throw new Error("No backend found for host");
        }

        // Forward the request to the backend!
        // Make sure to send all of the original headers received as well as the body exactly as is (unless you are intentionally modifying it)
        // Remember to keep track of how many bytes from the body you've already read, so you don't freeze waiting for more data that won't arrive!
        // You may want to create a constructResponse() function (not already provided) to help with this
        // Useful methods: https://deno.land/api@v1.42.4?s=Deno.connect (Deno.connect()), conn.read(), conn.write()

        // Connect to the backend
        const server = await Deno.connect({hostname: destIp.address, port: destIp.port}); // ** await the connection

        // Write the header bytes, part of the body that has been read,
        // then everything else from the connection
        await server.write(headerBytes);
        await server.write(partialBody);
        const body = new Uint8Array(4096);

        
        const contentLength = parseInt(headers.get("content-length")!);
        while (bodyBytesRead < contentLength) { 
            const nbytes = await conn.read(body);
            if (nbytes === null) {
                break;
            }
            (await server).write(body.slice(0, nbytes));
            bodyBytesRead += nbytes;
        }

        // Receive the response from the backend. You can just pipe the response directly to the client.
        // Useful methods/properties: conn.readable, conn.writable, readable.pipeTo(writable)
        server.readable.pipeTo(conn.writable);
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