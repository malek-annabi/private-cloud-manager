import { z } from "zod";

export const vmIdSchema = z.object({
  id: z.string().min(1).max(100),
});