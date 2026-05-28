/*
 * Generates platform icon assets from logo.svg:
 *   - logo.ico         multi-resolution Windows icon (build.win.icon)
 *   - build/icon.png   1024x1024 PNG that electron-builder converts to .icns
 *                      during the macOS build (build.mac.icon) — so no
 *                      iconutil dependency on the Mac
 *
 * Asset-prep tooling, intentionally NOT in package.json dependencies. To
 * regenerate the icons:
 *
 *     npm install --no-save sharp png-to-ico
 *     node tools/make-icon.js
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default || require('png-to-ico');

const ROOT = path.join(__dirname, '..');
const SVG = path.join(ROOT, 'logo.svg');
const ICO_OUT = path.join(ROOT, 'logo.ico');
const MAC_PNG_OUT = path.join(ROOT, 'build', 'icon.png');

const ICO_SIZES = [256, 128, 64, 48, 32, 24, 16];
const MAC_PNG_SIZE = 1024;

(async () => {
  const svg = fs.readFileSync(SVG);

  // Windows .ico — rasterize the vector freshly at each size so every
  // resolution stays sharp (not by downscaling one bitmap).
  const pngs = await Promise.all(
    ICO_SIZES.map((s) => sharp(svg, { density: 512 }).resize(s, s, { fit: 'contain' }).png().toBuffer())
  );
  const ico = await pngToIco(pngs);
  fs.writeFileSync(ICO_OUT, ico);
  console.log('Wrote ' + ICO_OUT + ' (' + ico.length + ' bytes, sizes: ' + ICO_SIZES.join(',') + ')');

  // macOS source PNG — electron-builder turns a 512+ PNG into a proper .icns
  // container at build time, so we don't need iconutil here.
  fs.mkdirSync(path.dirname(MAC_PNG_OUT), { recursive: true });
  const macPng = await sharp(svg, { density: 1024 }).resize(MAC_PNG_SIZE, MAC_PNG_SIZE, { fit: 'contain' }).png().toBuffer();
  fs.writeFileSync(MAC_PNG_OUT, macPng);
  console.log('Wrote ' + MAC_PNG_OUT + ' (' + macPng.length + ' bytes, ' + MAC_PNG_SIZE + 'x' + MAC_PNG_SIZE + ')');
})().catch((e) => { console.error(e); process.exit(1); });
