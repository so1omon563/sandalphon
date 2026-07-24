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
  resolve(repositoryRoot, "artwork/generated/action"),
];

const stateOutputs = language.stateOrder.flatMap((stateName) => {
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
const actionOutputs = language.actionIconOrder.map((iconName) => {
  const icon = language.actionIcons[iconName];
  if (!icon) throw new Error(`Missing action icon: ${iconName}`);
  return {
    path: resolve(repositoryRoot, `artwork/generated/action/${iconName}.svg`),
    content: renderActionKey(iconName, icon),
  };
});
const pluginActionOutputs = [
  {
    path: resolve(
      repositoryRoot,
      "dev.so1omon.sandalphon.sdPlugin/imgs/actions/composable-status.svg",
    ),
    content: renderActionKey("session", language.actionIcons.session),
  },
  ...[
    ["composable-resume", "resume"],
    ["composable-review", "review"],
    ["composable-attention", "attention"],
    ["composable-session-dial", "roster"],
  ].map(([fileName, iconName]) => ({
    path: resolve(
      repositoryRoot,
      `dev.so1omon.sandalphon.sdPlugin/imgs/actions/${fileName}.svg`,
    ),
    content: renderActionKey(iconName, language.actionIcons[iconName]),
  })),
];
const outputs = [...stateOutputs, ...actionOutputs, ...pluginActionOutputs];

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

function renderActionKey(iconName, icon) {
  const { colors, geometry, typography } = language;
  const { width, height, cornerRadius } = geometry.key;
  return `${svgOpen(width, height, `${icon.label} key action`)}
  <rect width="${width}" height="${height}" rx="${cornerRadius}" fill="${colors.canvas}" />
  <rect x="8" y="8" width="128" height="128" rx="14" fill="${colors.surface}" />
  <rect x="8" y="8" width="8" height="128" rx="4" fill="${icon.accent}" />
  ${renderActionGlyph(icon.glyph, icon.accent, geometry)}
  <text x="72" y="116" fill="${colors.text}" font-family="${typography.family}" font-size="${typography.key.size}" font-weight="${typography.key.weight}" text-anchor="middle">${icon.label}</text>
  <metadata>action=${iconName}; source=artwork/visual-language.json; license=MIT</metadata>
</svg>
`;
}

function renderActionGlyph(glyph, color, geometry) {
  const stroke = `fill="none" stroke="${color}" stroke-width="${geometry.strokeWidth}" stroke-linecap="${geometry.lineCap}" stroke-linejoin="${geometry.lineJoin}"`;
  const paths = {
    session:
      '<rect x="49" y="32" width="46" height="42" rx="5" /><path d="M58 44h28M58 55h22M58 66h16" />',
    resume: '<path d="M58 34l30 19-30 19z" />',
    inspect: '<circle cx="67" cy="49" r="17" /><path d="M80 62l15 15" />',
    details: '<path d="M57 38h30M57 53h30M57 68h22" />',
    exit: '<path d="M54 31h23v44H54M68 53h28M86 43l10 10-10 10" />',
    attention: '<path d="M54 65h36l-6-9V45a12 12 0 0 0-24 0v11zM68 74h8" />',
    review:
      '<path d="M47 53s10-17 25-17 25 17 25 17-10 17-25 17-25-17-25-17z" /><circle cx="72" cy="53" r="7" />',
    reasoning:
      '<circle cx="54" cy="39" r="6" /><circle cx="90" cy="39" r="6" /><circle cx="72" cy="69" r="6" /><path d="M60 42l9 20M84 42l-9 20" />',
    retry: '<path d="M91 44a22 22 0 1 0 1 20M91 44V29M91 44H76" />',
    cancel: '<rect x="53" y="34" width="38" height="38" rx="4" />',
    back: '<path d="M93 53H51M64 38L49 53l15 15" />',
    home: '<path d="M49 52l23-20 23 20M56 48v25h32V48" />',
    previous: '<path d="M82 34L63 53l19 19" />',
    next: '<path d="M62 34l19 19-19 19" />',
    roster:
      '<rect x="50" y="32" width="17" height="17" rx="2" /><rect x="77" y="32" width="17" height="17" rx="2" /><rect x="50" y="59" width="17" height="17" rx="2" /><rect x="77" y="59" width="17" height="17" rx="2" />',
    actions:
      '<path d="M53 37h38M53 53h38M53 69h38" /><circle cx="47" cy="37" r="2" /><circle cx="47" cy="53" r="2" /><circle cx="47" cy="69" r="2" />',
    apply: '<path d="M49 53l14 15 31-34" />',
    approve: '<path d="M49 53l14 15 31-34" />',
    reject: '<path d="M55 36l34 34M89 36L55 70" />',
    offline: '<circle cx="72" cy="53" r="22" /><path d="M57 68l30-30" />',
  };
  const path = paths[glyph];
  if (!path) throw new Error(`Unknown action glyph: ${glyph}`);
  return `<g ${stroke}>${path}</g>`;
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
