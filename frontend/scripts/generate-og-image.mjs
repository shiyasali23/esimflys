/**
 * Generates the site-wide Open Graph card at public/og-card.png (1200x630).
 *
 * A manual tool, like generate-catalog.mjs — the build must never run it. The PNG it
 * produces is committed, because `output: "export"` has no runtime for `ImageResponse`
 * to render an OG image on demand.
 *
 * It lives in public/ rather than as an `app/opengraph-image.png` file convention on
 * purpose. Next attaches the file-convention image to the segment that declares it, and a
 * page-level `openGraph` object REPLACES the parent's wholesale — so with the convention,
 * og:image reached only the three routes that declare no openGraph of their own (measured:
 * 3 of 126 pages). A fixed public URL can be referenced explicitly from both the root
 * layout and buildMetadata, which is predictable and has no build hash in it.
 *
 * Why this exists at all: every page declared `twitter:card=summary_large_image` while
 * og:image was present on 0 of 127 emitted pages, so every share on X, LinkedIn, Slack,
 * WhatsApp and iMessage reserved a large image slot and rendered nothing.
 *
 * The country count is read from the catalogue rather than typed, so the card cannot
 * drift into claiming coverage the shop does not have.
 *
 * Run: node scripts/generate-og-image.mjs
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";

const catalog = JSON.parse(readFileSync(new URL("../src/data/catalog.json", import.meta.url)));
const { countryCount } = catalog.meta;

const W = 1200;
const H = 630;
const INDIGO = "#615de5";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#eef0ff"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.15" r="0.6">
      <stop offset="0%" stop-color="${INDIGO}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${INDIGO}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="10" fill="${INDIGO}"/>
  <text x="90" y="250" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="96" font-weight="700" fill="#12121a" letter-spacing="-2">eSIMFlys</text>
  <text x="90" y="330" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="44" font-weight="600" fill="${INDIGO}">Instant Travel eSIM Data</text>
  <text x="90" y="400" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="30" font-weight="400" fill="#4a4a57">Prepaid data-only eSIMs for ${countryCount} countries.</text>
  <text x="90" y="444" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="30" font-weight="400" fill="#4a4a57">Scan a QR code and connect on arrival.</text>
  <text x="90" y="548" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="26" font-weight="600" fill="#7a7a88">esimflys.com</text>
</svg>`;

const logo = await sharp(new URL("../public/icons/logo-512.png", import.meta.url).pathname)
  .resize(190, 190, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer();

const out = new URL("../public/og-card.png", import.meta.url).pathname;
await sharp(Buffer.from(svg))
  .composite([{ input: logo, top: 220, left: 920 }])
  .png({ compressionLevel: 9 })
  .toFile(out);

const meta = await sharp(out).metadata();
console.log(`wrote ${out} (${meta.width}x${meta.height})`);
