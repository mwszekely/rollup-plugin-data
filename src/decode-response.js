

const itoc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
let ctoi = {};
for (var index = 0; index < 66; index++) ctoi[itoc.charAt(index)] = index;
var finalEq = /[=]{1,2}$/;
function atob2(data) {
    // Fun fact: Worklets have neither fetch nor atob.
    // Meaning no way to decode base64...feels like an oversight?
    // But even besides that issue atob itself returns a string (not an ArrayBuffer) so requires manual copying,
    // another hit against atob.
    //
    // Instead, we manually implement a variant based on core-js's (MIT) implementation
function atob2(data) {
    // Fun fact: Worklets have neither fetch nor atob.
    // Meaning no way to decode base64...feels like an oversight?
    // But even besides that issue atob itself returns a string (not an ArrayBuffer) so requires manual copying,
    // another hit against atob.
    //
    // Instead, we manually implement a variant based on core-js's (MIT) implementation

    let string = data.trim();
    let position = 0;
    let bc = 0;
    let chr, bs;
    if (string.length % 4 === 0) {
        string = string.replace(finalEq, '');
    }
    if (string.length % 4 === 1) {
        throw new DOMException('The string is not correctly encoded', 'InvalidCharacterError');
    }
    const byteCount = Math.floor(string.length * 6 / 8);
	const ret = new Uint8Array(byteCount);
    let outPos = 0;
    while (chr = string.charAt(position++)) {
        if (ctoi.hasOwnProperty(chr)) {
            bs = bc % 4 ? bs * 64 + ctoi[chr] : ctoi[chr];
            if (bc++ % 4) 
                ret[outPos++] = (255 & bs >> (-2 * bc & 6));
        }
    } 
    
    return ret.buffer;
}

function decodeInlineBase64(base64) {
	const regex = ${Base64Regex.toString()};
	const parsed = regex.exec(base64);
	let mime;
    let sextets = base64;
	if (parsed) {
		mime = parsed[1];
		sextets = parsed[3];
	}
	const buffer = atob2(sextets);
	return { mime, buffer };
}

async function decodeAssetShared(response, action, backup) {
	if ("then" in response) {
		return await decodeAssetShared(await response, action, backup);
	}
	if (response.ok) {
		return await action(await response);
	}
	if (backup != null)
		return await backup;

	throw new Error("Critical error: could not load file: HTTP response " + response.status);
}

export function decodeInlineBlob(base64) {
	const { mime, buffer } = decodeInlineBase64(base64);
	return new Blob([buffer], { type: mime })
}

export function decodeInlineArrayBuffer(base64) {
	return decodeInlineBase64(base64).buffer;
}

export function decodeInlineText(text) {
	return text;
}

export function decodeInlineJson(json) {
	return json;
}

export function decodeInlineResponse(base64) {
	return fetch(base64);
}

export async function decodeAssetBlob(response, backupValue = null) {
	return await decodeAssetShared(response, r => r.blob(), backupValue);
}

export async function decodeAssetText(response, backupValue = "") {
	return await decodeAssetShared(response, r => r.text(), backupValue);
}

export async function decodeAssetJson(response, backupValue = "") {
	return await decodeAssetShared(response, r => r.json(), backupValue);
}

export async function decodeAssetArrayBuffer(response, backupValue = "") {
	return await decodeAssetShared(response, r => r.arrayBuffer(), backupValue);
}

export async function decodeAssetResponse(response) {
	return await decodeAssetShared(response, r => r, response);
}

