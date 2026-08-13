"use client";

import { useCallback } from "react";
import { Transaction, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useWallets } from "@privy-io/react-auth/solana";
import { VoltrClient } from "@voltr/vault-sdk";
import { BN } from "@coral-xyz/anchor";
import bs58 from "bs58";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID as SPL_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { getConnection } from "@/lib/solana-connection";

const VAULT_ADDRESS = new PublicKey(
  "5LUoeiurbbnweLnZ6TMUWe8Fbk4BTuomzjLF1iSeix9t",
);
const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

function addAtaIxIfNeeded(
  payer: PublicKey,
  mint: PublicKey,
  owner: PublicKey,
  ixs: TransactionInstruction[],
) {
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    true,
    SPL_TOKEN_PROGRAM_ID,
  );
  ixs.push(
    createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ata,
      owner,
      mint,
      SPL_TOKEN_PROGRAM_ID,
    ),
  );
  return ata;
}

export function useVaultActions() {
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const connected = !!wallet?.address;
  const publicKey = wallet?.address ?? null;

  const sendTx = useCallback(
    async (ixs: TransactionInstruction[]): Promise<string> => {
      if (!wallet?.address) throw new Error("Wallet not connected");
      const connection = getConnection();
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();

      const tx = new Transaction().add(...ixs);
      tx.feePayer = new PublicKey(wallet.address);
      tx.recentBlockhash = blockhash;

      const { signature } = await wallet.signAndSendTransaction({
        transaction: tx.serialize({ requireAllSignatures: false }),
        chain: "solana:mainnet",
      });
      const sigStr = bs58.encode(signature);

      // Confirm in background — don't block the toast on WebSocket subscription
      void connection
        .confirmTransaction(
          { signature: sigStr, blockhash, lastValidBlockHeight },
          "confirmed",
        )
        .catch(() => undefined);

      return sigStr;
    },
    [wallet],
  );

  const depositToVault = useCallback(
    async (amountUsdc: number) => {
      if (!wallet?.address) throw new Error("Wallet not connected");
      const connection = getConnection();
      const vc = new VoltrClient(connection);
      const payer = new PublicKey(wallet.address);
      const amountRaw = Math.round(amountUsdc * 1_000_000);

      const ixs: TransactionInstruction[] = [];
      const { vaultLpMint } = vc.findVaultAddresses(VAULT_ADDRESS);
      addAtaIxIfNeeded(payer, vaultLpMint, payer, ixs);
      addAtaIxIfNeeded(payer, USDC_MINT, payer, ixs);

      const depositIx = await vc.createDepositVaultIx(new BN(amountRaw), {
        userTransferAuthority: payer,
        vault: VAULT_ADDRESS,
        vaultAssetMint: USDC_MINT,
        assetTokenProgram: TOKEN_PROGRAM_ID,
      });
      ixs.push(depositIx);

      return sendTx(ixs);
    },
    [wallet, sendTx],
  );

  const requestWithdraw = useCallback(
    async (amountUsdc: number, isWithdrawAll: boolean) => {
      if (!wallet?.address) throw new Error("Wallet not connected");
      const connection = getConnection();
      const vc = new VoltrClient(connection);
      const payer = new PublicKey(wallet.address);
      const amountRaw = Math.round(amountUsdc * 1_000_000);

      const ixs: TransactionInstruction[] = [];

      // The program requires an LP ATA owned by the receipt PDA to exist first
      const { vaultLpMint } = vc.findVaultAddresses(VAULT_ADDRESS);
      const receiptPda = vc.findRequestWithdrawVaultReceipt(VAULT_ADDRESS, payer);
      addAtaIxIfNeeded(payer, vaultLpMint, receiptPda, ixs);

      const ix = await vc.createRequestWithdrawVaultIx(
        {
          amount: new BN(amountRaw),
          isAmountInLp: false,
          isWithdrawAll,
        },
        {
          payer,
          userTransferAuthority: payer,
          vault: VAULT_ADDRESS,
        },
      );
      ixs.push(ix);

      return sendTx(ixs);
    },
    [wallet, sendTx],
  );

  const claimWithdraw = useCallback(async () => {
    if (!wallet?.address) throw new Error("Wallet not connected");
    const connection = getConnection();
    const vc = new VoltrClient(connection);
    const payer = new PublicKey(wallet.address);

    const ixs: TransactionInstruction[] = [];
    addAtaIxIfNeeded(payer, USDC_MINT, payer, ixs);

    const ix = await vc.createWithdrawVaultIx({
      userTransferAuthority: payer,
      vault: VAULT_ADDRESS,
      vaultAssetMint: USDC_MINT,
      assetTokenProgram: TOKEN_PROGRAM_ID,
    });
    ixs.push(ix);

    return sendTx(ixs);
  }, [wallet, sendTx]);

  return {
    depositToVault,
    requestWithdraw,
    claimWithdraw,
    connected,
    publicKey,
  };
}
