/*
const listener = Deno.listen({ port: 5000 });
console.log("listening on 0.0.0.0:5000");
for await (const conn of listener) {
    conn.localAddr
}
*/
import { concat, equals } from "https://deno.land/std@0.102.0/bytes/mod.ts";
import { indexOfNeedle } from "https://deno.land/std@0.223.0/bytes/mod.ts";

async function writeBadRequest(conn: Deno.Conn, errorDetails: string): Promise<void> {
    const enc = new TextEncoder();
    await conn.write(enc.encode(`HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\n\r\nInvalid request, ${errorDetails}`));
}

async function handleConnection(conn: Deno.Conn): Promise<void> { // get a connection out of the way
    const buf = new Uint8Array(4096);
    while (true) {
        const nbytes = await conn.read(buf);
        if (nbytes === null) {
            break;
        }

        console.log(nbytes);
        const enc = new TextEncoder();
        const dec = new TextDecoder();
        
        const B_CRLF = enc.encode("\r\n");
        const B_SPACE = enc.encode(" ");
        const firstCRLF = indexOfNeedle(buf, B_CRLF); // index of first CRLF

        // get method
        const idxMethodEnd = indexOfNeedle(buf, B_SPACE); // index of first space
        const method = buf.slice(0, idxMethodEnd);
        const VALID_METHODS = ["GET", "POST", "PATCH", "OPTIONS", "HEAD", "CONNECT", "TRACE"];
        if (!VALID_METHODS.includes(dec.decode(method))) {
            await writeBadRequest(conn, "Invalid method");
            break;
        }

        // get request target
        const idxRequestTargetEnd = indexOfNeedle(buf, B_SPACE, idxMethodEnd+1); 
        if(idxRequestTargetEnd === -1) {
            await writeBadRequest(conn, "Missing request target");
            break;
        }
        //TODO validate request target
        const requestTarget = buf.slice(idxMethodEnd+1, idxRequestTargetEnd); 

        //get http version 
        //slice to end of line
        const httpVersion = buf.slice(idxRequestTargetEnd+1, firstCRLF); 
        const B_VALID_HTTP_VERSION = enc.encode("HTTP/1.1");
        //check that it is HTTP/1.1
        if(!equals(httpVersion, B_VALID_HTTP_VERSION)) {
            await writeBadRequest(conn, "Invalid HTTP version");
            break;
        }   
    
        //get headers    
        // create UInt8Array concatenating two B_CRLF
        const B_HEADERS_END = concat(B_CRLF, B_CRLF);
        //end of headers delimiter is two CRLF
        const idxHeadersEnd = indexOfNeedle(buf, B_HEADERS_END);
        const headers = [];
        let idxHeaderStart = firstCRLF;

        const B_COLON = enc.encode(":");
        while(idxHeaderStart < idxHeadersEnd) {
            const idxHeaderEnd = indexOfNeedle(buf, B_CRLF, idxHeaderStart+1);
            const fieldLine = buf.slice(idxHeaderStart, idxHeaderEnd);

            const colonIdx = indexOfNeedle(fieldLine, B_COLON);
            if(colonIdx === -1) {
                await writeBadRequest(conn, "Invalid header, missing colon");
                break;
            }
            //field-line   = field-name ":" OWS field-value OWS
            const fieldName = fieldLine.slice(0, colonIdx);
            let fieldValue = fieldLine.slice(colonIdx+1);

            //trim optional white space (OWD) on field value
            fieldValue = enc.encode(dec.decode(fieldValue).trim());
            //TODO validate header
            headers.push({fieldName, fieldValue});

            //move header start to end of current header
            idxHeaderStart = idxHeaderEnd + 2;
        }

        //get requestBody (remaining portion of request after headers)
        const requestBody = buf.slice(idxHeadersEnd+4); 


        /* Write response */
        let response = `${dec.decode(httpVersion)} 200 OK\r\n`;
        for(const header of headers) {
            response += `${dec.decode(header.fieldName)}: ${dec.decode(header.fieldValue)}\r\n`;
        }
        response += "\r\n";
        response += dec.decode(requestBody);

        // console.log(response);
        
        await conn.write(enc.encode(response))
    }
    conn.close();
}

const listener = Deno.listen({ port: 8080 });

// create an await for loop to handle all connections
for await (const conn of listener) {
    handleConnection(conn);
}