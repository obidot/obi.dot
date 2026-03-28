import assert from "node:assert/strict";
import test from "node:test";
import type { Address } from "viem";
import {
  ASSET_HUB_ADAPTER_ADDRESS,
  HYDRATION_ADAPTER_ADDRESS,
  TOKEN_ADDRESSES,
  UV2_PAIRS,
} from "../config/constants.js";
import { KEEPER_ORACLE_ADDRESS } from "../config/oracle.config.js";
import { SwapRouterService } from "./swap-router.service.js";

type ReadContractArgs = {
  address: Address;
  functionName: string;
  args?: readonly unknown[];
};

function createServiceWithStubbedClient(
  readContract: (args: ReadContractArgs) => Promise<unknown>,
) {
  const service = new SwapRouterService();
  (
    service as unknown as {
      publicClient: { readContract: typeof readContract };
    }
  ).publicClient = { readContract };
  return service;
}

test("findRoutes surfaces Hydration as simulated only when simulationMode is enabled", async () => {
  const amountIn = 10n ** 18n;
  const tokenIn = TOKEN_ADDRESSES.tDOT;
  const tokenOut = TOKEN_ADDRESSES.tUSDC;

  const service = createServiceWithStubbedClient(
    async ({ address, functionName }) => {
      if (functionName === "getReserves") {
        return [0n, 0n, 0] as const;
      }

      if (functionName === "simulationMode") {
        if (address.toLowerCase() === HYDRATION_ADAPTER_ADDRESS.toLowerCase()) {
          return true;
        }
        if (address.toLowerCase() === ASSET_HUB_ADAPTER_ADDRESS.toLowerCase()) {
          return false;
        }
      }

      if (address.toLowerCase() === KEEPER_ORACLE_ADDRESS.toLowerCase()) {
        if (functionName === "latestRoundData") {
          return [1n, 700_000_000n, 0n, 0n, 1n] as const;
        }
        if (functionName === "decimals") {
          return 8;
        }
      }

      throw new Error(
        `Unexpected readContract call: ${functionName} on ${address}`,
      );
    },
  );

  const routes = await service.findRoutes(tokenIn, tokenOut, amountIn);
  const hydration = routes.find(
    (route) => route.id === "Hydration Omnipool (XCM)",
  );

  assert.ok(hydration);
  assert.equal(hydration.status, "simulated");
  assert.equal(hydration.previewOnly, true);
  assert.match(
    hydration.note ?? "",
    /simulationMode is enabled on the adapter/i,
  );
  assert.equal(hydration.amountOut, "6979000");
  assert.equal(hydration.minAmountOut, "6944105");
});

test("findRoutes caches adapter simulationMode checks between route lookups", async () => {
  const amountIn = 10n ** 18n;
  const tokenIn = TOKEN_ADDRESSES.tDOT;
  const tokenOut = TOKEN_ADDRESSES.tUSDC;
  let hydrationReads = 0;
  let assetHubReads = 0;

  const service = createServiceWithStubbedClient(
    async ({ address, functionName }) => {
      if (functionName === "getReserves") {
        return [0n, 0n, 0] as const;
      }

      if (functionName === "simulationMode") {
        if (address.toLowerCase() === HYDRATION_ADAPTER_ADDRESS.toLowerCase()) {
          hydrationReads += 1;
          return false;
        }
        if (address.toLowerCase() === ASSET_HUB_ADAPTER_ADDRESS.toLowerCase()) {
          assetHubReads += 1;
          return false;
        }
      }

      if (
        functionName === "supportsPair" ||
        functionName === "getAmountOut" ||
        functionName === "latestRoundData" ||
        functionName === "decimals"
      ) {
        throw new Error(`Unexpected follow-up read: ${functionName}`);
      }

      throw new Error(
        `Unexpected readContract call: ${functionName} on ${address}`,
      );
    },
  );

  await service.findRoutes(tokenIn, tokenOut, amountIn);
  await service.findRoutes(tokenIn, tokenOut, amountIn);

  assert.equal(hydrationReads, 1);
  assert.equal(assetHubReads, 1);
  assert.equal(UV2_PAIRS.length > 0, true);
});
