// CRC-32 (IEEE), shared by the PNG and zip writers.
let table = null;
export function crc32(bytes, crc = 0) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  crc = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  return ~crc >>> 0;
}
