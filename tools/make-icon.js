/*
 * Generates logo.ico (multi-resolution Windows icon) from logo.svg.
 *
 * Used at asset-prep time, not at app runtime, so its tooling is intentionally
 * NOT in package.json dependencies. To regenerate the icon:
 *
 *     npm install --no-save sharp png-to-ico
 *     node tools/make-icon.js
 *
 * The committed artifact is logo.ico; electron-builder reads it via build.win.icon.
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default || require('png-to-ico');

const ROOT = path.join(__dirname, '..');
const SVG = path.join(ROOT, 'logo.svg');
const OUT = path.join(ROOT, 'logo.ico');

// Windows icons embed several sizes; 256 is required for modern shells, the
// smaller ones keep the taskbar/16px tray rendering crisp.
const SIZES = [256, 128, 64, 48, 32, 24, 16];

(async () => {
  const svg = fs.readFileSync(SVG);
  // Rasterize the vector freshly at each size (not by downscaling one bitmap)
  // so every resolution stays sharp.
  const pngs = await Promise.all(
    SIZES.map((s) => sharp(svg, { density: 512 }).resize(s, s, { fit: 'contain' }).png().toBuffer())
  );
  const ico = await pngToIco(pngs);
  fs.writeFileSync(OUT, ico);
  console.log('Wrote ' + OUT + ' (' + ico.length + ' bytes, sizes: ' + SIZES.join(',') + ')');
})().catch((e) => { console.error(e); process.exit(1); });
