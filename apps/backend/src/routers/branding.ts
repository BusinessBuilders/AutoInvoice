import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  processLogo,
  deleteOldLogo,
  updateBranding,
  getBranding,
} from '../services/logo';

export const brandingRouter = router({
  // Get current branding
  get: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user?.id;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    return getBranding(userId);
  }),

  // Upload logo (base64 encoded)
  uploadLogo: protectedProcedure
    .input(
      z.object({
        image: z.string(), // base64 encoded image
        filename: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new Error('User not authenticated');
      }

      // Get current branding to delete old logo
      const currentBranding = await getBranding(userId);
      if (currentBranding?.logoPath) {
        await deleteOldLogo(currentBranding.logoPath);
      }

      // Decode base64 image
      const base64Data = input.image.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Process logo and extract colors
      const result = await processLogo(userId, imageBuffer, input.filename);

      return result;
    }),

  // Update company info
  updateInfo: protectedProcedure
    .input(
      z.object({
        companyName: z.string().optional(),
        companyAddress: z.string().optional(),
        companyPhone: z.string().optional(),
        companyEmail: z.string().email().or(z.literal('')).optional(),
        companyWebsite: z.string().url().or(z.literal('')).optional(),
        companyTaxId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new Error('User not authenticated');
      }

      await updateBranding(userId, input);

      return { success: true };
    }),

  // Delete logo
  deleteLogo: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user?.id;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const currentBranding = await getBranding(userId);
    if (currentBranding?.logoPath) {
      await deleteOldLogo(currentBranding.logoPath);
    }

    // Clear logo and colors from database
    await ctx.prisma.user.update({
      where: { id: userId },
      data: {
        logoPath: null,
        brandColors: null,
      },
    });

    return { success: true };
  }),
});
