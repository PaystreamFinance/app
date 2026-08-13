import { Connection } from "@solana/web3.js";

let connection: Connection | null = null;

/**
 * Get or create Solana connection instance (singleton).
 * Passes the WSS endpoint so WebSocket subscriptions
 * (onAccountChange, onProgramAccountChange, etc.) work.
 */
export function getConnection(): Connection {
  if (!connection) {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_MAINNET;
    if (!rpcUrl) {
      throw new Error(
        "NEXT_PUBLIC_SOLANA_RPC_MAINNET environment variable is not set",
      );
    }
    const wssUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_MAINNET_WSS;
    connection = new Connection(rpcUrl, {
      commitment: "confirmed",
      wsEndpoint: wssUrl || undefined,
    });
  }
  return connection;
}
