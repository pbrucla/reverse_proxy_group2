import { concat, equals } from "https://deno.land/std@0.102.0/bytes/mod.ts";
import { indexOfNeedle } from "https://deno.land/std@0.223.0/bytes/mod.ts";

/***
 * Write a 400 Bad Request response to the connection, then close the connection
 */
async function writeBadRequest(
	conn: Deno.Conn,
	errorDetails: string
): Promise<void> {
	const enc = new TextEncoder();
	await conn.write(
		enc.encode(
			`HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\n\r\nInvalid request, ${errorDetails}`
		)
	);

	conn.close();
}

/***
 * Handle a connection
 *
 * Parses and validates the request, then writes a response echoing the request headers and body
 *
 */
async function handleConnection(conn: Deno.Conn): Promise<void> {
	const buf = new Uint8Array(4096);
	const nbytes = await conn.read(buf);
	if (nbytes === null) {
		return;
	}
	const enc = new TextEncoder();
	const dec = new TextDecoder();

	const B_CRLF = enc.encode("\r\n");
	const B_SPACE = enc.encode(" ");
	const idxFirstCRLF = indexOfNeedle(buf, B_CRLF); // index of first CRLF

	// get method
	const idxMethodEnd = indexOfNeedle(buf, B_SPACE); // index of first space
	const method = buf.slice(0, idxMethodEnd);
	const VALID_METHODS = [
		"GET",
		"POST",
		"PATCH",
		"OPTIONS",
		"HEAD",
		"CONNECT",
		"TRACE",
	];
	if (!VALID_METHODS.includes(dec.decode(method))) {
		await writeBadRequest(conn, "Invalid method");
		return;
	}

	// get request target
	const idxRequestTargetEnd = indexOfNeedle(buf, B_SPACE, idxMethodEnd + 1);
	if (idxRequestTargetEnd === -1) {
		await writeBadRequest(conn, "Missing request target");
		return;
	}
	//TODO validate request target
	const requestTarget = buf.slice(idxMethodEnd + 1, idxRequestTargetEnd);

	//get http version
	//slice to end of line
	const httpVersion = buf.slice(idxRequestTargetEnd + 1, idxFirstCRLF);
	const B_VALID_HTTP_VERSION = enc.encode("HTTP/1.1");
	//check that it is HTTP/1.1
	if (!equals(httpVersion, B_VALID_HTTP_VERSION)) {
		await writeBadRequest(conn, "Invalid HTTP version");
		return;
	}

	//get headers
	// create UInt8Array concatenating two B_CRLF
	const B_HEADERS_END = concat(B_CRLF, B_CRLF);
	//end of headers delimiter is two CRLF
	const idxHeadersEnd = indexOfNeedle(buf, B_HEADERS_END);
	const headers = [];
	let idxHeaderStart = idxFirstCRLF;

	let idxHeaderEnd = indexOfNeedle(buf, B_CRLF, idxHeaderStart + 1);
	if (idxHeaderEnd === -1) {
		await writeBadRequest(conn, "Missing headers");
		return;
	}

	const B_COLON = enc.encode(":");
	while (idxHeaderStart < idxHeadersEnd) {
		const fieldLine = buf.slice(idxHeaderStart, idxHeaderEnd);

		const colonIdx = indexOfNeedle(fieldLine, B_COLON);
		if (colonIdx === -1) {
			await writeBadRequest(conn, "Invalid header, missing colon");
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

	//check for Content-Length header
	const contentLengthHeader = headers.find((header) =>
		equals(header.fieldName, enc.encode("Content-Length"))
	);
	if (contentLengthHeader === undefined) {
		await writeBadRequest(conn, "Missing Content-Length header");
		return;
	}
	//validate content length
	const contentLength = parseInt(dec.decode(contentLengthHeader.fieldValue));
	if (isNaN(contentLength) || contentLength < 0) {
		await writeBadRequest(conn, "Invalid Content-Length header");
		return;
	}

	//check for Content-Type header
	const contentTypeHeader = headers.find((header) =>
		equals(header.fieldName, enc.encode("Content-Type"))
	);
	if (contentTypeHeader === undefined) {
		await writeBadRequest(conn, "Missing Content-Type header");
		return;
	}

	//get requestBody (remaining portion of request after headers) up to null byte
	const idxBodyEnd = indexOfNeedle(buf, new Uint8Array([0]), idxHeadersEnd + 4);
	const requestBody = buf.slice(idxHeadersEnd + 4, idxBodyEnd);
	//check if request body matches content length
	if (requestBody.length !== contentLength) {
		await writeBadRequest(
			conn,
			"Request body does not match Content-Length header"
		);
		return;
	}

	/* Write response */
	let response = `${dec.decode(httpVersion)} 200 OK\r\n`;
	for (const header of headers) {
		response += `${dec.decode(header.fieldName)}: ${dec.decode(
			header.fieldValue
		)}\r\n`;
	}
	response += "\r\n";
	response += dec.decode(requestBody);

	//console.log(response);

	await conn.write(enc.encode(response));
	conn.close();
}

const listener = Deno.listen({ port: 8080 });

// create an await for loop to handle all connections
for await (const conn of listener) {
	handleConnection(conn);
}
