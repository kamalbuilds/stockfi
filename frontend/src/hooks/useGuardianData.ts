"use client";

import { useEffect, useState, useCallback } from "react";
import { publicClient } from "@/config/client";
import { STOP_LOSS_VAULT_ABI, GAP_INSURANCE_POOL_ABI, PRICE_ORACLE_ABI } from "@/config/abi";
import {
  VAULT_ADDRESS,
  INSURANCE_POOL_ADDRESS,
  ORACLES,
  SUPPORTED_STOCKS,
  getStopLossStatusName,
} from "@/config/contracts";
import { type Address, formatUnits } from "viem";

// Types

export interface VaultStats {
  totalPositions: bigint;
  totalExecuted: bigint;
  totalProtectedUsd: bigint;
}

export interface PoolStats {
  totalUsdcDeposited: bigint;
  poolBalance: bigint;
  totalPremiums: bigint;
  totalGapsPaid: bigint;
  numProviders: bigint;
}

export interface StopLossPosition {
  id: `0x${string}`;
  owner: Address;
  stockToken: Address;
  ticker: string;
  amount: bigint;
  stopPrice: bigint;
  premiumPaid: bigint;
  priceOracle: Address;
  status: number;
  statusName: string;
  createdAt: bigint;
  executedAt: bigint;
  marketPriceAtExecution: bigint;
  distanceToStop: number;
}

export interface StockPrice {
  ticker: string;
  name: string;
  color: string;
  price: number;
  updatedAt: number;
  isStale: boolean;
}

// Hook: Vault stats
export function useVaultStats() {
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      if (!VAULT_ADDRESS) return;
      const result = await publicClient.readContract({
        address: VAULT_ADDRESS,
        abi: STOP_LOSS_VAULT_ABI,
        functionName: "getStats",
      });
      setStats({
        totalPositions: result[0],
        totalExecuted: result[1],
        totalProtectedUsd: result[2],
      });
    } catch (err) {
      console.error("Failed to fetch vault stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}

// Hook: Pool stats
export function usePoolStats() {
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      if (!INSURANCE_POOL_ADDRESS) return;
      const result = await publicClient.readContract({
        address: INSURANCE_POOL_ADDRESS,
        abi: GAP_INSURANCE_POOL_ABI,
        functionName: "getStats",
      });
      setStats({
        totalUsdcDeposited: result[0],
        poolBalance: result[1],
        totalPremiums: result[2],
        totalGapsPaid: result[3],
        numProviders: result[4],
      });
    } catch (err) {
      console.error("Failed to fetch pool stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}

// Hook: Stock prices from oracles
export function useStockPrices() {
  const [prices, setPrices] = useState<StockPrice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPrices = useCallback(async () => {
    try {
      const results: StockPrice[] = [];
      for (const stock of SUPPORTED_STOCKS) {
        const oracleAddr = ORACLES[stock.ticker];
        if (!oracleAddr) continue;
        try {
          const [roundData, stale] = await Promise.all([
            publicClient.readContract({
              address: oracleAddr,
              abi: PRICE_ORACLE_ABI,
              functionName: "latestRoundData",
            }),
            publicClient.readContract({
              address: oracleAddr,
              abi: PRICE_ORACLE_ABI,
              functionName: "isStale",
            }),
          ]);
          results.push({
            ticker: stock.ticker,
            name: stock.name,
            color: stock.color,
            price: Number(formatUnits(roundData[1], 8)),
            updatedAt: Number(roundData[3]),
            isStale: stale,
          });
        } catch {
          results.push({
            ticker: stock.ticker,
            name: stock.name,
            color: stock.color,
            price: 0,
            updatedAt: 0,
            isStale: true,
          });
        }
      }
      setPrices(results);
    } catch (err) {
      console.error("Failed to fetch stock prices:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 10000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  return { prices, loading, refetch: fetchPrices };
}

// Hook: User positions
export function useUserPositions(address?: Address) {
  const [positions, setPositions] = useState<StopLossPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!VAULT_ADDRESS || !address) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const positionIds = await publicClient.readContract({
        address: VAULT_ADDRESS,
        abi: STOP_LOSS_VAULT_ABI,
        functionName: "getUserPositions",
        args: [address],
      });

      const results: StopLossPosition[] = [];
      for (const id of positionIds) {
        try {
          const [pos, dist] = await Promise.all([
            publicClient.readContract({
              address: VAULT_ADDRESS,
              abi: STOP_LOSS_VAULT_ABI,
              functionName: "getPosition",
              args: [id],
            }),
            publicClient.readContract({
              address: VAULT_ADDRESS,
              abi: STOP_LOSS_VAULT_ABI,
              functionName: "getDistanceToStop",
              args: [id],
            }).catch(() => 0n),
          ]);
          results.push({
            id,
            owner: pos.owner,
            stockToken: pos.stockToken,
            ticker: pos.ticker,
            amount: pos.amount,
            stopPrice: pos.stopPrice,
            premiumPaid: pos.premiumPaid,
            priceOracle: pos.priceOracle,
            status: pos.status,
            statusName: getStopLossStatusName(pos.status),
            createdAt: pos.createdAt,
            executedAt: pos.executedAt,
            marketPriceAtExecution: pos.marketPriceAtExecution,
            distanceToStop: Number(dist),
          });
        } catch (err) {
          console.error(`Failed to fetch position ${id}:`, err);
        }
      }
      setPositions(results);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch positions:", err);
      setError("Failed to load positions");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 15000);
    return () => clearInterval(interval);
  }, [fetchPositions]);

  return { positions, loading, error, refetch: fetchPositions };
}

// Re-export under old names for backward compatibility with existing components
export const useGuardianStats = useVaultStats;
export const usePriceFeeds = useStockPrices;
