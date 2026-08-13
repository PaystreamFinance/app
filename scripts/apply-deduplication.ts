#!/usr/bin/env tsx

/**
 * Script to apply request deduplication to all position routers
 * This is a one-time migration script
 */

import fs from "fs";
import path from "path";

const routersDir = path.join(process.cwd(), "src/server/api/routers/api");

const routers = [
  { file: "cpmm.ts", endpoint: "cpmm", hasIncludeUnderlying: true },
  { file: "amm.ts", endpoint: "amm", hasIncludeUnderlying: true },
  {
    file: "clmm.ts",
    endpoint: "clmm",
    hasIncludeUnderlying: false,
    hasIncludeDetails: true,
  },
  { file: "damm.ts", endpoint: "damm", hasIncludeUnderlying: false },
];

console.log("Applying request deduplication to position routers...\n");

for (const router of routers) {
  const filePath = path.join(routersDir, router.file);

  if (!fs.existsSync(filePath)) {
    console.log(`❌ File not found: ${router.file}`);
    continue;
  }

  let content = fs.readFileSync(filePath, "utf-8");

  // Check if already has deduplication import
  if (content.includes("request-deduplication")) {
    console.log(`✅ ${router.file} - Already has deduplication`);
    continue;
  }

  // Add import
  content = content.replace(
    /import { getCachedPositions, setCachedPositions } from "@\/lib\/performance\/positions-cache";/,
    `import { getCachedPositions, setCachedPositions } from "@/lib/performance/positions-cache";\nimport { deduplicateRequest, generateRequestKey } from "@/lib/performance/request-deduplication";`,
  );

  // Find getPositions method and wrap it
  const getPositionsRegex =
    /getPositions: publicProcedure[\s\S]*?\.query\(async \(\{ input, ctx \}\) => \{[\s\S]*?try \{[\s\S]*?\/\/ Check cache first[\s\S]*?if \(cached\) \{[\s\S]*?return cached;[\s\S]*?\}/;

  const match = content.match(getPositionsRegex);

  if (!match) {
    console.log(`⚠️  ${router.file} - Could not find getPositions pattern`);
    continue;
  }

  // Build deduplication key params
  let dedupParams = `privyIdToken: ctx.privyIdToken || 'anonymous',\n          poolAddress: input${router.hasIncludeUnderlying || router.hasIncludeDetails ? "." : "?."}poolAddress || 'all',`;

  if (router.hasIncludeUnderlying) {
    dedupParams += `\n          includeUnderlying: input.includeUnderlying || false,`;
  }

  if (router.hasIncludeDetails) {
    dedupParams += `\n          includeDetails: input.includeDetails || false,`;
  }

  const dedupCode = `
        // Generate deduplication key
        const dedupKey = generateRequestKey('${router.endpoint}.getPositions', {
          ${dedupParams}
        });

        // Deduplicate request
        return await deduplicateRequest(dedupKey, async () => {
`;

  content = content.replace(match[0], match[0] + dedupCode);

  // Find the return statement before the catch block and add closing bracket
  const returnBeforeCatchRegex =
    /(return parsedResponse;)\s+(} catch \(error\))/;
  content = content.replace(
    returnBeforeCatchRegex,
    "$1\n        });\n      $2",
  );

  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`✅ ${router.file} - Applied deduplication`);
}

console.log("\n✨ Done!");
