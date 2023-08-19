
export async function decodeInlineBlob(base64)        { return (await fetch(base64)).blob(); }
export async function decodeInlineArrayBuffer(base64) { return (await fetch(base64)).arrayBuffer(); }
export async function decodeInlineText(text)          { return (await Promise.resolve(text)); }
export async function decodeInlineJson(json)          { return (await Promise.resolve(json)); }
export async function decodeInlineResponse(base64)    { return (await fetch(base64)); }

export async function decodeAssetBlob(response, backupValue = null)      { return await decodeAssetShared(response, r => r.blob(), backupValue); }
export async function decodeAssetText(response, backupValue = "")        { return await decodeAssetShared(response, r => r.text(), backupValue); }
export async function decodeAssetJson(response, backupValue = "")        { return await decodeAssetShared(response, r => r.json(), backupValue); }
export async function decodeAssetArrayBuffer(response, backupValue = "") { return await decodeAssetShared(response, r => r.arrayBuffer(), backupValue); }
export async function decodeAssetResponse(response)                      { return await decodeAssetShared(response, r => r, response); }

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

