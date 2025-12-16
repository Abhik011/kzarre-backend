const { exec } = require("child_process");

function compressVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const cmd = `
      ffmpeg -y -i "${inputPath}" \
      -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
      -vcodec libx264 \
      -crf 23 \
      -preset fast \
      -profile:v high \
      -level 4.1 \
      -movflags +faststart \
      -pix_fmt yuv420p \
      -acodec aac \
      -b:a 128k \
      "${outputPath}"
    `;

    exec(cmd, (error) => {
      if (error) return reject(error);
      resolve(outputPath);
    });
  });
}

module.exports = compressVideo;
