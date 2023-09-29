

import dataPlugin from "../dist/es/index.js";

/** @type {import('rollup').RollupOptions} */
export default {
    input: "./src/index.js",
    output: {
        sourcemap: true,
        file: "./dist/index.js",
        format: "esm"
    },
    plugins: [
        dataPlugin({
            fileTypes: {
                ".css": { location: "inline", timing: "async" },
                ".json": { location: "inline", timing: "async" },
                ".txt": { location: "inline", timing: "async" },
                ".webp": { location: "inline", timing: "async" },
            }
        })
    ]
}
