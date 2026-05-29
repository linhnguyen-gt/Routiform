"use client";

import React, { useEffect, useState } from "react";

import type { CooldownTimerProps } from "../[id]/types";
import {
  formatCooldownUnlockTime,
  getCooldownRemainingLabel,
} from "../providerDetailCooldownUtils";

export function ProviderDetailCooldownTimer({
  until,
}: CooldownTimerProps): React.JSX.Element | null {
  const [remaining, setRemaining] = useState("");
  const unlockTime = formatCooldownUnlockTime(until);

  useEffect(() => {
    const updateRemaining = () => {
      setRemaining(getCooldownRemainingLabel(until));
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [until]);

  if (!remaining) return null;

  return (
    <span
      className="text-xs text-orange-500 font-mono"
      title={unlockTime ? `Unlocks at ${unlockTime}` : undefined}
    >
      ⏱ {remaining}
      {unlockTime ? ` · unlocks ${unlockTime}` : ""}
    </span>
  );
}
