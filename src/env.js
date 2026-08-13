import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    SERVER_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    UNIBLOCK_API_URL: z.string().url(),
    UNIBLOCK_API_KEY: z.string(),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_KEY: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_ARBITRAGE_API_URL: z.string().url().optional(),
    NEXT_PUBLIC_PERP_HEDGE_API_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    /** Privy signer id for server-side txs (Pacifica, etc.); used with useSigners.addSigners */
    NEXT_PUBLIC_SIGNER_ID: z.string().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    SERVER_URL: process.env.SERVER_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_ARBITRAGE_API_URL: process.env.NEXT_PUBLIC_ARBITRAGE_API_URL,
    NEXT_PUBLIC_PERP_HEDGE_API_URL: process.env.NEXT_PUBLIC_PERP_HEDGE_API_URL,
    UNIBLOCK_API_URL: process.env.UNIBLOCK_API_URL,
    UNIBLOCK_API_KEY: process.env.UNIBLOCK_API_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SIGNER_ID: process.env.NEXT_PUBLIC_SIGNER_ID,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
