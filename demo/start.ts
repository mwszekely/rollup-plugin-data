
import { RollupOptions, rollup } from "rollup";
import dataPlugin from "../dist/es/index.js";

(async () => {

    const opts = {
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
    } satisfies RollupOptions;

    let rollupBuild = await rollup(opts);

    await rollupBuild.write(opts.output! as never).then(output => {
        console.log(output.output[0].code);
    })
})();
