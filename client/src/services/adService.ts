/**
 * adService — rewarded ad abstraction
 *
 * Supported providers (VITE_AD_PROVIDER in .env):
 *   'auto'   — auto-detect by user locale (default):
 *                RU/CIS → Yandex YAN
 *                other  → Google IMA
 *   'ima'    — Google IMA SDK (VAST/VPAID rewarded video)
 *   'yandex' — Yandex Advertising Network (YAN) rewarded
 *   'dev'    — simulated 3-second countdown (no network calls)
 *
 * Flow:
 *   showRewardedAd()
 *     → resolves  on reward earned  (ad watched fully)
 *     → rejects   on skip / error   (no reward)
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** 'auto' = detect by locale; resolved to ima/yandex/dev at startup */
type AdProviderInput = 'auto' | 'ima' | 'yandex' | 'dev';
export type AdProvider = 'ima' | 'yandex' | 'dev';

export interface AdResult {
  rewarded: boolean;
}

// ── Config ───────────────────────────────────────────────────────────────────

/**
 * Google IMA: your Ad Tag URL from Google Ad Manager.
 * Get it at: https://admanager.google.com → Inventory → Ad units → Rewarded
 */
const IMA_AD_TAG_URL = import.meta.env.VITE_IMA_AD_TAG_URL as string | undefined;

/**
 * Yandex Advertising Network: your block ID.
 * Get it at: https://partner.yandex.ru → Sites → Ad blocks → Rewarded Video
 */
const YANDEX_BLOCK_ID = import.meta.env.VITE_YANDEX_BLOCK_ID as string | undefined;

/** RU/CIS locales that should get Yandex ads */
const RU_LOCALES = new Set(['ru', 'uk', 'be', 'kk', 'uz', 'az', 'hy', 'ka']);

function detectProvider(): AdProvider {
  // Explicit override always wins (set VITE_AD_PROVIDER=ima|yandex|dev to force)
  const override = import.meta.env.VITE_AD_PROVIDER as AdProviderInput | undefined;
  if (override && override !== 'auto') return override;

  // Telegram Mini App passes user language via initDataUnsafe
  const tgLang = (window as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } } })
    .Telegram?.WebApp?.initDataUnsafe?.user?.language_code;

  // Fall back to browser locale
  const lang = (tgLang ?? navigator.language ?? 'en').toLowerCase().split(/[-_]/)[0];

  if (RU_LOCALES.has(lang)) {
    return YANDEX_BLOCK_ID ? 'yandex' : 'dev';
  }
  return IMA_AD_TAG_URL ? 'ima' : 'dev';
}

const PROVIDER: AdProvider = detectProvider();

// ── Main export ───────────────────────────────────────────────────────────────

export function showRewardedAd(): Promise<AdResult> {
  switch (PROVIDER) {
    case 'ima':    return showImaAd();
    case 'yandex': return showYandexAd();
    default:       return showDevAd();
  }
}

// ── Google IMA SDK ────────────────────────────────────────────────────────────
//
//  Docs: https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side
//
//  Requires in index.html:
//    <script src="https://imasdk.googleapis.com/js/sdkloader/ima3.js"></script>
//  And a hidden container:
//    <div id="ad-container" style="display:none;position:fixed;inset:0;z-index:9999;background:#000;"></div>
//    <video id="ad-video" style="width:100%;height:100%;"></video>  <!-- inside #ad-container -->

declare global {
  interface Window {
    google?: {
      ima: {
        AdDisplayContainer: new (container: HTMLElement, videoElement: HTMLVideoElement) => {
          initialize(): void;
        };
        AdsLoader: new (container: unknown) => {
          addEventListener(event: string, handler: (e: unknown) => void, capture: boolean): void;
          requestAds(request: unknown): void;
          contentComplete(): void;
        };
        AdsRequest: new () => {
          adTagUrl: string;
          linearAdSlotWidth: number;
          linearAdSlotHeight: number;
          nonLinearAdSlotWidth: number;
          nonLinearAdSlotHeight: number;
        };
        AdErrorEvent: { Type: { AD_ERROR: string } };
        AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: string } };
        AdEvent: { Type: { ALL_ADS_COMPLETED: string; SKIPPED: string; USER_CLOSE: string } };
      };
    };
    Ya?: {
      adfoxCode?: {
        createAdaptive(params: {
          ownerId: number;
          containerId: string;
          params: Record<string, string>;
          onRender?: () => void;
          onError?: () => void;
        }): void;
      };
    };
  }
}

