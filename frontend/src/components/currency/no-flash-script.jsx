import { BASE_CURRENCY, COUNTRY_TO_CURRENCY, DEFAULT_DISPLAY_CURRENCY } from "@/config/currencies";

/**
 * Resolves the display currency before first paint.
 *
 * A synchronous, render-blocking script placed as the first child of `<body>`. It
 * sets `<html data-currency>`, which the CSS in `globals.css` uses to reveal one of
 * the sibling price spans. Running it after hydration instead would show USD first
 * and then visibly repaint every price on the page.
 *
 * Precedence, highest first:
 *
 *     explicit picker (cookie)  ->  DEFAULT_DISPLAY_CURRENCY  ->  visitor locale  ->  USD
 *
 * The default sits ABOVE locale deliberately: the storefront sells to an Indian market
 * first, and the order is now charged in whatever is on screen — so the default also
 * decides which payment methods Stripe offers, and UPI exists only on INR. Locale
 * survives one step below as the fallback for when the default is not quoted. Each
 * step is gated on the currency actually being quoted, so an unavailable one falls
 * through instead of blanking every price on the page.
 *
 * The trade is real and worth stating: a visitor in the US now sees rupees until they
 * touch the picker. Move DEF back below the locale branch to reverse it.
 *
 * The account's `preferred_currency` sits between those two but needs an authenticated
 * request, so it cannot run before paint. `AccountCurrencySync` applies it after
 * hydration, and only when the visitor has never used the picker.
 *
 * `offered` is the currency list the backend is actually quoting. A currency whose
 * rate has gone stale is withdrawn, and a cookie naming it must be ignored rather
 * than honoured — otherwise a returning visitor sees a price in a currency we will
 * not charge, or an empty gap where the price should be.
 */
export function NoFlashCurrencyScript({ offered = [BASE_CURRENCY] }) {
  const js = `(function(){
var d=document.documentElement,BASE=${JSON.stringify(BASE_CURRENCY)},p=BASE;
try{
var OK=${JSON.stringify(offered)},MAP=${JSON.stringify(COUNTRY_TO_CURRENCY)},DEF=${JSON.stringify(DEFAULT_DISPLAY_CURRENCY)};
var ok=function(c){return !!c&&OK.indexOf(c)>-1};
var r=(navigator.language||'').split('-')[1];
var c=r?MAP[r.toUpperCase()]:null;if(ok(c)){p=c}
if(ok(DEF)){p=DEF}
var m=document.cookie.match(/(?:^|;)\\s*cur=([A-Z]{3})/);
if(m&&ok(m[1])){p=m[1]}
}catch(e){p=BASE}
d.setAttribute('data-currency',p);
})();`.replace(/\n/g, "");
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
