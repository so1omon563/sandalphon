import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { defineConfig } from "rollup";

export default defineConfig({
  input: "src/plugin.ts",
  output: {
    file: "dev.so1omon.sandalphon.sdPlugin/bin/plugin.js",
    format: "esm",
    sourcemap: true,
  },
  plugins: [
    commonjs(),
    nodeResolve({
      exportConditions: ["node"],
    }),
    typescript({
      tsconfig: "./tsconfig.build.json",
    }),
    terser(),
  ],
});