function showImaAd(): Promise<AdResult> {
  return new Promise((resolve, reject) => {
    const ima = window.google?.ima;
    if (!ima) {
      console.warn('[adService] Google IMA SDK not loaded, falling back to dev mode');
      return showDevAd().then(resolve).catch(reject);
    }
    if (!IMA_AD_TAG_URL) {
      console.warn('[adService] VITE_IMA_AD_TAG_URL not set, falling back to dev mode');
      return showDevAd().then(resolve).catch(reject);
    }

    const container  = document.getElementById('ad-container') as HTMLElement;
    const videoEl    = document.getElementById('ad-video') as HTMLVideoElement;
    if (!container || !videoEl) {
      console.warn('[adService] #ad-container or #ad-video not found');
      return reject(new Error('Ad container missing'));
    }

    container.style.display = 'block';

    const adDisplayContainer = new ima.AdDisplayContainer(container, videoEl);
    adDisplayContainer.initialize();

    const adsLoader = new ima.AdsLoader(adDisplayContainer);

    const cleanup = () => { container.style.display = 'none'; };

    // Ad error
    adsLoader.addEventListener(
      ima.AdErrorEvent.Type.AD_ERROR,
      () => { cleanup(); reject(new Error('IMA ad error')); },
      false,
    );

    // Ads manager loaded
    adsLoader.addEventListener(
      ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
      (evt: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = evt as any;
        const adsManager = e.getAdsManager(videoEl);

        let rewarded = false;

        adsManager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => {
          cleanup();
          resolve({ rewarded });
        });

        adsManager.addEventListener(ima.AdEvent.Type.SKIPPED, () => {
          rewarded = false;
        });

        // When the ad finishes fully (before skip) — grant reward
        adsManager.addEventListener('complete', () => { rewarded = true; });

        try {
          adsManager.init(window.innerWidth, window.innerHeight, 2 /* NORMAL */);
          adsManager.start();
        } catch {
          cleanup();
          reject(new Error('adsManager.start() failed'));
        }
      },
      false,
    );

    const adsRequest = new ima.AdsRequest();
    adsRequest.adTagUrl = IMA_AD_TAG_URL;
    adsRequest.linearAdSlotWidth    = window.innerWidth;
    adsRequest.linearAdSlotHeight   = window.innerHeight;
    adsRequest.nonLinearAdSlotWidth  = window.innerWidth;
    adsRequest.nonLinearAdSlotHeight = 150;

    adsLoader.requestAds(adsRequest);
  });
}

// ── Yandex Advertising Network ────────────────────────────────────────────────
//
//  Docs: https://yandex.ru/dev/mobile-ads/doc/ru/web/rewarded
//
//  Requires index.html:
//    <script src="https://yandex.ru/ads/system/context.js"></script>
//  And a hidden container:
//    <div id="ya-ad-container" style="display:none;position:fixed;inset:0;z-index:9999;"></div>

function showYandexAd(): Promise<AdResult> {
  return new Promise((resolve, reject) => {
    if (!YANDEX_BLOCK_ID) {
      console.warn('[adService] VITE_YANDEX_BLOCK_ID not set, falling back to dev mode');
      return showDevAd().then(resolve).catch(reject);
    }

    const container = document.getElementById('ya-ad-container') as HTMLElement | null;
    if (!container) {
      console.warn('[adService] #ya-ad-container not found');
      return reject(new Error('Yandex ad container missing'));
    }

    container.style.display = 'block';
    container.innerHTML = '';

    const containerId = 'ya-rewarded-' + Date.now();
    const innerDiv = document.createElement('div');
    innerDiv.id = containerId;
    container.appendChild(innerDiv);

    const cleanup = () => {
      container.style.display = 'none';
      container.innerHTML = '';
    };

    window.Ya?.adfoxCode?.createAdaptive({
      ownerId: Number(YANDEX_BLOCK_ID.split('/')[0]),
      containerId,
      params: {
        pp: 'h',
        ps: YANDEX_BLOCK_ID,
        p2: 'jddo', // replace with your actual p2 value from Yandex
      },
      onRender: () => {
        // Yandex doesn't have a native reward callback in this API.
        // For true rewarded video use Yandex Mobile Ads SDK (native apps)
        // or treat render+close as reward for web.
        const timer = setTimeout(() => {
          cleanup();
          resolve({ rewarded: true });
        }, 5000); // assume user watched for 5s

        const observer = new MutationObserver(() => {
          const closed = !document.getElementById(containerId);
          if (closed) { clearTimeout(timer); observer.disconnect(); cleanup(); resolve({ rewarded: true }); }
        });
        observer.observe(container, { childList: true, subtree: true });
      },
      onError: () => {
        cleanup();
        reject(new Error('Yandex ad failed to load'));
      },
    });
  });
}

// ── Dev / simulation ──────────────────────────────────────────────────────────

function showDevAd(): Promise<AdResult> {
  return new Promise((resolve) => {
    // In dev mode we just wait 3 seconds to simulate an ad
    setTimeout(() => resolve({ rewarded: true }), 3000);
  });
}
