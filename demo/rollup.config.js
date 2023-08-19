
import datafile from "../dist/es/index.js"


/** @type {import('rollup').RollupOptions} */
export default {
    input: "./src/index.ts",
    output: {
        dir: "./dist"
    },
    plugins: [datafile()]
}
