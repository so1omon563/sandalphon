import { readFile, mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const languagePath = resolve(repositoryRoot, "artwork/visual-language.json");
const language = JSON.parse(await readFile(languagePath, "utf8"));
const checkOnly = process.argv.includes("--check");
const generatedRoots = [
  resolve(repositoryRoot, "artwork/generated/key"),
  resolve(repositoryRoot, "artwork/generated/touch"),
];

const outputs = language.stateOrder.flatMap((stateName) => {
  const state = language.states[stateName];
  if (!state) throw new Error(`Missing visual state: ${stateName}`);
  return [
    {
      path: resolve(repositoryRoot, `artwork/generated/key/${stateName}.svg`),
      content: renderKey(stateName, state),
    },
    {
      path: resolve(repositoryRoot, `artwork/generated/touch/${stateName}.svg`),
      content: renderTouch(stateName, state),
    },
  ];
});

const stale = [];
const expectedPaths = new Set(outputs.map(({ path }) => path));
for (const root of generatedRoots) {
  for (const entry of await directoryEntries(root)) {
    const path = resolve(root, entry.name);
    if (expectedPaths.has(path)) continue;
    if (checkOnly || !entry.isFile()) {
      stale.push(relativePath(path));
    } else {
      await unlink(path);
    }
  }
}

for (const output of outputs) {
  if (checkOnly) {
    let current;
    try {
      current = await readFile(output.path, "utf8");
    } catch {
      stale.push(relativePath(output.path));
      continue;
    }
    if (current !== output.content) stale.push(relativePath(output.path));
    continue;
  }
  await mkdir(dirname(output.path), { recursive: true });
  await writeFile(output.path, output.content, "utf8");
}

if (stale.length > 0) {
  throw new Error(
    `Generated visual assets are stale:\n${stale.map((path) => `- ${path}`).join("\n")}\nRun npm run assets:generate.`,
  );
}

if (!checkOnly) {
  console.log(`Generated ${outputs.length} visual assets.`);
}

function renderKey(stateName, state) {
  const { colors, geometry, typography } = language;
  const { width, height, cornerRadius } = geometry.key;
  return `${svgOpen(width, height, `${state.label} key status`)}
  <rect width="${width}" height="${height}" rx="${cornerRadius}" fill="${colors.canvas}" />
  <rect x="8" y="8" width="128" height="128" rx="14" fill="${colors.surface}" />
  <rect x="8" y="8" width="8" height="128" rx="4" fill="${state.accent}" />
  ${renderGlyph(state.glyph, state.accent, 72, 53, 1, geometry)}
  <text x="72" y="116" fill="${colors.text}" font-family="${typography.family}" font-size="${typography.key.size}" font-weight="${typography.key.weight}" text-anchor="middle">${state.label}</text>
  <metadata>state=${stateName}; source=artwork/visual-language.json; license=MIT</metadata>
</svg>
`;
}

function renderTouch(stateName, state) {
  const { colors, geometry, typography } = language;
  const { width, height, cornerRadius } = geometry.touchQuarter;
  return `${svgOpen(width, height, `${state.label} touch-strip status`)}
  <rect width="${width}" height="${height}" rx="${cornerRadius}" fill="${colors.canvas}" />
  <rect x="6" y="6" width="188" height="88" rx="9" fill="${colors.surface}" />
  ${renderGlyph(state.glyph, state.accent, 35, 48, 0.72, geometry)}
  <text x="68" y="44" fill="${colors.text}" font-family="${typography.family}" font-size="${typography.touch.titleSize}" font-weight="${typography.touch.weight}">${state.label}</text>
  <text x="68" y="66" fill="${colors.mutedText}" font-family="${typography.family}" font-size="${typography.touch.detailSize}" font-weight="500">Agent state</text>
  <rect x="12" y="84" width="176" height="4" rx="2" fill="${state.accent}" />
  <metadata>state=${stateName}; source=artwork/visual-language.json; license=MIT</metadata>
</svg>
`;
}

function renderGlyph(glyph, color, x, y, scale, geometry) {
  const transform = `translate(${x} ${y}) scale(${scale})`;
  const stroke = `fill="none" stroke="${color}" stroke-width="${geometry.strokeWidth}" stroke-linecap="${geometry.lineCap}" stroke-linejoin="${geometry.lineJoin}"`;
  switch (glyph) {
    case "rest":
      return `<g transform="${transform}" ${stroke}><circle r="18" /><path d="M-9 0h18" /></g>`;
    case "flow":
      return `<g transform="${transform}" ${stroke}><path d="M-24 -10h32l-9 -9M24 10h-32l9 9" /></g>`;
    case "pause":
      return `<g transform="${transform}" ${stroke}><path d="M-10 -19v38M10 -19v38" /></g>`;
    case "check":
      return `<g transform="${transform}" ${stroke}><path d="M-23 0l14 15 31 -34" /></g>`;
    case "cross":
      return `<g transform="${transform}" ${stroke}><path d="M-17 -17l34 34M17 -17l-34 34" /></g>`;
    case "blocked":
      return `<g transform="${transform}" ${stroke}><circle r="22" /><path d="M-15 15l30 -30" /></g>`;
    default:
      throw new Error(`Unknown glyph: ${glyph}`);
  }
}

function svgOpen(width, height, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">`;
}

function relativePath(path) {
  return path.slice(repositoryRoot.length + 1);
}

async function directoryEntries(path) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}
