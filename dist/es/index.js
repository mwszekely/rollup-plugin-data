import { createFilter, normalizePath } from '@rollup/pluginutils';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import MagicString from 'magic-string';
import { dirname, join, isAbsolute, basename, extname, relative } from 'path';

const DATA_PREFIX = "datafile:";
/** When we handle a datafile: id, ensure others don't handle it. The rest of the ID is stripped and replaced with a unique number. */
const SELFISH_DATA_PREFIX = "\0datafile:";
function getDefaultAssetPathInfo(fullFilePath, projectRootDir) {
    const p = fullFilePath;
    const bn = basename(p);
    const ext = extname(p);
    const filename = bn.substring(0, bn.length - ext.length);
    const hasher = createHash("sha256");
    const pathRelativeToProject = relative(projectRootDir, p);
    hasher.update(pathRelativeToProject);
    const hash = hasher.digest("hex");
    return { fileExtWithDot: ext, fileName: filename, hashPathRelative: hash, pathRelative: pathRelativeToProject };
}
function getDefaultAssetPath({ fileExtWithDot, fileName }) {
    return `assets/${fileName}${fileExtWithDot}`;
}
function mergeOptions(target, modifier) {
    return {
        location: (target === null || target === void 0 ? void 0 : target.location) || (modifier === null || modifier === void 0 ? void 0 : modifier.location),
        mode: (target === null || target === void 0 ? void 0 : target.mode) || (modifier === null || modifier === void 0 ? void 0 : modifier.mode),
        timing: (target === null || target === void 0 ? void 0 : target.timing) || (modifier === null || modifier === void 0 ? void 0 : modifier.timing),
        mime: (target === null || target === void 0 ? void 0 : target.mime) || (modifier === null || modifier === void 0 ? void 0 : modifier.mime)
    };
}
// Doesn't work on non-BMP characters, if that ever comes up
function capitalize(str) { return `${(str[0]).toUpperCase()}${str.substring(1)}`; }
const PLUGIN_NAME = "rollup-plugin-datafile";
function dataPlugin({ fileOptions, transformFilePath, fileTypes, useTopLevelAwait, exclude, include, helperFileName } = {}) {
    /** This is the virtual helper file whose functions decode base64 and Responses into Blobs and strings and such. */
    const DATA_HELPER_DECODE = `\0${helperFileName || "decode-asset"}.js`;
    const inlineHelpers = (helperFileName === null);
    let uniqueIdCounter = 0;
    const filter = createFilter(include, exclude);
    fileTypes || (fileTypes = {});
    // source files
    fileTypes[".css"] = mergeOptions(fileTypes[".css"], { mime: "text/css", mode: "text" });
    fileTypes[".json"] = mergeOptions(fileTypes[".json"], { mime: "text/json", mode: "json" });
    fileTypes[".html"] = mergeOptions(fileTypes[".html"], { mime: "text/html", mode: "text" });
    fileTypes[".js"] = mergeOptions(fileTypes[".js"], { mime: "text/javascript", mode: "text" });
    fileTypes[".mjs"] = mergeOptions(fileTypes[".mjs"], { mime: "text/javascript", mode: "text" });
    fileTypes[".svg"] = mergeOptions(fileTypes[".svg"], { mime: "image/svg+xml", mode: "text" });
    fileTypes[".csv"] = mergeOptions(fileTypes[".csv"], { mime: "text/csv", mode: "text" });
    fileTypes[".wasm"] = mergeOptions(fileTypes[".wasm"], { mime: "application/wasm", mode: "response" });
    // raster images
    fileTypes[".webp"] = mergeOptions(fileTypes[".webp"], { mime: "image/webp", mode: "blob" });
    fileTypes[".gif"] = mergeOptions(fileTypes[".gif"], { mime: "image/gif", mode: "blob" });
    fileTypes[".jpg"] = mergeOptions(fileTypes[".jpg"], { mime: "image/jpeg", mode: "blob" });
    fileTypes[".jpeg"] = mergeOptions(fileTypes[".jpeg"], { mime: "image/jpeg", mode: "blob" });
    fileTypes[".png"] = mergeOptions(fileTypes[".png"], { mime: "image/png", mode: "blob" });
    fileTypes[".ico"] = mergeOptions(fileTypes[".ico"], { mime: "image/vnd.microsoft.icon", mode: "blob" });
    // audio files
    fileTypes[".mp3"] = mergeOptions(fileTypes[".mp3"], { mime: "audio/mpeg", mode: "blob" });
    fileTypes[".mp4"] = mergeOptions(fileTypes[".mp4"], { mime: "audio/mp4", mode: "blob" });
    fileTypes[".mpeg"] = mergeOptions(fileTypes[".mpeg"], { mime: "audio/mpeg", mode: "blob" });
    fileTypes[".ogg"] = mergeOptions(fileTypes[".ogg"], { mime: "application/ogg", mode: "blob" });
    fileTypes[".webm"] = mergeOptions(fileTypes[".webm"], { mime: "audio/webm", mode: "blob" });
    // fonts
    fileTypes[".otf"] = mergeOptions(fileTypes[".otf"], { mime: "font/otf", mode: "blob" });
    fileTypes[".ttf"] = mergeOptions(fileTypes[".ttf"], { mime: "font/ttf", mode: "blob" });
    fileTypes[".woff"] = mergeOptions(fileTypes[".woff"], { mime: "font/woff", mode: "blob" });
    fileTypes[".woff2"] = mergeOptions(fileTypes[".woff2"], { mime: "font/woff2", mode: "blob" });
    // document types
    fileTypes[".txt"] = mergeOptions(fileTypes[".txt"], { mime: "text/plain", mode: "text" });
    fileTypes[".docx"] = mergeOptions(fileTypes[".docx"], { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", mode: "blob" });
    fileTypes[".xlsx"] = mergeOptions(fileTypes[".xlsx"], { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", mode: "blob" });
    fileTypes[".pptx"] = mergeOptions(fileTypes[".pptx"], { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", mode: "blob" });
    fileTypes[".doc"] = mergeOptions(fileTypes[".doc"], { mime: "application/msword", mode: "blob" });
    fileTypes[".xls"] = mergeOptions(fileTypes[".xls"], { mime: "application/vnd.ms-excel", mode: "blob" });
    fileTypes[".ppt"] = mergeOptions(fileTypes[".ppt"], { mime: "application/vnd.ms-powerpoint", mode: "blob" });
    fileTypes[".pdf"] = mergeOptions(fileTypes[".pdf"], { mime: "application/pdf", mode: "blob" });
    const filePathsToEmitIds = new Map();
    const promisesToWaitFor = new Set();
    let projectDir = process.cwd();
    let infoByImport = new Map();
    let infoByUid = new Map();
    return {
        name: PLUGIN_NAME,
        async resolveId(id, importer, { assertions }) {
            var _a;
            if (id == DATA_HELPER_DECODE)
                return id;
            if (id.startsWith(DATA_PREFIX) || (!!include && filter(id))) {
                const url = new URL(id);
                const searchParams = url.searchParams;
                let importerDir = importer ? dirname(importer) : projectDir;
                let inputFilePath = url.pathname.startsWith("~/") ? join(projectDir, url.pathname.substring(2)) :
                    url.pathname.startsWith("~") ? join(projectDir, url.pathname.substring(1)) :
                        isAbsolute(url.pathname) ? url.pathname :
                            join(importerDir, url.pathname);
                //if (!infoByImport.has(id)) {
                let outputDirectory = ".";
                let outputFilePath;
                let ext;
                {
                    const p = inputFilePath;
                    const bn = basename(p);
                    ext = extname(p);
                    const filename = bn.substring(0, bn.length - ext.length);
                    const hasher = createHash("sha256");
                    const pathRelativeToProject = relative(projectDir, p);
                    hasher.update(pathRelativeToProject);
                    const hash = hasher.digest("hex");
                    const o = { fileExtWithDot: ext, fileName: filename, hashPathRelative: hash, pathRelative: pathRelativeToProject };
                    if (transformFilePath)
                        outputFilePath = transformFilePath(o);
                    else
                        outputFilePath = getDefaultAssetPath(o);
                }
                let fileReferenceId;
                let { mode: defaultMode, location: defaultLocation, mime: defaultMime, timing: defaultTiming } = mergeOptions((fileOptions !== null && fileOptions !== void 0 ? fileOptions : (() => ({})))(inputFilePath), (_a = fileTypes === null || fileTypes === void 0 ? void 0 : fileTypes[ext]) !== null && _a !== void 0 ? _a : {});
                const { location: aLocation, mime: aMime, mode: aMode, timing: aTiming } = (assertions || {});
                const [qLocation, qMime, qMode, qTiming] = [searchParams.get("location"), searchParams.get("mime"), searchParams.get("mode"), searchParams.get("timing")];
                // Input validation, yay
                if (aLocation && qLocation && aLocation != qLocation)
                    throw new Error(`${importer} imported ${id}, but specified ${aLocation} via its import assertion.`);
                if (aMime && qMime && aMime != qMime)
                    throw new Error(`${importer} imported ${id}, but specified ${aMime} via its import assertion.`);
                if (aMode && qMode && aMode != qMode)
                    throw new Error(`${importer} imported ${id}, but specified ${aMode} via its import assertion.`);
                if (aTiming && qTiming && aTiming != qTiming)
                    throw new Error(`${importer} imported ${id}, but specified ${aTiming} via its import assertion.`);
                const location = qLocation || aLocation || defaultLocation || "inline";
                const mode = (qMode || aMode || defaultMode || "blob");
                const mime = (qMime || aMime || defaultMime || "application/octet-stream");
                const timing = (qTiming || aTiming || defaultTiming || "async");
                // Back to input validation...
                if (location != "asset" && location != "inline")
                    throw new Error(`${importer} imported ${id} with an unknown location specified: "${location}"`);
                if (mode != "blob" && mode != "array-buffer" && mode != "json" && mode != "text" && mode != "response")
                    throw new Error(`${importer} imported ${id} with an unknown mode specified: "${mode}"`);
                if (location == "asset") {
                    fileReferenceId = this.emitFile({ type: "asset", fileName: outputFilePath });
                    filePathsToEmitIds.set(outputFilePath, fileReferenceId);
                }
                let newInfo = {
                    outputFilePath: fileReferenceId ? this.getFileName(fileReferenceId) : outputFilePath,
                    mode: mode,
                    rawData: null,
                    uniqueId: uniqueIdCounter++,
                    inputFilePath,
                    outputDirectory,
                    fileReferenceId,
                    import: id,
                    location: location,
                    timing: timing,
                    mime,
                    dirty: true
                };
                infoByImport.set(newInfo.import, newInfo);
                infoByUid.set(newInfo.uniqueId, newInfo);
                //}
                return {
                    id: `${SELFISH_DATA_PREFIX}${infoByImport.get(id).uniqueId}`
                };
            }
        },
        async load(id) {
            if (id == DATA_HELPER_DECODE) {
                return decodeResponseHelperFile;
            }
            else if (id.startsWith(SELFISH_DATA_PREFIX)) {
                let info = infoByUid.get(+id.substring(SELFISH_DATA_PREFIX.length));
                let m = capitalize(info.mode);
                if (m == "Array-buffer")
                    m = "ArrayBuffer";
                if (info.location == "asset" && info.timing == "sync") {
                    return `
const url = ${JSON.stringify(normalizePath(relative(info.outputDirectory, info.outputFilePath)))};
export default url;`;
                }
                else if (info.location == "asset") {
                    return `
${inlineHelpers ? `${decodeResponseHelperFile}\n\n` : `import { decodeAsset${m} } from ${JSON.stringify(DATA_HELPER_DECODE)};`}
const data = ${useTopLevelAwait ? "await " : ""}decodeAsset${m}(fetch(${JSON.stringify(normalizePath(relative(info.outputDirectory, info.outputFilePath)))}));
export default data;`;
                }
                else {
                    return `
                    ${inlineHelpers ? `${decodeResponseHelperFile}\n\n` : `import { decodeInline${m} } from ${JSON.stringify(DATA_HELPER_DECODE)};`}
const data = ${useTopLevelAwait ? "await " : ""}decodeInline${m}(undefined/**@__AWAITING_DATAFILE_BASE64_${info.uniqueId}__**/);
export default data;`;
                }
            }
        },
        async buildEnd() {
            // If other plugins write files during buildEnd, wait for them to do so before reading what they've written.
            // TODO: There's gotta be a better way than asking those plugins to look for us and tell us what they're doing, right.
            await Promise.all([...promisesToWaitFor]);
            // Now read all of the files' data (they should all exist by now).
            await Promise.all([...infoByImport].map(async ([, info]) => { info.rawData = await readFile(info.inputFilePath); }));
            // Read all the files we've been emitting files for, and wait for all of them to finish in parallel.
            for (const [_id, info] of infoByImport) {
                if (info.location == "asset" && info.dirty) {
                    info.dirty = false;
                    this.setAssetSource(info.fileReferenceId, info.rawData);
                }
            }
        },
        async renderChunk(_code, _chunk, _options) {
            // We need to replace the temporary variables we set during load, but, like,
            // is this...the best way of doing this...?
            // I haven't found a better way to "replace" a variable's value after build,
            // and this works, but it's pretty sus.
            const s = new MagicString(_code);
            s.replaceAll(/undefined\/\*\*@__AWAITING_DATAFILE_BASE64_([0-9]+)__\*\*\//g, (_m, i) => {
                var _a;
                const uniqueId = +i;
                const info = infoByUid.get(uniqueId);
                if (!info)
                    return "undefined";
                const rawData = info.rawData;
                switch (info.mode) {
                    case "text":
                        // return the data, assume it's encoded in UTF-8 (TODO on that)
                        return JSON.stringify((_a = info.rawData) === null || _a === void 0 ? void 0 : _a.toString("utf-8"));
                    case "json":
                        // stringify then parse to make sure it's actually JSON, but not parsed from a string on the client at runtime
                        // (lots of unnecessary quotes in the result but a minifier'll clean those right out)
                        return info.rawData ? JSON.parse(JSON.stringify(info.rawData.toString("utf-8"))) : "undefined";
                    case "response":
                    case "array-buffer":
                    case "blob":
                        // encode the data as base64 in both cases.
                        // the virtual module decodes it into a Blob or ArrayBuffer as appropriate
                        const beforeSplit = rawData.toString("base64");
                        const splitSize = 1024; // Must be a multiple of 4, this is 1kb
                        let afterSplit = [];
                        for (let i = 0; i < beforeSplit.length; i += splitSize)
                            afterSplit.push(beforeSplit.substring(i, i + splitSize));
                        return `"data:${info.mime};base64,\\\n${afterSplit.join("\\\n")}"`;
                    default:
                        // why would you do this?
                        throw new Error(`Unknown mode for file "${info.inputFilePath}": ${info.mode}`);
                }
            });
            return {
                code: s.toString(),
                map: s.generateMap({ hires: true }), // ??? https://stackoverflow.com/questions/76186660/how-to-use-magicstring-to-provide-a-sourcemap-with-rollups-renderchunk-hook
            };
        },
        api: {
            promisesToWaitFor,
            filePathsToEmitIds
        }
    };
}
const Base64Regex = /.+:(.+?\/.+?)?(;base64)?,(.+)/;
// TODO: Make this not be a string, that's not awesome.
// Also TODO a couple of these are basically no-ops, which is lame.
const decodeResponseHelperFile = `

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

`;

export { dataPlugin, dataPlugin as default, getDefaultAssetPath, getDefaultAssetPathInfo };
//# sourceMappingURL=index.js.map
