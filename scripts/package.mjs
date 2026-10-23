import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const files = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "next-env.d.ts",
  "next.config.ts",
  "eslint.config.mjs",
  "vitest.config.ts",
  "playwright.config.ts",
  ".env.example",
  ".gitignore",
  "README.md",
  "docs/api.md",
  "docs/homologacao.md",
  "docs/manual-instalacao.md",
  "docs/marketplace.md",
  "docs/pitch.md",
  "docs/seguranca.md",
];
function collect(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.isFile()) files.push(path.replaceAll("\\", "/"));
  }
}
for (const directory of ["src", "scripts", "public", "tests"])
  collect(directory);
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const value of data) crc = table[(crc ^ value) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
const local = [],
  central = [];
let offset = 0,
  count = 0;
for (const path of files.filter(existsSync).sort()) {
  const name = Buffer.from(path, "utf8"),
    data = readFileSync(path),
    crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0x21, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  const directory = Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50);
  directory.writeUInt16LE(20, 4);
  directory.writeUInt16LE(20, 6);
  directory.writeUInt16LE(0x0800, 8);
  directory.writeUInt16LE(0x21, 14);
  directory.writeUInt32LE(crc, 16);
  directory.writeUInt32LE(data.length, 20);
  directory.writeUInt32LE(data.length, 24);
  directory.writeUInt16LE(name.length, 28);
  directory.writeUInt32LE(offset, 42);
  local.push(header, name, data);
  central.push(directory, name);
  offset += header.length + name.length + data.length;
  count++;
}
const centralBytes = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(count, 8);
end.writeUInt16LE(count, 10);
end.writeUInt32LE(centralBytes.length, 12);
end.writeUInt32LE(offset, 16);
const archive = Buffer.concat([...local, centralBytes, end]);
mkdirSync("output", { recursive: true });
writeFileSync("output/nexo-onnira.zip", archive);
writeFileSync(
  "output/nexo-onnira.sha256",
  `${createHash("sha256").update(archive).digest("hex")}  nexo-onnira.zip\n`,
);
console.info(
  `Pacote gerado: output/nexo-onnira.zip (${count} arquivos, ${(archive.length / 1024).toFixed(0)} KB). Credenciais, banco e dependências não incluídos.`,
);
