/**
 * Synchronous, render-blocking inline script placed as the FIRST child of <body>.
 * It sets <html data-currency> from the `cur` cookie (or an edge-provided default)
 * BEFORE the price nodes paint, so the correct currency shows on first paint with
 * no flicker (blueprint §28.8). Kept tiny and dependency-free.
 */
export function NoFlashCurrencyScript() {
  const js =
    "(function(){try{var m=document.cookie.match(/(?:^|;)\\s*cur=([A-Z]{3})/);" +
    "var c=m?m[1]:(window.__DEFAULT_CUR__||'USD');" +
    "document.documentElement.setAttribute('data-currency',c);}" +
    "catch(e){document.documentElement.setAttribute('data-currency','USD');}})();";
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
