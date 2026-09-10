// Regenerates resources/icon.png from the source SVG.
// electron-builder derives the Windows .ico from this 512px PNG.
import sharp from 'sharp'
await sharp('resources/icon.svg', { density: 384 })
  .resize(512, 512)
  .png()
  .toFile('resources/icon.png')
console.log('resources/icon.png written')
