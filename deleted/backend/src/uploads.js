import multer from 'multer';
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads');
await fs.mkdir(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, and WebP images are accepted.'));
    }
    cb(null, true);
  }
});

export async function storeCompressedImage(file) {
  const storedName = `${crypto.randomUUID()}.webp`;
  const outputPath = path.join(uploadDir, storedName);
  const result = await sharp(file.buffer)
    .rotate()
    .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78, effort: 4 })
    .toFile(outputPath);
  return {
    storedName,
    sizeBytes: result.size,
    originalName: path.basename(file.originalname).slice(0, 255)
  };
}

export { upload, uploadDir };
