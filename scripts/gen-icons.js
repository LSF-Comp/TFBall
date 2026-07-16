const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const icons = [
    { src: 'icons/icon-192.svg', sizes: [192] },
    { src: 'icons/icon-512.svg', sizes: [512] }
];

async function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function gen() {
    try {
        for (const icon of icons) {
            const input = path.resolve(icon.src);
            for (const size of icon.sizes) {
                const outPng = path.resolve(path.dirname(icon.src), `${path.basename(icon.src, path.extname(icon.src))}-${size}.png`);
                await ensureDir(path.dirname(outPng));
                await sharp(input)
                    .resize(size, size, { fit: 'contain' })
                    .png({ quality: 90 })
                    .toFile(outPng);
                console.log('Generated', outPng);
            }
        }
        console.log('All icons generated.');
    } catch (e) {
        console.error('Failed to generate icons:', e);
        process.exit(1);
    }
}

gen();
