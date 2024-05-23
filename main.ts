import { indexOfNeedle, concat } from "https://deno.land/std@0.223.0/bytes/mod.ts";
import { AccessLog, log, requestLoggingPermissions } from "./logging.ts";

const DOUBLE_CRLF = new Uint8Array([0xd, 0xa, 0xd, 0xa]);

// utility functions to encode and decode to/from Uint8Array
function enc(x: string): Uint8Array {
    return new TextEncoder().encode(x)
}
function dec(x: Uint8Array, encoding?: string): string {
    return new TextDecoder(encoding).decode(x)
}


// Define the interface for a backend server
interface BackendInterface {
    address: string,
    port: number
}

function getBackend(host: string): BackendInterface[] | undefined {
    // Given a host like example.com, return the backend IP address(es) that the request should be forwarded
    // You will also need to create some sort of config system to save this information
    const arrayOfHosts = new Map<string, BackendInterface[]>(
        [
            ["cybrick.acmcyber.com", [{address: "155.248.199.0", port: 25561}]],
            ["video.acmcyber.com", [{address: "155.248.199.0", port: 25563}]]
        ]
    )
    
    return arrayOfHosts.get(host);
}

function processHeader(line: string): [string, string] {
    // Separate a header into the header name and value.
    // The header name should be converted to lowercase since it is case insensitive.
    // Leading and trailing whitespace should be trimmed from both the header name and value.
    // Values can contain whitespace in the middle which should be kept, e.g. "User-Agent: Mozilla/5.0 Chrome/91.0"
    // Example input: "Content-Length: 42"
    // Example output: ["content-length", "42"]

    const name: string = line.split(":")[0].toLowerCase().trim();
    const value: string = line.split(":").slice(1).join(":").trim();
    
    return [name, value];
}

function parseHeaders(headers: string[]): Map<string, string> {
    // Given an array of headers, return a map from header name to value.
    // Use the processHeader function above to process each header.
    // Don't worry about duplicate headers for now (but technically you're supposed to join them with a comma).
    
    const parsedHeaders: Map<string, string> = new Map();
    headers.forEach(header => {
        const [name, value] = processHeader(header);
        parsedHeaders.set(name, value);
    });
    
    // example input: ["Host: example.com", "Content-Length: 42", "Accept: */*"]
    // example output: Map { "host" => "example.com", "content-length" => "42", "accept" => "*/*" } 
    return parsedHeaders;
}

function constructRequest(requestLine: string, headers: Map<string, string>, body: Uint8Array): Uint8Array {
    // Given the request line, headers, and body, return the response to send to the client.

    let request = enc(requestLine + "\r\n");
    headers.forEach((value, key) => {
        request = concat([request, enc(`${key}: ${value}\r\n`)])
    });
    request = concat([request, enc("\r\n")]);
    request = concat([request, body]);

    return request;
}

