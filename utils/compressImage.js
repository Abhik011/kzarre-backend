const sharp = require("sharp");

async function compressImage(buffer, mimetype) {
  let image = sharp(buffer).rotate();

  // Resize only if large
  image = image.resize({
    width: 1920,
    withoutEnlargement: true,
  });

  // 🔥 ALWAYS OUTPUT WEBP (best for web)
  return await image.webp({
    quality: 82,            // visually lossless
    effort: 5,              // balance CPU vs compression
  }).toBuffer();
}

module.exports = compressImage;
