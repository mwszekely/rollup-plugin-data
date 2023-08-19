
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
                    ".css": { location: "inline" },
                    ".json": { location: "inline" },
                    ".txt": { location: "inline" },
                    ".webp": { location: "inline" },
                }
            })
        ]
    } satisfies RollupOptions;

    let rollupBuild = await rollup(opts);

    await rollupBuild.write(opts.output! as never).then(output => {
        console.log(output.output[0].code);
    })
})();
