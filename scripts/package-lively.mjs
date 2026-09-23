import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(projectRoot, 'dist', 'lively');
const outputFile = path.join(projectRoot, 'dist', 'Vibe-Neon-Rain-Lively.zip');

for (const requiredFile of ['index.html', 'LivelyInfo.json']) {
  const filePath = path.join(packageRoot, requiredFile);
  if (!(await stat(filePath).catch(() => null))) {
    throw new Error(`Lively build output is missing ${filePath}. Run npm run build:lively first.`);
  }
}

const metadata = JSON.parse(await readFile(path.join(packageRoot, 'LivelyInfo.json'), 'utf8'));
if (metadata.Type !== 1 || metadata.FileName !== 'index.html' || !metadata.Arguments?.includes('--audio')) {
  throw new Error('LivelyInfo.json must describe a webpage wallpaper and request --audio.');
}

const indexHtml = await readFile(path.join(packageRoot, 'index.html'), 'utf8');
if (!/<base href=["']\.\/["']>/.test(indexHtml)) {
  throw new Error('The Lively build must use a relative base href for local assets.');
}
for (const [, reference] of indexHtml.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  if (/^(?:[a-z]+:|#|\/\/)/i.test(reference) || reference.endsWith('/')) continue;
  const assetPath = path.resolve(packageRoot, decodeURIComponent(reference));
  if (!assetPath.startsWith(`${packageRoot}${path.sep}`) || !(await stat(assetPath).catch(() => null))) {
    throw new Error(`The Lively index references a missing or out-of-package asset: ${reference}`);
  }
}

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  crcTable[index] = value >>> 0;
}

const crc32 = (data) => {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const toDosDateTime = (date) => ({
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
});

const files = [];
const collectFiles = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectFiles(absolutePath);
    else if (entry.isFile()) files.push(absolutePath);
  }
};
await collectFiles(packageRoot);
files.sort((left, right) => left.localeCompare(right));

const localParts = [];
const centralParts = [];
let offset = 0;
const stamp = toDosDateTime(new Date());

for (const absolutePath of files) {
  const name = path.relative(packageRoot, absolutePath).split(path.sep).join('/');
  const nameBytes = Buffer.from(name, 'utf8');
  const data = await readFile(absolutePath);
  const checksum = crc32(data);

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x0800, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(stamp.time, 10);
  localHeader.writeUInt16LE(stamp.date, 12);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(data.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(nameBytes.length, 26);
  localHeader.writeUInt16LE(0, 28);
  localParts.push(localHeader, nameBytes, data);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x0800, 8);
  centralHeader.writeUInt16LE(0, 10);
  centralHeader.writeUInt16LE(stamp.time, 12);
  centralHeader.writeUInt16LE(stamp.date, 14);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(data.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(nameBytes.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(offset, 42);
  centralParts.push(centralHeader, nameBytes);
  offset += localHeader.length + nameBytes.length + data.length;
}

const centralDirectory = Buffer.concat(centralParts);
const endRecord = Buffer.alloc(22);
endRecord.writeUInt32LE(0x06054b50, 0);
endRecord.writeUInt16LE(0, 4);
endRecord.writeUInt16LE(0, 6);
endRecord.writeUInt16LE(files.length, 8);
endRecord.writeUInt16LE(files.length, 10);
endRecord.writeUInt32LE(centralDirectory.length, 12);
endRecord.writeUInt32LE(offset, 16);
endRecord.writeUInt16LE(0, 20);

await writeFile(outputFile, Buffer.concat([...localParts, centralDirectory, endRecord]));
console.log(`Created ${path.relative(projectRoot, outputFile)} (${files.length} files).`);
