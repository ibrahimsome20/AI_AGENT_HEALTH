import { z } from "zod";

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(100),
  locale: z.enum(["en", "ar"]).optional(),
  conversationId: z.uuid().nullable().optional(),
});
