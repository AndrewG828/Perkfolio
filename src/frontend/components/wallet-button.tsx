"use client";

import { Check, Plus } from "lucide-react";
import { useWallet, walletActions } from "@/frontend/state/wallet-store";
import { cn } from "@/shared/lib/format";

export function WalletButton({ cardId, compact = false }: { cardId: string; compact?: boolean }) {
  const wallet = useWallet();
  const owned = wallet.cards.includes(cardId);
  return (
    <button
      type="button"
      onClick={() => walletActions.toggleCard(cardId)}
      className={cn(owned ? "btn-secondary" : "btn-secondary", compact && "px-3")}
      aria-pressed={owned}
      title={owned ? "Remove from my wallet" : "Add to my wallet"}
    >
      {owned ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      {owned ? "In wallet" : compact ? "I have this" : "Add to my wallet"}
    </button>
  );
}
