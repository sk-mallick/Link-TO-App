const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const BASE = 'backend/templates/android-webview/app/src/main/res';
const SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192
};

async function makeIcon(size, outPath) {
  const rx = Math.round(size * 0.2);
  const fs2 = Math.round(size * 0.5);
  const svgStr = [
    '<svg width="' + size + '" height="' + size + '" xmlns="http://www.w3.org/2000/svg">',
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0%" stop-color="#6C63FF"/>',
    '<stop offset="100%" stop-color="#a78bfa"/>',
    '</linearGradient></defs>',
    '<rect width="' + size + '" height="' + size + '" rx="' + rx + '" fill="url(#g)"/>',
    '<text x="50%" y="58%" font-size="' + fs2 + '" font-family="Arial" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">L</text>',
    '</svg>'
  ].join('');
  const svg = Buffer.from(svgStr);
  await sharp(svg).png().toFile(outPath);
}

(async () => {
  for (const [folder, size] of Object.entries(SIZES)) {
    const dir = path.join(BASE, folder);
    fs.mkdirSync(dir, { recursive: true });
    await makeIcon(size, path.join(dir, 'ic_launcher.png'));
    console.log('Created', folder, size + 'px');
  }
  console.log('All default icons created!');
})();
