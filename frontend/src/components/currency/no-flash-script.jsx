import { BASE_CURRENCY, COUNTRY_TO_CURRENCY } from "@/config/currencies";

/**
 * Resolves the display currency before first paint.
 *
 * A synchronous, render-blocking script placed as the first child of `<body>`. It
 * sets `<html data-currency>`, which the CSS in `globals.css` uses to reveal one of
 * the sibling price spans. Running it after hydration instead would show USD first
 * and then visibly repaint every price on the page.
 *
 * Precedence here is the first two steps of the full chain:
 *
 *     explicit picker (cookie)  ->  country (locale)  ->  USD
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
var OK=${JSON.stringify(offered)},MAP=${JSON.stringify(COUNTRY_TO_CURRENCY)};
var ok=function(c){return !!c&&OK.indexOf(c)>-1};
var m=document.cookie.match(/(?:^|;)\\s*cur=([A-Z]{3})/);
if(m&&ok(m[1])){p=m[1]}
else{var r=(navigator.language||'').split('-')[1];
var c=r?MAP[r.toUpperCase()]:null;if(ok(c)){p=c}}
}catch(e){p=BASE}
d.setAttribute('data-currency',p);
})();`.replace(/\n/g, "");
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
