import typescript from "@rollup/plugin-typescript";
import { readFileSync } from 'fs';
import { builtinModules } from 'module';

export default {
  ...createConfig({
    pkg: JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  }),
  input: 'src/index.ts'
};

function createConfig({ pkg, external = [] }) {
  return {
    input: 'src/index.ts',
    external: Object.keys(pkg.dependencies || {})
      .concat(Object.keys(pkg.peerDependencies || {}))
      .concat(builtinModules)
      .concat(external),
    onwarn: (warning) => {
      throw Object.assign(new Error(), warning);
    },
    strictDeprecations: true,
    output: [
      {
        format: 'cjs',
        file: pkg.main,
        exports: 'named',
        footer: 'module.exports = Object.assign(exports.default, exports);',
        sourcemap: true
      },
      {
        format: 'es',
        file: pkg.module,
        plugins: [emitModulePackageFile()],
        sourcemap: true
      }
    ],
    plugins: [typescript({ sourceMap: true })]
  };
}

function emitModulePackageFile() {
  return {
    name: 'emit-module-package-file',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'package.json',
        source: `{"type":"module"}`
      });
    }
  };
}