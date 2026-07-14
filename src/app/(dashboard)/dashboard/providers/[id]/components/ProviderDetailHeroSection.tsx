"use client";

import Image from "next/image";
import Link from "next/link";
import ProviderIcon from "@/shared/components/ProviderIcon";

interface ProviderDetailHeroSectionProps {
  t: (key: string, params?: Record<string, unknown>) => string;
  providerInfo: {
    color?: string;
    textIcon?: string;
    id: string;
    apiType?: string;
    name: string;
    website?: string;
  };
  providerId: string;
  connections: unknown[];
  isOpenAICompatible: boolean;
  isAnthropicProtocolCompatible: boolean;
  headerImgError: boolean;
  setHeaderImgError: (val: boolean) => void;
}

export function ProviderDetailHeroSection({
  t,
  providerInfo,
  providerId: _providerId,
  connections,
  isOpenAICompatible,
  isAnthropicProtocolCompatible,
  headerImgError,
  setHeaderImgError,
}: ProviderDetailHeroSectionProps) {
  const headerIconTextFallback = (
    // No `dark:!text-foreground` here: `--color-foreground` now exists (the chat's
    // markdown renderer needs it), and an !important rule beats the inline style —
    // which would drop the provider's brand colour to grey in dark mode.
    <span className="text-lg font-bold" style={{ color: providerInfo.color }}>
      {providerInfo.textIcon || providerInfo.id.slice(0, 2).toUpperCase()}
    </span>
  );

  return (
    <div>
      <Link
        href="/dashboard/providers"
        className="group mb-6 inline-flex items-center gap-2 text-sm font-medium text-text-muted transition-colors duration-200 hover:text-primary"
      >
        <span className="material-symbols-outlined text-lg transition-transform duration-200 group-hover:-translate-x-0.5">
          arrow_back
        </span>
        {t("backToProviders")}
      </Link>
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-surface via-surface to-bg-subtle/35 p-6 shadow-sm ring-1 ring-black/[0.03] dark:to-white/[0.03] dark:ring-white/[0.06] sm:p-8">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-[0.12] blur-3xl"
          style={{ backgroundColor: providerInfo.color }}
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
          <div className="flex shrink-0 justify-center sm:justify-start">
            <div className="relative">
              <div
                className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl ring-2 ring-black/[0.04] dark:ring-white/[0.08]"
                style={{ backgroundColor: `${providerInfo.color}18` }}
              >
                {isOpenAICompatible && providerInfo.apiType ? (
                  headerImgError ? (
                    headerIconTextFallback
                  ) : (
                    <Image
                      src={
                        providerInfo.apiType === "responses"
                          ? "/providers/oai-r.png"
                          : "/providers/oai-cc.png"
                      }
                      alt={providerInfo.name}
                      width={48}
                      height={48}
                      className="max-h-[48px] max-w-[48px] rounded-lg object-contain"
                      sizes="48px"
                      onError={() => setHeaderImgError(true)}
                    />
                  )
                ) : isAnthropicProtocolCompatible ? (
                  headerImgError ? (
                    headerIconTextFallback
                  ) : (
                    <Image
                      src="/providers/anthropic-m.png"
                      alt={providerInfo.name}
                      width={48}
                      height={48}
                      className="max-h-[48px] max-w-[48px] rounded-lg object-contain"
                      sizes="48px"
                      onError={() => setHeaderImgError(true)}
                    />
                  )
                ) : (
                  <ProviderIcon
                    providerId={providerInfo.id}
                    size={48}
                    type="color"
                    className="text-foreground"
                  />
                )}
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            {providerInfo.website ? (
              <a
                href={providerInfo.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 text-2xl font-semibold tracking-tight hover:underline sm:justify-start sm:text-3xl dark:!text-foreground"
                style={{ color: providerInfo.color }}
              >
                {providerInfo.name}
                <span className="material-symbols-outlined text-xl opacity-60 dark:opacity-70">
                  open_in_new
                </span>
              </a>
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {providerInfo.name}
              </h1>
            )}
            <p className="mt-1 text-sm text-text-muted">
              {t("connectionCountLabel", { count: connections.length })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
