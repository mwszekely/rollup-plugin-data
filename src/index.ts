import { FilterPattern, createFilter } from "@rollup/pluginutils";
import { createHash } from "crypto";
import { readFile } from "fs/promises";
import MagicString from "magic-string";
import { basename, dirname, extname, isAbsolute, join, relative } from "path";
import { InputPluginOption, SourceMapInput } from "rollup";

const DATA_PREFIX = "datafile:";

/** When we handle a datafile: id, ensure others don't handle it. The rest of the ID is stripped and replaced with a unique number. */
const SELFISH_DATA_PREFIX = "\0datafile:";




type FetchStoreMode = "asset" | "inline" | "url";
type FetchTypeMode = "json" | "array-buffer" | "text" | "blob" | "response";

interface DataPluginInfo {
    /** The original import path this asset was imported from (e.g. the string in `import data from "datafile:foo.png"`) */
    import: string;
    /** An internal number used to track imports */
    uniqueId: number;
    /** The original import where this file can be found, but normalized to a full path (e.g. "foo.png" in `import data from "datafile:foo.png"`, but as a full path) */
    inputFilePath: string;
    // Always available, extracted from options (TODO)
    outputDirectory: string;
    // Only if location is "asset".
    outputFilePath: string | null;

    rawData: Buffer | null;
    // Used in file-related operations
    fileReferenceId: string | undefined;

    /**
     * 
     * 
     * If inline, you get the value synchronously within the same chunk.
     * 
     * If asset, you get the value asynchronously via `fetch`
     * 
     */
    location: FetchStoreMode;

    /**
     * |Location|Mode|Result|
     * |----|----|------|
     * |Inline|`array-buffer`|Exports a decoded base-64 string|
     * |Inline|`blob`        |Exports a decoded base-64 string|
     * |Inline|`json`        |Exports JSON object|
     * |Inline|`text`        |Exports a string|
     * |Asset |`array-buffer`|Fetches a file, exports the response's array buffer|
     * |Asset |`blob`        |Fetches a file, exports the response's blob|
     * |Asset |`json`        |Fetches a file, exports the response's json|
     * |Asset |`text`        |Fetches a file, exports the response's text|
     * 
     */
    mode: FetchTypeMode;

    /** Only used for inline locations/modes */
    mime: string;
}


/**
 * The options that are available on a per-file (or per-extension) basis.
 */
export interface PerFileOptions extends Partial<Pick<DataPluginInfo, "location" | "mode" | "mime">> { }

export interface DataPluginOptions {

    /**
     * Files prefixed with `datafile:` will always be included, but this can be used to load files even if they don't.
     */
    include?: FilterPattern;

    /**
     * Excludes any files that were included by `include` (has no effect on `datafile:` ids)
     */
    exclude?: FilterPattern;

    /**
     * If true, the imports will be the values themselves (instead of promises).
     * 
     * Use with caution, be sure to check your bundle's output to make sure the promises execute in parallel.
     */
    useTopLevelAwait?: boolean;

    /** 
     * By default, all files are inlined in base64.
     * 
     * You can use this to cause files to be imported in other ways on a case-by-case basis.
     * 
     * For example, you can `fetch` and simply return a `Response`, or a `Blob`.
     */
    fileOptions?(fullPath: string): PerFileOptions;

    /**
     * Choose how files are handled on a per-extension basis.
     * 
     * Whatever's specified here can be overridden by `preciseFileOptions`, which operates on the entire file path instead of just the file's extension.
     * 
     * * `location`: Can be `"inline"`, to embed the data in the JS file (as base64 if necessary), or "asset", to be served separately.
     * * `mode`: What does the import return? Can be `"array-buffer"`, `"blob"`, `"json"`, or `"text"`.
     * * `mime`: `location: "inline"` and `mode: "base"` require a MIME type. Defaults to "application/octet-stream".
     */
    fileTypes: Record<`.${string}`, PerFileOptions>;

    /**
     * Given the full path of the imported asset, this must return a non-absolute non-relative path, like "assets/banner.png"
     * that will be relative to the output directory.
     * 
     * Default is the path relative to the importer, which may become weird if ".." paths are used and dumps everything in the output's root folder.
     */
    transformFilePath?(info: TransformFilePathInfo): string;

