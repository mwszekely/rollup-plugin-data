/// <reference types="node" />
import { FilterPattern } from "@rollup/pluginutils";
import { InputPluginOption } from "rollup";
type FetchStoreMode = "asset" | "inline" | "url";
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
export interface PerFileOptions extends Partial<Pick<DataPluginInfo, "location" | "mode" | "mime">> {
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
export default function dataPlugin({ fileOptions, transformFilePath, fileTypes, useTopLevelAwait, exclude, include }?: Partial<DataPluginOptions>): InputPluginOption;
export { dataPlugin };
