import fs from 'fs'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const src = 'build/icon.png'
const square = 'build/icon-square.png'

const meta = await sharp(src).metadata()
const size = Math.min(meta.width ?? 256, meta.height ?? 256)

await sharp(src)
  .resize(size, size, { fit: 'cover', position: 'centre' })
  .png()
  .toFile(square)

const buf = await pngToIco(square)
fs.writeFileSync('build/icon.ico', buf)
console.log(`Created build/icon.ico (${buf.length} bytes) from ${size}x${size} PNG`)