    /**
     * The name of the helper module, which becomes visible if multiple, separate chunks import files with this plugin. If you are bundling everything into one chunk, this does not matter in the slightest.
     * 
     * `.js` is appended automatically, and due to the way Rollup handles these modules a `_` will be prepended.
     * 
     * Pass `null` (not `undefined`) to instead inline everything, even if multiple helpers are imported. This doesn't have a significant increase on bundle size as the helpers are very small, but it's recommended to turn tree-shaking on in this case to omit unused helpers.
     * 
     * @default `"decode-asset"`
     */
    helperFileName?: string | null;
}

export interface TransformFilePathInfo {
    /** The full path from the root of your local disk */
    //pathFull: string;
    /** The path relative to the project root */
    pathRelative: string;
    /** The name of the file (without the extension) */
    fileName: string;
    /** The file's extension (including the period at the star) */
    fileExtWithDot: string;
    /** A string of the hash of `pathRelative` (not the file's contents, as it may not be available.) */
    hashPathRelative: string;
}

export function getDefaultAssetPathInfo(fullFilePath: string, projectRootDir: string): TransformFilePathInfo {

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

export function getDefaultAssetPath({ fileExtWithDot, fileName }: TransformFilePathInfo) {
    return `assets/${fileName}${fileExtWithDot}`;
}


function mergeOptions(target: PerFileOptions | null | undefined, modifier: PerFileOptions | null | undefined) {
    return {
        location: target?.location || modifier?.location,
        mode: target?.mode || modifier?.mode,
        mime: target?.mime || modifier?.mime
    }
}

// Doesn't work on non-BMP characters, if that ever comes up
function capitalize(str: string) { return `${(str[0]).toUpperCase()}${str.substring(1)}` }
const PLUGIN_NAME = "rollup-plugin-datafile"
export default function dataPlugin({ fileOptions, transformFilePath, fileTypes, useTopLevelAwait, exclude, include, helperFileName }: Partial<DataPluginOptions> = {}): InputPluginOption {

    /** This is the virtual helper file whose functions decode base64 and Responses into Blobs and strings and such. */
    const DATA_HELPER_DECODE = `\0${helperFileName || "decode-asset"}.js`;
    const inlineHelpers = (helperFileName === null);

    let uniqueIdCounter = 0;

    const filter = createFilter(include, exclude);
    fileTypes ||= {};

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

    const filePathsToEmitIds = new Map<string, string>();
    const promisesToWaitFor = new Set<Promise<void>>();
    let projectDir = process.cwd();
    let infoByImport = new Map<string, DataPluginInfo>();
    let infoByUid = new Map<number, DataPluginInfo>();
    return {
        name: PLUGIN_NAME,
        async resolveId(id, importer, { assertions }) {
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
                if (!infoByImport.has(id)) {
                    let outputDirectory = ".";
                    let outputFilePath: string;
                    let ext: string;
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
                    let fileReferenceId: string | undefined;

                    let { mode: defaultMode, location: defaultLocation, mime: defaultMime } = mergeOptions(fileTypes?.[ext as never] ?? {}, (fileOptions ?? ((): ReturnType<NonNullable<DataPluginOptions["fileOptions"]>> => ({})))(inputFilePath));

                    const { location: aLocation, mime: aMime, mode: aMode } = (assertions || {}) as PerFileOptions;
                    const [qLocation, qMime, qMode] = [searchParams.get("location") as DataPluginInfo["location"], searchParams.get("mime"), searchParams.get("mode") as DataPluginInfo["mode"]];

                    // Input validation, yay
                    if (aLocation && qLocation && aLocation != qLocation)
                        throw new Error(`${importer} imported ${id}, but specified ${aLocation} via its import assertion.`);
                    if (aMime && qMime && aMime != qMime)
                        throw new Error(`${importer} imported ${id}, but specified ${aMime} via its import assertion.`);
                    if (aMode && qMode && aMode != qMode)
                        throw new Error(`${importer} imported ${id}, but specified ${aMode} via its import assertion.`);

                    const location = qLocation || aLocation || defaultLocation || "inline";
                    const mode = (qMode || aMode || defaultMode || "blob");
                    const mime = (qMime || aMime || defaultMime || "application/octet-stream");

                    // Back to input validation...
                    if (location != "asset" && location != "inline" && location != "url")
                        throw new Error(`${importer} imported ${id} with an unknown location specified: "${location}"`);
                    if (mode != "blob" && mode != "array-buffer" && mode != "json" && mode != "text" && mode != "response")
                        throw new Error(`${importer} imported ${id} with an unknown mode specified: "${mode}"`);

                    if (location == "asset" || location == "url") {
                        fileReferenceId = this.emitFile({ type: "asset", fileName: outputFilePath });
                        filePathsToEmitIds.set(outputFilePath, fileReferenceId);
                    }

                    let newInfo: DataPluginInfo = {
                        outputFilePath: fileReferenceId ? this.getFileName(fileReferenceId) : outputFilePath,
                        mode,
                        rawData: null, // Wait to load this
                        uniqueId: uniqueIdCounter++,
                        inputFilePath,
                        outputDirectory,
                        fileReferenceId,
                        import: id,
                        location,
                        mime
                    }

                    infoByImport.set(newInfo.import, newInfo)
                    infoByUid.set(newInfo.uniqueId, newInfo);
                }
                return {
                    id: `${SELFISH_DATA_PREFIX}${infoByImport.get(id)!.uniqueId}`
                }
            }
        },
        async load(id) {
            if (id == DATA_HELPER_DECODE) {
                return decodeResponseHelperFile;
            }
            else if (id.startsWith(SELFISH_DATA_PREFIX)) {
                let info = infoByUid.get(+id.substring(SELFISH_DATA_PREFIX.length))!;

                let m = capitalize(info.mode);
                if (m == "Array-buffer")
                    m = "ArrayBuffer";

                if (info.location == "asset") {

                    return `
${inlineHelpers? `${decodeResponseHelperFile}\n\n` : `import { decodeAsset${m} } from ${JSON.stringify(DATA_HELPER_DECODE)};`}
const data = ${useTopLevelAwait ? "await " : ""}decodeAsset${m}(fetch(${JSON.stringify(relative(info.outputDirectory, info.outputFilePath!))}));
export default data;`
                }
                else if (info.location == "url") {
                    return `
const url = ${JSON.stringify(relative(info.outputDirectory, info.outputFilePath!))};
export default url;`
                }
                else {
                    return `
                    ${inlineHelpers? `${decodeResponseHelperFile}\n\n` : `import { decodeInline${m} } from ${JSON.stringify(DATA_HELPER_DECODE)};`}
const data = ${useTopLevelAwait ? "await " : ""}decodeInline${m}(undefined/**@__AWAITING_DATAFILE_BASE64_${info.uniqueId}__**/);
export default data;`
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
                if (info.location == "asset" || info.location == "url") {
                    this.setAssetSource(info.fileReferenceId!, info.rawData!);
                }
            }


        },
        async renderChunk(_code, _chunk, _options): Promise<{ code: string; map?: SourceMapInput }> {

            // We need to replace the temporary variables we set during load, but, like,
            // is this...the best way of doing this...?
            // I haven't found a better way to "replace" a variable's value after build,
            // and this works, but it's pretty sus.
            const s = new MagicString(_code);
            s.replaceAll(/undefined\/\*\*@__AWAITING_DATAFILE_BASE64_([0-9]+)__\*\*\//g, (_m, i): string => {
                const uniqueId = +i;
                const info = infoByUid.get(uniqueId);
                if (!info)
                    return "undefined";
                const rawData = info.rawData!;
                switch (info.mode) {
                    case "text":
                        // return the data, assume it's encoded in UTF-8 (TODO on that)
                        return JSON.stringify(info.rawData?.toString("utf-8"));
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
                        const splitSize = 1024;  // Must be a multiple of 4, this is 1kb
                        let afterSplit: string[] = [];
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
                map: s.generateMap({ hires: true }) as SourceMapInput, // ??? https://stackoverflow.com/questions/76186660/how-to-use-magicstring-to-provide-a-sourcemap-with-rollups-renderchunk-hook
            }
        },
        api: {
            promisesToWaitFor,
            filePathsToEmitIds
        }
    }
}

export { dataPlugin };

// TODO: Make this not be a string, that's not awesome.
// Also TODO a couple of these are basically no-ops, which is lame.
const decodeResponseHelperFile = `

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

`