import { z } from "zod";

export const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const password = z.string().min(12).max(128);
export const credentials = z.object({
  email,
  password: z.string().min(1).max(128),
});
export const registration = z.object({
  email,
  password,
  name: z.string().trim().min(1).max(100),
});