function constructResponse(statusLine: string, headers: Map<string, string>, body: Uint8Array): Uint8Array {
    // Given the status line, headers, and body, return the response to send to the client.

    let response = enc(statusLine + "\r\n");
    headers.forEach((value, key) => {
        response = concat([response, enc(`${key}: ${value}\r\n`)])
    });
    response = concat([response, enc("\r\n")]);
    response = concat([response, body]);

    return response;
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
            headerBytes = concat([headerBytes, data]);
            const idxDoubleCLRF = indexOfNeedle(headerBytes, DOUBLE_CRLF);
            // check for double CRLF
            if (idxDoubleCLRF != -1) {
                // slice out the header bytes from the start of the body
                body = headerBytes.slice(idxDoubleCLRF + DOUBLE_CRLF.length);
                headerBytes = headerBytes.slice(0, idxDoubleCLRF);
                // exit the loop
                break;
            }
        }

        // HTTP uses ISO-8559-1 encoding (latin1) for headers
        
        const decoded = dec(headerBytes, "latin1");

        // get the request line (first line) and the header list (every other line) from the decoded string
        
        const requestLine: string = decoded.substring(0, decoded.indexOf("\r\n"));
        const headerList: string[] = decoded.substring(decoded.indexOf("\r\n") + 2).split("\r\n");
        // you may want to use the parseHeaders() function from above
        const headers: Map<string, string> = parseHeaders(headerList);

        // Determine your destination server on the backend using the host header
        // use the getBackend() function to determine all of the possible backends, and pick one
        const address: string = headers.get("host")!;   // get host from request header
        const destIp: BackendInterface[] | undefined = getBackend(address);

        if(!destIp) {
            log("ERROR", "Backend not found", {host: address, requestLine, headers, body});
            await conn.write(enc("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n"));
            return;
        }

        // Forward the request to the backend!
        // Use the Deno.connect() function to connect to the backend
        const backendConn = await Deno.connect({ hostname: destIp[0].address, port: destIp[0].port}); //TODO arbitrarily get the first backend for now

        // Construct the request to send to the backend, and write it to the backend connection
        const request = constructRequest(requestLine, headers, body);
        await backendConn.write(request);
        let bodyBytesRead = body.byteLength;

        // Write everything else from the connection
        const contentLength = parseInt(headers.get("content-length")!);
        while (bodyBytesRead < contentLength) { 
            const nbytes = await conn.read(body);
            if (nbytes === null) {
                break;
            }
            (await backendConn).write(body.slice(0, nbytes));
            bodyBytesRead += nbytes;
        }
      
        //log successful request
        const referer : string | undefined = headers.get("referer");
        const userAgent : string | undefined = headers.get("user-agent");

        const accessLog : AccessLog = {
            method: requestLine.split(" ")[0],
            url: requestLine.split(" ")[1],
            protocol: requestLine.split(" ")[2],
            status: 200,
            size: contentLength,
            referer: referer? referer : "",
            userAgent: userAgent? userAgent : "",
            responseTime: 0,
            upstream_response_time: 0,
            backend: destIp[0].address
        }

        log("INFO", "Request successful", accessLog);

        // Read the response from the backend and write it back to the client
        
        body = new Uint8Array(0);
        headerBytes = new Uint8Array(0);
        while (true) {
            const nbytes = await backendConn.read(buf);
            if (nbytes === null) {
                break;
            }
            const data = buf.slice(0, nbytes);
            // concatenate the data being read in to the header bytes
            headerBytes = concat([headerBytes, data]);
            const idxDoubleCLRF = indexOfNeedle(headerBytes, DOUBLE_CRLF);
            // check for double CRLF
            if (idxDoubleCLRF != -1) {
                // slice out the header bytes from the start of the body
                body = headerBytes.slice(idxDoubleCLRF + DOUBLE_CRLF.length);
                headerBytes = headerBytes.slice(0, idxDoubleCLRF);
                // exit the loop
                break;
            }
        }
        
        const decodedResponseHeaders = dec(headerBytes, "latin1");
        
        const statusLine: string = decodedResponseHeaders.substring(0, decodedResponseHeaders.indexOf("\r\n"));
        const responseHeaderList: string[] = decodedResponseHeaders.substring(decodedResponseHeaders.indexOf("\r\n") + 2).split("\r\n");
        const responseHeaders: Map<string, string> = parseHeaders(responseHeaderList);
        console.log(responseHeaders);
        
        // Construct the response to send back to client, and write it to the client connection
        const response = constructResponse(statusLine, responseHeaders, body);
        await conn.write(response);
        bodyBytesRead = body.byteLength;

        // Write everything else from the connection
        const responseContentLength = parseInt(responseHeaders.get("content-length")!);
        while (bodyBytesRead < responseContentLength) { 
            const nbytes = await backendConn.read(body);
            if (nbytes === null) {
                break;
            }
            (await conn).write(body.slice(0, nbytes));
            bodyBytesRead += nbytes;
        }


    } catch (err) {
        // If an error occurs while processing the request, *attempt* to respond with an error to the client
        try {
            log("ERROR", "Error processing request", {error: err});
            await conn.write(enc(`HTTP/1.1 500 Internal Server Error\r\nContent-Length: ${err.message.length}\r\nContent-Type: text/plain\r\n\r\n${err.message}`));
        } catch (_) {
            // do nothing
        }
    }

    // close
    try {
        conn.close();
    } catch (_) {
        // do nothing
    }
}

if (import.meta.main) {
    const listener = Deno.listen({ port: 8080 });
    requestLoggingPermissions();

    for await (const conn of listener) {
        // don't await because want to handle multiple connections at once
        handleConnection(conn);
    }
}
