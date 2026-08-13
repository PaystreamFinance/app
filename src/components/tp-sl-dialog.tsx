/**
 * TP/SL dialog for an open position.
 *
 * One position in → up to two API entries out (TP, SL). User inputs each
 * in either **Price** (absolute $) or **Percentage** (% of margin) mode,
 * switchable per input.
 *
 * % mode: user types what % of their margin they want to gain/lose.
 *   gain_usd  = (pct / 100) × margin
 *   price_delta = gain_usd / sizeAsset
 *   trigger_price = entryPrice ± price_delta  (sign is direction + type aware)
 *
 * We always send `triggerPrice` (absolute $) — never `triggerPricePercent`.
 */

"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { SimpleToast } from "@/components/simple-toast";
import {
  setTpSl,
  type SetTpSlEntry,
  type SetTpSlRequest,
} from "@/lib/arbitrage-api";
import {
  getPrivyAccessToken,
  getPrivyIdToken,
} from "@/lib/privy-auth";

type BaseVenue = SetTpSlEntry["protocol"];

export interface TpSlDialogProps {
  open: boolean;
  onClose: () => void;
  position: {
    protocol: BaseVenue;
    market: string;
    direction: "long" | "short";
    entryPrice: number;
    takeProfitPrice?: number | null;
    stopLossPrice?: number | null;
    leverage?: number | null;
    /** Position margin in USD — required for % mode PnL calculation. */
    margin?: number | null;
    /** Position size in asset units — required for % mode price derivation. */
    sizeAsset?: number | null;
  };
  onSuccess?: (applied: { takeProfitPrice?: number; stopLossPrice?: number }) => void;
}

type InputMode = "pct" | "price";

interface TriggerState {
  mode: InputMode;
  value: string;
}

const INITIAL: TriggerState = { mode: "price", value: "" };

/** Triggers within this fraction of entry price are flagged as likely-to-
 *  fill-immediately due to bid/ask spread + slippage. 0.3% = 30 bps. */
const NEAR_SPREAD_FRACTION = 0.003;

/** SL margin loss above this fraction is flagged as near-liquidation. */
const NEAR_LIQUIDATION_FRACTION = 0.8;

/**
 * Convert margin % → absolute trigger price.
 * pct = % of margin to gain (TP) or lose (SL).
 */
function priceFromMarginPct(
  pct: number,
  type: "tp" | "sl",
  direction: "long" | "short",
  entryPrice: number,
  margin: number,
  sizeAsset: number,
): number {
  const pnlUsd = (pct / 100) * margin;
  const priceDelta = pnlUsd / sizeAsset;
  // long TP: price goes up (+), long SL: price goes down (-)
  // short TP: price goes down (-), short SL: price goes up (+)
  const sign = direction === "long" ? (type === "tp" ? 1 : -1) : type === "tp" ? -1 : 1;
  return entryPrice + sign * priceDelta;
}

/**
 * Convert absolute price → margin %.
 * Returns the % of margin that would be gained/lost at that price.
 */
function marginPctFromPrice(
  price: number,
  type: "tp" | "sl",
  direction: "long" | "short",
  entryPrice: number,
  margin: number,
  sizeAsset: number,
): number {
  const sign = direction === "long" ? (type === "tp" ? 1 : -1) : type === "tp" ? -1 : 1;
  const priceDelta = sign * (price - entryPrice);
  const pnlUsd = priceDelta * sizeAsset;
  return (pnlUsd / margin) * 100;
}

/** Expected PnL in USD at a given trigger price. Positive = profit. */
function expectedPnlUsd(
  price: number,
  direction: "long" | "short",
  entryPrice: number,
  sizeAsset: number,
): number {
  // Long profits when price goes up, short profits when price goes down.
  return direction === "long"
    ? (price - entryPrice) * sizeAsset
    : (entryPrice - price) * sizeAsset;
}

