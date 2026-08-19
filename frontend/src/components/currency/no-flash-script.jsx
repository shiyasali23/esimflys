import {
  BASE_CURRENCY,
  COUNTRY_TO_CURRENCY,
  DEFAULT_DISPLAY_CURRENCY,
  TIMEZONE_TO_CURRENCY,
} from "@/config/currencies";

/**
 * Resolves the display currency before first paint.
 *
 * A synchronous, render-blocking script placed as the first child of `<body>`. It sets
 * `<html data-currency>`, which the CSS in `globals.css` uses to reveal one of the sibling
 * price spans. Running it after hydration instead would show one currency and then visibly
 * repaint every price on the page.
 *
 * Precedence, highest first:
 *
 *     explicit picker (cookie) -> timezone -> visitor locale -> DEFAULT -> USD
 *
 * THIS ORDER CHANGED. `DEFAULT_DISPLAY_CURRENCY` used to sit ABOVE both detection steps and
 * overwrite them unconditionally, so the locale branch ran, produced the right answer, and
 * had it discarded on the very next line. Every visitor on earth was served INR — reported
 * from Germany (expected EUR) and London (expected GBP), and reproduced by simulating the
 * deployed script across six locales: de-DE, en-GB, en-US, fr-FR and ja-JP all resolved INR.
 *
 * The original reasoning was that the order is charged in whatever is on screen, so the
 * default also decides which payment methods Stripe offers, and UPI exists only on INR.
 * That is true, but forcing INR globally was the wrong instrument: `Asia/Kolkata` maps to
 * INR, so Indian visitors keep INR and keep UPI without imposing it on everyone else.
 * DEFAULT is now the FALLBACK it was described as — what a visitor sees when nothing better
 * is known — rather than an override.
 *
 * Timezone leads because `navigator.language` is a LANGUAGE, not a place: an English
 * browser in Berlin reports `en-US` or `en-GB` and would be sent to dollars or pounds.
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` says `Europe/Berlin`. Both signals are
 * kept — locale still catches a visitor whose timezone is unmapped.
 *
 * Each step is gated on the currency actually being quoted, so an unavailable one falls
 * through instead of blanking every price on the page.
 *
 * The account's `preferred_currency` sits above both detection signals but needs an
 * authenticated request, so it cannot run before paint. `AccountCurrencySync` applies it
 * after hydration, and only when the visitor has never used the picker.
 *
 * `offered` is the currency list the backend is actually quoting. A currency whose rate has
 * gone stale is withdrawn, and a cookie naming it must be ignored rather than honoured —
 * otherwise a returning visitor sees a price in a currency we will not charge, or an empty
 * gap where the price should be.
 */
export function NoFlashCurrencyScript({ offered = [BASE_CURRENCY] }) {
  const js = `(function(){
var d=document.documentElement,BASE=${JSON.stringify(BASE_CURRENCY)},p=BASE;
try{
var OK=${JSON.stringify(offered)},MAP=${JSON.stringify(COUNTRY_TO_CURRENCY)},TZ=${JSON.stringify(TIMEZONE_TO_CURRENCY)},DEF=${JSON.stringify(DEFAULT_DISPLAY_CURRENCY)};
var ok=function(c){return !!c&&OK.indexOf(c)>-1};
if(ok(DEF)){p=DEF}
var r=(navigator.language||'').split('-')[1];
var c=r?MAP[r.toUpperCase()]:null;if(ok(c)){p=c}
var z=null;try{z=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){z=null}
var t=z?TZ[z]:null;if(ok(t)){p=t}
var m=document.cookie.match(/(?:^|;)\\s*cur=([A-Z]{3})/);
if(m&&ok(m[1])){p=m[1]}
}catch(e){p=BASE}
d.setAttribute('data-currency',p);
})();`.replace(/\n/g, "");
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
