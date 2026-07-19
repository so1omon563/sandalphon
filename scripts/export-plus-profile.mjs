import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const PROFILE_DIRECTORY = "C03BF9C4-E06D-4112-BB15-64CDF70A8359.sdProfile";
const PAGE_ID = "b0632d8a-5e9d-4e22-90cf-0937b39295f9";
const PROFILE_PAGE_DIRECTORY = "X921SZ848156VW5P1WGX7UXDAJ8";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../dev.so1omon.sandalphon.sdPlugin/profiles/Sandalphon Plus.streamDeckProfile",
);
const CLASSIC15_PROFILE_DIRECTORY =
  "7C65D87C-68CB-4F42-82C6-109E6A5DF372.sdProfile";
const CLASSIC15_OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../dev.so1omon.sandalphon.sdPlugin/profiles/Sandalphon Classic 15.streamDeckProfile",
);

const profileManifest = {
  Device: {
    Model: "20GBD9901",
    UUID: "",
  },
  InstalledByPluginUUID: "dev.so1omon.sandalphon",
  Name: "Sandalphon Plus",
  Pages: {
    Current: PAGE_ID,
    Pages: [PAGE_ID],
  },
  PreconfiguredName: "Sandalphon Plus",
  Version: "2.0",
};

function profileAction(name, uuid) {
  return {
    Name: name,
    Settings: {},
    State: 0,
    States: [
      {
        FontSize: 9,
        FontUnderline: false,
        Image: "",
        ShowTitle: false,
        Title: "",
        TitleAlignment: "bottom",
        TitleColor: "#ffffff",
      },
    ],
    UUID: uuid,
  };
}

const keyActions = Object.fromEntries(
  ["0,0", "1,0", "2,0", "3,0", "0,1", "1,1", "2,1", "3,1"].map((position) => [
    position,
    profileAction("Managed Plus Key", "dev.so1omon.sandalphon.managed-plus"),
  ]),
);

const encoderActions = Object.fromEntries(
  ["0,0", "1,0", "2,0", "3,0"].map((position) => [
    position,
    profileAction(
      "Managed Plus Encoder",
      "dev.so1omon.sandalphon.managed-plus-encoder",
    ),
  ]),
);

const pageManifest = {
  Controllers: [
    {
      Actions: keyActions,
      Type: "Keypad",
    },
    {
      Actions: encoderActions,
      Type: "Encoder",
    },
  ],
};

const entries = [
  {
    directory: true,
    name: `${PROFILE_DIRECTORY}\\`,
    value: "",
  },
  {
    name: `${PROFILE_DIRECTORY}\\manifest.json`,
    value: JSON.stringify(profileManifest),
  },
  {
    directory: true,
    name: `${PROFILE_DIRECTORY}\\Profiles\\`,
    value: "",
  },
  {
    directory: true,
    name: `${PROFILE_DIRECTORY}\\Profiles\\${PROFILE_PAGE_DIRECTORY}\\`,
    value: "",
  },
  {
    directory: true,
    name: `${PROFILE_DIRECTORY}\\Profiles\\${PROFILE_PAGE_DIRECTORY}\\Images\\`,
    value: "",
  },
  {
    name: `${PROFILE_DIRECTORY}\\Profiles\\${PROFILE_PAGE_DIRECTORY}\\manifest.json`,
    value: JSON.stringify(pageManifest),
  },
];

const classic15Actions = Object.fromEntries(
  Array.from({ length: 15 }, (_, index) => {
    const position = `${index % 5},${Math.floor(index / 5)}`;
    return [
      position,
      profileAction(
        "Managed Classic 15 Key",
        "dev.so1omon.sandalphon.managed-classic15",
      ),
    ];
  }),
);

const classic15Manifest = {
  Actions: classic15Actions,
  DeviceModel: "20GBA9901",
  Name: "Sandalphon Classic 15",
  Version: "1.0",
};

const classic15Entries = [
  {
    directory: true,
    name: `${CLASSIC15_PROFILE_DIRECTORY}/`,
    value: "",
  },
  {
    name: `${CLASSIC15_PROFILE_DIRECTORY}/manifest.json`,
    value: JSON.stringify(classic15Manifest),
  },
];

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.from(file.value, "utf8");
    const compressed = file.directory
      ? Buffer.from([0x01, 0x00, 0x00, 0xff, 0xff])
      : deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x08, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(33, 12);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(0, 18);
    localHeader.writeUInt32LE(0, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(compressed.length, 8);
    descriptor.writeUInt32LE(data.length, 12);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x08, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(33, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, name, compressed, descriptor);
    centralParts.push(centralHeader, name);
    offset +=
      localHeader.length + name.length + compressed.length + descriptor.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

const outputs = [
  { path: OUTPUT_PATH, expected: createZip(entries), name: "Stream Deck +" },
  {
    path: CLASSIC15_OUTPUT_PATH,
    expected: createZip(classic15Entries),
    name: "Stream Deck Classic 15",
  },
];

if (process.argv.includes("--check")) {
  for (const output of outputs) {
    const current = await readFile(output.path).catch(() => undefined);
    if (current === undefined || !current.equals(output.expected)) {
      console.error(
        `Bundled ${output.name} profile is stale; run npm run profile:generate.`,
      );
      process.exitCode = 1;
    }
  }
} else {
  for (const output of outputs) {
    await mkdir(dirname(output.path), { recursive: true });
    await writeFile(output.path, output.expected);
  }
}