/** Convert a user-input string to an absolute trigger price. Returns null if invalid. */
function resolveTriggerPrice(
  s: TriggerState,
  type: "tp" | "sl",
  direction: "long" | "short",
  entryPrice: number,
  margin?: number | null,
  sizeAsset?: number | null,
): number | null {
  const trimmed = s.value.trim();
  if (!trimmed) return null;
  const raw = parseFloat(trimmed);
  if (!Number.isFinite(raw) || raw <= 0) return null;

  if (s.mode === "price") {
    const validLong = type === "tp" ? raw > entryPrice : raw < entryPrice;
    const validShort = type === "tp" ? raw < entryPrice : raw > entryPrice;
    if (direction === "long" ? !validLong : !validShort) return null;
    return raw;
  }

  // Pct mode — requires margin + sizeAsset
  if (!margin || !sizeAsset || margin <= 0 || sizeAsset <= 0) return null;
  const price = priceFromMarginPct(raw, type, direction, entryPrice, margin, sizeAsset);
  if (!Number.isFinite(price) || price <= 0) return null;
  // Validate resulting price is on the correct side
  const validLong = type === "tp" ? price > entryPrice : price < entryPrice;
  const validShort = type === "tp" ? price < entryPrice : price > entryPrice;
  if (direction === "long" ? !validLong : !validShort) return null;
  return price;
}

/** Live preview shown below the input. */
function previewCounterpart(
  s: TriggerState,
  type: "tp" | "sl",
  direction: "long" | "short",
  entryPrice: number,
  margin?: number | null,
  sizeAsset?: number | null,
): string {
  const price = resolveTriggerPrice(s, type, direction, entryPrice, margin, sizeAsset);
  if (price === null) return "—";

  if (s.mode === "pct") {
    // Show the resolved absolute price
    return `≈ $${price.toFixed(4)}`;
  }

  // Price mode: show margin % if we have the data
  if (margin && sizeAsset && margin > 0 && sizeAsset > 0) {
    const pct = marginPctFromPrice(price, type, direction, entryPrice, margin, sizeAsset);
    if (Number.isFinite(pct) && pct > 0) {
      return `≈ ${pct.toFixed(2)}% of margin`;
    }
  }
  return "—";
}

function inputError(
  s: TriggerState,
  type: "tp" | "sl",
  direction: "long" | "short",
  entryPrice: number,
  margin?: number | null,
  sizeAsset?: number | null,
): string | null {
  const trimmed = s.value.trim();
  if (!trimmed) return null;
  const raw = parseFloat(trimmed);
  if (!Number.isFinite(raw) || raw <= 0) return "Enter a positive number.";

  if (s.mode === "price") {
    const wantsAbove =
      (direction === "long" && type === "tp") || (direction === "short" && type === "sl");
    if (wantsAbove && raw <= entryPrice)
      return `${type.toUpperCase()} must be above $${entryPrice.toFixed(4)}.`;
    if (!wantsAbove && raw >= entryPrice)
      return `${type.toUpperCase()} must be below $${entryPrice.toFixed(4)}.`;
    return null;
  }

  // Pct mode
  if (!margin || !sizeAsset || margin <= 0 || sizeAsset <= 0)
    return "Margin data unavailable — use $ mode.";
  const price = priceFromMarginPct(raw, type, direction, entryPrice, margin, sizeAsset);
  if (!Number.isFinite(price) || price <= 0) return "Invalid percentage.";
  const validLong = type === "tp" ? price > entryPrice : price < entryPrice;
  const validShort = type === "tp" ? price < entryPrice : price > entryPrice;
  if (direction === "long" ? !validLong : !validShort)
    return "Resulting price is on the wrong side of entry.";
  return null;
}

