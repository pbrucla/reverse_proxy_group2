import { concat, equals } from "https://deno.land/x/std/bytes/mod.ts";
import { indexOfNeedle } from "https://deno.land/x/std/bytes/mod.ts";

/***
 * Write a 400 Bad Request response to the connection, then close the connection
 */
async function writeBadRequestResponse(
	conn: Deno.Conn,
	errorDetails: string
): Promise<void> {
	const enc = new TextEncoder();
	await conn.write(
		enc.encode(
			`HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\n\r\nInvalid request, ${errorDetails}\r\n`
		)
	);

	conn.close();
}

/***
 * Handle a connection
 *
 * Parses and validates the request, then writes a response sending back the request body
 *
 */
async function handleConnection(conn: Deno.Conn): Promise<void> {
	const enc : TextEncoder = new TextEncoder();
	const dec : TextDecoder = new TextDecoder();

	const B_CRLF : Uint8Array = enc.encode("\r\n");
	const B_SPACE : Uint8Array  = enc.encode(" ");
	
	const VALID_METHODS = [
		"GET",
		"POST",
		"PATCH",
		"OPTIONS",
		"HEAD",
		"CONNECT",
		"TRACE",
		"DELETE",
	];

	let requestLineRead : boolean = false;
	let headersRead : boolean = false;
	let requestBodyRead : boolean = false;

	let response : string = "";
	let requestTarget : Uint8Array;
	const headers : { fieldName: Uint8Array; fieldValue: Uint8Array }[] = [];
	let requestBody : Uint8Array = new Uint8Array();

	let buf : Uint8Array;
	while(!requestLineRead || !headersRead || !requestBodyRead) {
		let startIdx : number = 0;
		buf = new Uint8Array(1024);
		//read from connection
		const nbytes = await conn.read(buf);
		if (nbytes === null) {
			return;
		}
		console.log("nbytes: ", nbytes);

		//check if request line has been read
		if(!requestLineRead) {
			const idxFirstCRLF = indexOfNeedle(buf, B_CRLF); // index of first CRLF

			// get method
			const idxMethodEnd = indexOfNeedle(buf, B_SPACE); // index of first space
			const method = buf.slice(0, idxMethodEnd);
			// ref: https://www.rfc-editor.org/rfc/rfc9110#section-9
			if (!VALID_METHODS.includes(dec.decode(method))) {
				await writeBadRequestResponse(conn, "Invalid method");
				return;
			}
			startIdx = idxMethodEnd + 1;
			// get request target
			const idxRequestTargetEnd = indexOfNeedle(buf, B_SPACE, startIdx);
			if (idxRequestTargetEnd === -1) {
				await writeBadRequestResponse(conn, "Missing request target");
				return;
			}
			//TODO validate request target
			requestTarget = buf.slice(startIdx, idxRequestTargetEnd);
			startIdx = idxRequestTargetEnd + 1;

			//get http version
			//slice to end of line
			const httpVersion = buf.slice(startIdx, idxFirstCRLF);
			const B_VALID_HTTP_VERSION = enc.encode("HTTP/1.1");
			//check that it is HTTP/1.1
			if (!equals(httpVersion, B_VALID_HTTP_VERSION)) {
				await writeBadRequestResponse(conn, "Invalid HTTP version");
				return;
			}
			startIdx = idxFirstCRLF + 2;

			requestLineRead = true;
		}
		
		//check if headers have been read
		if(!headersRead) {
			//get headers
			// create UInt8Array concatenating two B_CRLF
			const B_HEADERS_END = concat([B_CRLF, B_CRLF]);
			//end of headers delimiter is two CRLF
			const idxHeadersEnd = indexOfNeedle(buf, B_HEADERS_END);
			let idxHeaderStart = startIdx;

			let idxHeaderEnd = indexOfNeedle(buf, B_CRLF, idxHeaderStart + 1);
			if (idxHeaderEnd === -1) {
				idxHeaderEnd = buf.length;
			}
			else {
				headersRead = true;
				startIdx = idxHeadersEnd + 4;
			}
			const B_COLON = enc.encode(":");
			while (idxHeaderStart < idxHeadersEnd) {
				const fieldLine = buf.slice(idxHeaderStart, idxHeaderEnd);

				const colonIdx = indexOfNeedle(fieldLine, B_COLON);
				if (colonIdx === -1) {
					await writeBadRequestResponse(conn, "Invalid header, missing colon");
					return;
				}
				//field-line   = field-name ":" OWS field-value OWS
				const fieldName = fieldLine.slice(0, colonIdx);
				let fieldValue = fieldLine.slice(colonIdx + 1);

				//trim optional white space (OWS) on field value
				fieldValue = enc.encode(dec.decode(fieldValue).trim());
				//TODO validate header
				headers.push({ fieldName, fieldValue });

				//move header start to end of current header
				idxHeaderStart = idxHeaderEnd + 2;
				idxHeaderEnd = indexOfNeedle(buf, B_CRLF, idxHeaderStart + 1);
			}
		}

		if(requestLineRead && headersRead) {
			//get requestBody (remaining portion of request after headers) up to null byte
			let idxBodyEnd = indexOfNeedle(buf, new Uint8Array([0]), startIdx);
			console.log("idxBodyEnd: ", idxBodyEnd);
			if(idxBodyEnd === -1) {
				idxBodyEnd = buf.length;
			}
			else {
				requestBodyRead = true;
			}

			//append to requestBody
			requestBody = concat([requestBody, buf.slice(startIdx, idxBodyEnd)]);
		}

		console.log("requestLineRead: ", requestLineRead);
		console.log("headersRead: ", headersRead);
		console.log("requestBodyRead: ", requestBodyRead);

	}

	//validate requestBody length if was given
	const contentLengthHeader = headers.find((header) =>
	equals(header.fieldName, enc.encode("Content-Length"))
	);
	if (contentLengthHeader) {
		const contentLength = parseInt(dec.decode(contentLengthHeader.fieldValue));
		if (requestBody.length !== contentLength) {
			await writeBadRequestResponse(conn, "Mismatch Content-Length");
			return;
		}
	}

	/* Write response */
	response = `HTTP/1.1 200 OK\r\n`;
	
	//add content length header
	response += `Content-Length: ${requestBody.length}\r\n`;
	//add content type header if was given
	const contentTypeHeader = headers.find((header) =>
		equals(header.fieldName, enc.encode("Content-Type"))
	);
	if (contentTypeHeader) {
		response += `Content-Type: ${dec.decode(contentTypeHeader.fieldValue)}\r\n`;
	}

	response += "\r\n";
	response += dec.decode(requestBody);

	console.log(response);

	await conn.write(enc.encode(response));
	conn.close();
}

const listener = Deno.listen({ port: 8080 });

// create an await for loop to handle all connections
for await (const conn of listener) {
	handleConnection(conn);
}
