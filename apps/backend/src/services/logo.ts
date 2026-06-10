import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '../utils/db';
import logger from '../utils/logger';

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

export interface LogoUploadResult {
  logoPath: string;
  brandColors: BrandColors;
}

/**
 * Process uploaded logo: optimize and extract colors
 */
export async function processLogo(
  userId: string,
  imageBuffer: Buffer,
  originalFilename: string
): Promise<LogoUploadResult> {
  try {
    // Ensure uploads directory exists
    const uploadsDir = process.env.UPLOAD_DIR || './uploads';
    const logosDir = path.join(uploadsDir, 'logos');
    await fs.mkdir(logosDir, { recursive: true });

    // Generate unique filename
    const ext = path.extname(originalFilename);
    const filename = `${userId}-${Date.now()}${ext}`;
    const logoPath = path.join(logosDir, filename);

    // Optimize image with sharp (max 500x500, preserve aspect ratio)
    await sharp(imageBuffer)
      .resize(500, 500, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({ quality: 90 }) // Convert to PNG for consistency
      .toFile(logoPath);

    logger.info('Logo optimized', { userId, logoPath });

    // Extract color palette using node-vibrant
    const { Vibrant } = await import('node-vibrant/node');
    const vibrant = new Vibrant(logoPath);
    const palette = await vibrant.getPalette();

    const brandColors: BrandColors = {
      primary: palette.Vibrant?.hex || '#2563eb',
      secondary: palette.DarkVibrant?.hex || '#1e40af',
      accent: palette.LightVibrant?.hex || '#60a5fa',
      background: palette.LightMuted?.hex || '#f3f4f6',
    };

    logger.info('Colors extracted', { userId, brandColors });

    // Update user with logo and colors
    await prisma.user.update({
      where: { id: userId },
      data: {
        logoPath: `/logos/${filename}`,
        brandColors: brandColors as any,
      },
    });

    logger.info('User branding updated', { userId });

    return {
      logoPath: `/logos/${filename}`,
      brandColors,
    };
  } catch (error) {
    logger.error('Logo processing failed', { error, userId });
    throw new Error(`Failed to process logo: ${error}`);
  }
}

/**
 * Delete old logo when uploading a new one
 */
export async function deleteOldLogo(logoPath: string): Promise<void> {
  try {
    const uploadsDir = process.env.UPLOAD_DIR || './uploads';
    const fullPath = path.join(uploadsDir, logoPath);

    await fs.unlink(fullPath);
    logger.info('Old logo deleted', { logoPath });
  } catch (error) {
    // Don't fail if file doesn't exist
    logger.warn('Could not delete old logo', { logoPath, error });
  }
}

/**
 * Update company branding info
 */
export async function updateBranding(
  userId: string,
  data: {
    companyName?: string;
    companyAddress?: string;
    companyPhone?: string;
    companyEmail?: string;
    companyWebsite?: string;
    companyTaxId?: string;
  }
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data,
  });

  logger.info('Company branding updated', { userId });
}

/**
 * Get user branding info
 */
export async function getBranding(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      logoPath: true,
      brandColors: true,
      companyName: true,
      companyAddress: true,
      companyPhone: true,
      companyEmail: true,
      companyWebsite: true,
      companyTaxId: true,
    },
  });

  return user;
}
