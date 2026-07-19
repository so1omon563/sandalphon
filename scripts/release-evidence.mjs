import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactRelativePath = "dist/dev.so1omon.sandalphon.streamDeckPlugin";
const evidenceRelativePath = "dist/release-evidence.json";
const manifestRelativePath = "dev.so1omon.sandalphon.sdPlugin/manifest.json";

const artifact = await readFile(resolve(repositoryRoot, artifactRelativePath));
const manifest = JSON.parse(
  await readFile(resolve(repositoryRoot, manifestRelativePath), "utf8"),
);
const { stdout: commitOutput } = await execFileAsync(
  "git",
  ["rev-parse", "HEAD"],
  { cwd: repositoryRoot, encoding: "utf8" },
);
const { stdout: tagOutput } = await execFileAsync(
  "git",
  ["tag", "--points-at", "HEAD"],
  { cwd: repositoryRoot, encoding: "utf8" },
);
const { stdout: statusOutput } = await execFileAsync(
  "git",
  ["status", "--porcelain"],
  { cwd: repositoryRoot, encoding: "utf8" },
);
const tags = tagOutput
  .split("\n")
  .map((tag) => tag.trim())
  .filter(Boolean);
const version = /^(\d+\.\d+\.\d+)\.\d+$/u.exec(manifest.Version);

if (!version?.[1]) {
  throw new Error("Stream Deck manifest version must have four components");
}

const expectedTag = `v${version[1]}`;

const evidence = {
  schemaVersion: 1,
  source: {
    commit: commitOutput.trim(),
    tags,
    clean: statusOutput.trim().length === 0,
  },
  plugin: {
    uuid: manifest.UUID,
    name: manifest.Name,
    version: manifest.Version,
    expectedTag,
    tagMatchesVersion: tags.includes(expectedTag),
  },
  requirements: {
    macOS: manifest.OS.find(({ Platform }) => Platform === "mac")
      ?.MinimumVersion,
    node: manifest.Nodejs?.Version,
    streamDeck: manifest.Software?.MinimumVersion,
  },
  artifact: {
    path: artifactRelativePath,
    bytes: artifact.byteLength,
    sha256: createHash("sha256").update(artifact).digest("hex"),
  },
};

const output = `${JSON.stringify(evidence, null, 2)}\n`;
await writeFile(resolve(repositoryRoot, evidenceRelativePath), output);
process.stdout.write(output);
