/// <reference types="node" />
import { FilterPattern } from "@rollup/pluginutils";
import { InputPluginOption } from "rollup";
type FetchLocation = "inline" | "asset";
type FetchMethod = "sync" | "async";
type FetchTypeMode = "json" | "array-buffer" | "text" | "blob" | "response";
interface DataPluginInfo {
    /** The original import path this asset was imported from (e.g. the string in `import data from "datafile:foo.png"`) */
    import: string;
    /** An internal number used to track imports */
    uniqueId: number;
    /** The original import where this file can be found, but normalized to a full path (e.g. "foo.png" in `import data from "datafile:foo.png"`, but as a full path) */
    inputFilePath: string;
    outputDirectory: string;
    outputFilePath: string | null;
    rawData: Buffer | null;
    fileReferenceId: string | undefined;
    /**
     * Controls whether you get your file data synchronously or asynchronously, and by extension whether `fetch` is used to decode off the main thread.
     *
     * As there is no way to get an external file synchronously, when `location` is `"asset"`, the relative URL of the asset is imported instead of the contents of the file itself:
     *
     * |Location|Timing|Where is the data?|What does the `import` get me?|More|
     * |--------|------|-|-|-----------|
     * |`inline`|`sync`|Embedded in the bundle|The file as a `Blob`, `JSON`, etc.|Decoding base64 is done on the main thread, which isn't the most efficient use of resources most of the time. But if you're already in a `Worker` this is often fine.|
     * |`inline`|`async`|Embedded in the bundle|A promise to the file as a `Blob`, `JSON`, etc.|`fetch` is used to decode the Base64 off the main thread, but you must `await` the promise to get your import at some point.|
     * |`asset`|`sync`|Emitted as a separate file|The URL to the file|The asset is saved as a separate file. When importing, you're given the relative URL as a `string` to use in `<img>`s and so forth.|
     * |`asset`|`async`|Emitted as a separate file|A promise to the file as a `Blob`, `JSON`, etc.|The asset is saved as a separate file. When importing, you're given the file itself as a `Blob` or a `JSON` or whatever.|
     *
     *
     */
    timing: FetchMethod;
    /**
     * Controls where the data is stored -- either embedded directly within the bundle's JS (`"inline"`), or emitted as a separate file in the build directory (`"asset"`).
     *
     * This has an effect on what the `import` statement returns, and whether the decoding timing is sync or async:
     *
     * |Location|Timing|Where is the data?|What does the `import` get me?|More|
     * |--------|------|-|-|-----------|
     * |`inline`|`sync`|Embedded in the bundle|The file as a `Blob`, `JSON`, etc.|Decoding base64 is done on the main thread, which isn't the most efficient use of resources most of the time. But if you're already in a `Worker` this is often fine.|
     * |`inline`|`async`|Embedded in the bundle|A promise to the file as a `Blob`, `JSON`, etc.|`fetch` is used to decode the Base64 off the main thread, but you must `await` the promise to get your import at some point.|
     * |`asset`|`sync`|Emitted as a separate file|The URL to the file|The asset is saved as a separate file. When importing, you're given the relative URL as a `string` to use in `<img>`s and so forth.|
     * |`asset`|`async`|Emitted as a separate file|A promise to the file as a `Blob`, `JSON`, etc.|The asset is saved as a separate file. When importing, you're given the file itself as a `Blob` or a `JSON` or whatever.|
     *
     *
     *
     */
    location: FetchLocation;
    /**
     * Controls what is returned from the `import` statement. Can be one of:
     *
     * * `array-buffer`: Returns an `ArrayBuffer`
     * * `blob`: Returns a `Blob`
     * * `json`: Returns an object/array
     * * `text`: Returns a `string`
     * * `response`: Returns the raw `Response` from `fetch`
     *
     * Note that this is not used if `location` is `"asset"` *and* `timing` is `"sync"`.
     */
    mode: FetchTypeMode;
    /** Only used when `location` is `"inline"`. */
    mime: string;
}
/**
 * The options that are available on a per-file (or per-extension) basis.
 */
export interface PerFileOptions extends Partial<Pick<DataPluginInfo, "location" | "mode" | "timing" | "mime">> {
}
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
    /** The path relative to the project root */
    pathRelative: string;
    /** The name of the file (without the extension) */
    fileName: string;
    /** The file's extension (including the period at the star) */
    fileExtWithDot: string;
    /** A string of the hash of `pathRelative` (not the file's contents, as it may not be available.) */
    hashPathRelative: string;
}
export declare function getDefaultAssetPathInfo(fullFilePath: string, projectRootDir: string): TransformFilePathInfo;
export declare function getDefaultAssetPath({ fileExtWithDot, fileName }: TransformFilePathInfo): string;
export default function dataPlugin({ fileOptions, transformFilePath, fileTypes, useTopLevelAwait, exclude, include, helperFileName }?: Partial<DataPluginOptions>): InputPluginOption;
export { dataPlugin };
