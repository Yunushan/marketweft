// Deterministically rasterize the app mark with Node's standard library.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
function chunk(tag, data) {
  const type = Buffer.from(tag)
  let crc = 0xffffffff
  for (const byte of Buffer.concat([type, data])) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  const length = Buffer.alloc(4),
    sum = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  sum.writeUInt32BE(~crc >>> 0)
  return Buffer.concat([length, type, data, sum])
}
for (const size of [192, 512]) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  const heights = [0.39, 0.58, 0.31, 0.51]
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = x / size,
        ny = y / size,
        slant = nx + (ny - 0.5) * 0.25
      const bar = heights.some(
        (h, i) =>
          slant >= 0.24 + i * 0.14 &&
          slant < 0.33 + i * 0.14 &&
          Math.abs(ny - 0.5) < h / 2,
      )
      raw.set(
        bar ? [17, 38, 28] : [116, 219, 173],
        y * (size * 3 + 1) + 1 + x * 3,
      )
    }
  const hdr = Buffer.alloc(13)
  hdr.writeUInt32BE(size)
  hdr.writeUInt32BE(size, 4)
  hdr[8] = 8
  hdr[9] = 2
  writeFileSync(
    new URL('../public/icon-' + size + '.png', import.meta.url),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', hdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}
