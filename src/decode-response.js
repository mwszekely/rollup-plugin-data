function decodeInlineBase64(base64) {
	const regex = ${Base64Regex.toString()};
	const parsed = regex.exec(base64);
	let mime;
	if (parsed) {
		mime = parsed[1];
	}
	const decoded = atob(base64);
	let ret = new Uint8Array(decoded.length);
	for (let i = 0; i < decoded.length; ++i) {
		ret[i] = decoded[i];
	}
	return { mime, buffer: ret.buffer };
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