async function decodeInlineText(text)          { return (await Promise.resolve(text)); }
async function decodeInlineJson(json)          { return (await Promise.resolve(json)); }

async function decodeAssetBlob(response, backupValue = null)      { return await decodeAssetShared(response, r => r.blob(), backupValue); }

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

const data$2 = decodeInlineJson({
    "test": "foo"
});

const data$1 = decodeInlineText("This is a test\r\nand that was\r\na newline\r\n(so were those)");

const data = decodeAssetBlob(fetch("assets\\test.webp"));

(async () => {
    const a = await Promise.all([data$1, data$2, data]);
    console.log(a);
})();
//# sourceMappingURL=index.js.map