function inputWarning(
  s: TriggerState,
  type: "tp" | "sl",
  direction: "long" | "short",
  entryPrice: number,
  margin?: number | null,
  sizeAsset?: number | null,
): string | null {
  const price = resolveTriggerPrice(s, type, direction, entryPrice, margin, sizeAsset);
  if (price === null) return null;

  const distancePct = Math.abs(price - entryPrice) / entryPrice;
  if (distancePct < NEAR_SPREAD_FRACTION) {
    return "Trigger sits within ~0.3% of entry — may fire immediately on spread/slippage.";
  }

  if (type === "sl" && margin && sizeAsset && margin > 0 && sizeAsset > 0) {
    const marginLossPct = marginPctFromPrice(price, "sl", direction, entryPrice, margin, sizeAsset);
    if (Number.isFinite(marginLossPct) && marginLossPct >= NEAR_LIQUIDATION_FRACTION * 100) {
      return `SL ≈ ${marginLossPct.toFixed(0)}% margin loss — venue may liquidate before SL fires.`;
    }
  }
  return null;
}

export function TpSlDialog({
  open,
  onClose,
  position,
  onSuccess,
}: TpSlDialogProps) {
  const [tp, setTp] = React.useState<TriggerState>(INITIAL);
  const [sl, setSl] = React.useState<TriggerState>(INITIAL);
  const [loading, setLoading] = React.useState(false);

  const initialTp = position.takeProfitPrice;
  const initialSl = position.stopLossPrice;
  React.useEffect(() => {
    if (open) {
      setTp({
        mode: "price",
        value:
          typeof initialTp === "number" && Number.isFinite(initialTp) && initialTp > 0
            ? String(initialTp)
            : "",
      });
      setSl({
        mode: "price",
        value:
          typeof initialSl === "number" && Number.isFinite(initialSl) && initialSl > 0
            ? String(initialSl)
            : "",
      });
      setLoading(false);
    }
  }, [open, position.market, position.protocol, initialTp, initialSl]);

  if (!open) return null;

  const entryPrice = Number(position.entryPrice);
  const hasValidEntryPrice = Number.isFinite(entryPrice) && entryPrice > 0;
  const margin = position.margin ?? null;
  const sizeAsset = position.sizeAsset ?? null;
  const market = position.market.replace(/-PERP$/i, "").trim().toUpperCase();

  const tpHasValue = tp.value.trim().length > 0;
  const slHasValue = sl.value.trim().length > 0;
  const tpPrice = tpHasValue
    ? resolveTriggerPrice(tp, "tp", position.direction, entryPrice, margin, sizeAsset)
    : null;
  const slPrice = slHasValue
    ? resolveTriggerPrice(sl, "sl", position.direction, entryPrice, margin, sizeAsset)
    : null;

  const tpValid = !tpHasValue || tpPrice !== null;
  const slValid = !slHasValue || slPrice !== null;
  const hasAny = tpHasValue || slHasValue;
  const canSubmit = hasValidEntryPrice && hasAny && tpValid && slValid && !loading;

  const hadOnchainTp =
    typeof initialTp === "number" && Number.isFinite(initialTp) && initialTp > 0;
  const hadOnchainSl =
    typeof initialSl === "number" && Number.isFinite(initialSl) && initialSl > 0;
  const tpCleared = hadOnchainTp && !tpHasValue;
  const slCleared = hadOnchainSl && !slHasValue;
  const clearedNotice = tpCleared || slCleared;

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    // Always send triggerPrice (absolute $). In pct mode the price is
    // computed client-side from margin %; we never send triggerPricePercent.
    const buildEntry = (
      s: TriggerState,
      type: "tp" | "sl",
    ): SetTpSlEntry | null => {
      const price = resolveTriggerPrice(s, type, position.direction, entryPrice, margin, sizeAsset);
      if (price === null) return null;
      return {
        protocol: position.protocol,
        market,
        type,
        triggerPrice: price,
      };
    };

    const tpEntry = buildEntry(tp, "tp");
    const slEntry = buildEntry(sl, "sl");
    const entries: SetTpSlEntry[] = [];
    if (tpEntry) entries.push(tpEntry);
    if (slEntry) entries.push(slEntry);
    if (entries.length === 0) {
      onClose();
      return;
    }

    const idToken = getPrivyIdToken();
    const accessToken = getPrivyAccessToken();
    if (!idToken) {
      toast.custom(() => (
        <SimpleToast type="error" title="Not authenticated" description="Sign in again and retry." />
      ));
      return;
    }

    setLoading(true);
    try {
      const req: SetTpSlRequest = { positions: entries };
      console.log("[setTpSl] request:", JSON.stringify(req, null, 2));
      const resp = await setTpSl(req, idToken, accessToken ?? undefined);
      console.log("[setTpSl] response:", resp);
      const results = resp.results ?? [];
      const failed = results.filter((r) => r.status === "error");

      const applied: { takeProfitPrice?: number; stopLossPrice?: number } = {};
      const matchedTp = results.find((r) => r.type === "tp" && r.status !== "error");
      const matchedSl = results.find((r) => r.type === "sl" && r.status !== "error");
      const resolvedTp =
        typeof matchedTp?.triggerPrice === "number" && Number.isFinite(matchedTp.triggerPrice)
          ? matchedTp.triggerPrice
          : tpPrice;
      const resolvedSl =
        typeof matchedSl?.triggerPrice === "number" && Number.isFinite(matchedSl.triggerPrice)
          ? matchedSl.triggerPrice
          : slPrice;
      if (tpEntry && (matchedTp || results.length === 0) && resolvedTp !== null) {
        applied.takeProfitPrice = resolvedTp;
      }
      if (slEntry && (matchedSl || results.length === 0) && resolvedSl !== null) {
        applied.stopLossPrice = resolvedSl;
      }
      if (resp.status === "success" || (resp.status === "partial" && failed.length === 0)) {
        toast.custom(() => (
          <SimpleToast
            type="success"
            title="TP/SL set"
            description={resp.message || `${entries.length} trigger(s) attached.`}
          />
        ));
        onSuccess?.(applied);
        onClose();
        return;
      }
      const failMsg = failed
        .map((r) => `${r.type.toUpperCase()}: ${r.error ?? "failed"}`)
        .join(" · ");
      toast.custom(() => (
        <SimpleToast
          type={resp.status === "partial" ? "info" : "error"}
          title={resp.status === "partial" ? "Partial success" : "TP/SL failed"}
          description={failMsg || resp.message || "Unknown error."}
        />
      ));
      if (resp.status === "partial") {
        onSuccess?.(applied);
        onClose();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      toast.custom(() => (
        <SimpleToast type="error" title="TP/SL failed" description={msg} />
      ));
    } finally {
      setLoading(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative z-10 flex w-full max-w-[440px] flex-col border border-[#0F1F30] bg-[#000D1E] sm:mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#0F1F30] px-5 py-4">
          <div className="flex flex-col">
            <h2 className="text-[18px] tracking-[-0.18px] text-white">
              Set TP / SL
            </h2>
            <span className="mt-0.5 text-[11px] tracking-tight text-[#7192A5]">
              {market} ·{" "}
              <span
                className={cn(
                  "font-medium",
                  position.direction === "long" ? "text-[#4ADE80]" : "text-[#FF6B6B]",
                )}
              >
                {position.direction.toUpperCase()}
              </span>
              {" · entry $"}
              {hasValidEntryPrice ? entryPrice.toFixed(4) : "N/A"}
              {(hadOnchainTp || hadOnchainSl) && (
                <>
                  <span className="mx-1 text-[#7192A5]">·</span>
                  <span className="text-[#7192A5]">Current </span>
                  <span className="text-[#4ADE80]">
                    TP {hadOnchainTp ? `$${initialTp!.toFixed(4)}` : "—"}
                  </span>
                  <span className="text-[#7192A5]"> / </span>
                  <span className="text-[#FF6B6B]">
                    SL {hadOnchainSl ? `$${initialSl!.toFixed(4)}` : "—"}
                  </span>
                </>
              )}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="cursor-pointer text-[#7192A5] transition-colors hover:text-white"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <TriggerSection
            label="Take Profit"
            accent="#4ADE80"
            type="tp"
            state={tp}
            onChange={setTp}
            direction={position.direction}
            entryPrice={entryPrice}
            entryPriceValid={hasValidEntryPrice}
            margin={margin}
            sizeAsset={sizeAsset}
            wasOnchain={hadOnchainTp}
          />
          <TriggerSection
            label="Stop Loss"
            accent="#FF6B6B"
            type="sl"
            state={sl}
            onChange={setSl}
            direction={position.direction}
            entryPrice={entryPrice}
            entryPriceValid={hasValidEntryPrice}
            margin={margin}
            sizeAsset={sizeAsset}
            wasOnchain={hadOnchainSl}
          />

          {clearedNotice && (
            <div className="border border-[#FFB45A]/30 bg-[#FFB45A]/10 px-3 py-2 text-[11px] tracking-tight text-[#FFB45A]">
              Clearing the input doesn&apos;t remove an existing on-chain trigger.
              {tpCleared && hadOnchainTp ? ` TP at $${initialTp!.toFixed(4)} stays attached.` : ""}
              {slCleared && hadOnchainSl ? ` SL at $${initialSl!.toFixed(4)} stays attached.` : ""}{" "}
              Re-enter a value to overwrite it, or close the position to clear.
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "font-ibm-plex-serif mt-2 flex h-10 w-full items-center justify-center gap-2 border border-[#BCEBFF]/8 text-[14px] tracking-[-0.14px] italic transition-all",
              !canSubmit
                ? "cursor-not-allowed bg-[#BCEBFF] text-[#000D1E] opacity-50"
                : "cursor-pointer bg-[#BCEBFF] text-[#000D1E] hover:bg-[#BCEBFF]/80",
            )}
          >
            {loading
              ? "Submitting…"
              : !hasValidEntryPrice
                ? "Entry price unavailable"
                : hasAny
                ? "Set triggers"
                : "Enter a TP or SL price to continue"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface TriggerSectionProps {
  label: string;
  accent: string;
  type: "tp" | "sl";
  state: TriggerState;
  onChange: (next: TriggerState) => void;
  direction: "long" | "short";
  entryPrice: number;
  entryPriceValid: boolean;
  margin: number | null;
  sizeAsset: number | null;
  wasOnchain: boolean;
}

function TriggerSection({
  label,
  accent,
  type,
  state,
  onChange,
  direction,
  entryPrice,
  entryPriceValid,
  margin,
  sizeAsset,
  wasOnchain,
}: TriggerSectionProps) {
  const hasValue = state.value.trim().length > 0;
  const error = entryPriceValid
    ? inputError(state, type, direction, entryPrice, margin, sizeAsset)
    : null;
  const warning =
    entryPriceValid && !error
      ? inputWarning(state, type, direction, entryPrice, margin, sizeAsset)
      : null;
  const preview = entryPriceValid
    ? previewCounterpart(state, type, direction, entryPrice, margin, sizeAsset)
    : "—";

  // Expected PnL in USDC — shown when we can compute it
  const resolvedPrice = entryPriceValid && hasValue && !error
    ? resolveTriggerPrice(state, type, direction, entryPrice, margin, sizeAsset)
    : null;
  const pnlUsd =
    resolvedPrice !== null && sizeAsset && sizeAsset > 0
      ? expectedPnlUsd(resolvedPrice, direction, entryPrice, sizeAsset)
      : null;

  const switchMode = (nextMode: InputMode) => {
    if (nextMode === state.mode) return;
    if (!hasValue || !entryPriceValid) {
      onChange({ ...state, mode: nextMode, value: "" });
      return;
    }
    const raw = parseFloat(state.value);
    if (!Number.isFinite(raw) || raw <= 0) {
      onChange({ ...state, mode: nextMode, value: "" });
      return;
    }
    if (nextMode === "price") {
      // % → $: compute absolute price from margin %
      if (!margin || !sizeAsset || margin <= 0 || sizeAsset <= 0) {
        onChange({ ...state, mode: nextMode, value: "" });
        return;
      }
      const priced = priceFromMarginPct(raw, type, direction, entryPrice, margin, sizeAsset);
      onChange({
        mode: "price",
        value: Number.isFinite(priced) && priced > 0 ? String(Number(priced.toFixed(6))) : "",
      });
      return;
    }
    // $ → %: convert absolute price to margin %
    if (!margin || !sizeAsset || margin <= 0 || sizeAsset <= 0) {
      onChange({ ...state, mode: nextMode, value: "" });
      return;
    }
    const pct = marginPctFromPrice(raw, type, direction, entryPrice, margin, sizeAsset);
    onChange({
      mode: "pct",
      value: Number.isFinite(pct) && pct > 0 ? String(Number(pct.toFixed(2))) : "",
    });
  };

  return (
    <div className="flex flex-col gap-2 border border-[#0F1F30] bg-[#041223] p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] tracking-tight" style={{ color: accent }}>
          {label}
          {wasOnchain && (
            <span className="rounded-sm border border-[#BCEBFF]/30 px-1 text-[9px] tracking-wider text-[#BCEBFF]">
              ON-CHAIN
            </span>
          )}
        </span>

        <div className="flex border border-[#0F1F30]">
          {(["pct", "price"] as InputMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={cn(
                "cursor-pointer px-2 py-[2px] text-[10px] tracking-tight transition-colors",
                state.mode === m
                  ? "bg-[#0F1F30] text-[#BCEBFF]"
                  : "text-[#7192A5] hover:text-[#BCEBFF]",
              )}
            >
              {m === "pct" ? "%" : "$"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex flex-1 items-center gap-1 border bg-[#02142B] px-2 py-1.5",
            error ? "border-[#FF6B6B]" : "border-[#0F1F30]",
          )}
        >
          <span className="text-sm text-[#7192A5]">
            {state.mode === "price" ? "$" : ""}
          </span>
          <input
            type="number"
            step="any"
            min="0"
            placeholder={state.mode === "pct" ? "20" : "0.00"}
            value={state.value}
            onChange={(e) => onChange({ ...state, value: e.target.value })}
            onKeyDown={(e) => {
              if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
            }}
            className="h-5 w-full bg-transparent text-sm font-medium text-white outline-none"
          />
          <span className="text-xs text-[#7192A5]">
            {state.mode === "pct" ? "%" : ""}
          </span>
          {hasValue && (
            <button
              type="button"
              onClick={() => onChange({ ...state, value: "" })}
              aria-label={`Clear ${label}`}
              className="ml-1 cursor-pointer text-[#7192A5] transition-colors hover:text-white"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {error ? (
        <span className="text-[11px] tracking-tight text-[#FF6B6B]">{error}</span>
      ) : warning ? (
        <span className="text-[11px] tracking-tight text-[#FFB45A]">{warning}</span>
      ) : hasValue && resolvedPrice !== null ? (
        <div className="flex items-center justify-between text-[11px] tracking-tight text-[#7192A5]">
          <span>{preview}</span>
          {pnlUsd !== null && (
            <span className={pnlUsd >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]"}>
              {pnlUsd >= 0 ? "+" : ""}{pnlUsd.toFixed(2)} USDC
            </span>
          )}
        </div>
      ) : (
        <span className="text-[11px] tracking-tight text-[#7192A5]">
          {state.mode === "pct" ? "% of margin" : "Leave blank to skip"}
        </span>
      )}
    </div>
  );
}

export default TpSlDialog;
