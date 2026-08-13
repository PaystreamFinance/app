import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

import { strategiesRouter } from "./routers/strategies";
import { driftRouter } from "./routers/drift";
import { pacificaRouter } from "./routers/pacifica";
import { hyperliquidRouter } from "./routers/hyperliquid";
import { performanceRouter } from "./routers/performance";
import { priceRouter } from "./routers/price";
import { vaultsRouter } from "./routers/vaults";
import { swapRouter } from "./routers/swap";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  price: priceRouter,
  strategies: strategiesRouter,
  drift: driftRouter,
  pacifica: pacificaRouter,
  hyperliquid: hyperliquidRouter,
  performance: performanceRouter,
  vaults: vaultsRouter,
  swap: swapRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
