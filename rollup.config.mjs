import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { builtinModules } from "node:module";
import { defineConfig } from "rollup";

const plugins = () => [
  commonjs(),
  nodeResolve({
    exportConditions: ["node"],
  }),
  typescript({
    tsconfig: "./tsconfig.build.json",
  }),
  terser(),
];

export default defineConfig([
  {
    input: "src/plugin.ts",
    output: {
      file: "dev.so1omon.sandalphon.sdPlugin/bin/plugin.js",
      format: "esm",
      sourcemap: true,
    },
    plugins: plugins(),
  },
  {
    input: "src/desktopCompanionMain.ts",
    output: {
      file: "dist/desktop-companion.mjs",
      format: "esm",
      sourcemap: true,
    },
    external: [
      ...builtinModules,
      ...builtinModules.map((name) => `node:${name}`),
    ],
    plugins: plugins(),
  },
]);
