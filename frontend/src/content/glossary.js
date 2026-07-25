/**
 * eSIM glossary terms — original, traveler-oriented reference content
 * (blueprint §15.6). Indexable content that earns its page (unlike the
 * template country pages). `badge`: Core | Essential | New. `seeAlso`: term ids.
 */
export const GLOSSARY_TERMS = [
  { id: "apn", term: "APN", letter: "A", badge: "Core", seeAlso: ["mno"],
    definition: "Access Point Name. The setting that tells your device how to reach a mobile-data network. Travel eSIMs normally configure it for you, so you rarely need to change it." },
  { id: "esim", term: "eSIM", letter: "E", badge: "Essential", seeAlso: [],
    definition: "Embedded SIM. A SIM built into your device as software rather than a plastic card. You add a plan by downloading a profile, so there's nothing to insert or swap." },
  { id: "eid", term: "EID", letter: "E",
    definition: "Embedded Identifier. The permanent serial number of the eSIM chip inside your device. Dial *#06#, and if an EID appears your device can use an eSIM." },
  { id: "iccid", term: "ICCID", letter: "I",
    definition: "Integrated Circuit Card Identifier. The unique ID of a single SIM profile — physical or eSIM — that tells the network which plan is installed on your device." },
  { id: "imei", term: "IMEI", letter: "I",
    definition: "International Mobile Equipment Identity. A unique number that identifies your phone itself, separate from any SIM. Dial *#06# to see it." },
  { id: "lte", term: "LTE", letter: "L",
    definition: "Long-Term Evolution. The technical name for 4G mobile data — the fast, widely available standard most travel eSIMs use for browsing, maps, and streaming." },
  { id: "mno", term: "MNO", letter: "M",
    definition: "Mobile Network Operator. A company that owns the towers and radio network in a country. Your travel eSIM connects through these local operators abroad." },
  { id: "mvno", term: "MVNO", letter: "M",
    definition: "Mobile Virtual Network Operator. A mobile brand that sells service without owning towers, renting capacity from an operator instead. Many eSIM providers work this way." },
  { id: "roaming", term: "Roaming", letter: "R",
    definition: "Using a network other than your home carrier's while you travel. A travel eSIM gives you local data directly, so you skip your home carrier's roaming charges." },
  { id: "vpn", term: "VPN", letter: "V",
    definition: "Virtual Private Network. A tool that encrypts your connection and hides your location, adding privacy on public Wi-Fi and mobile data while you're away." },
  { id: "volte", term: "VoLTE", letter: "V", badge: "New",
    definition: "Voice over LTE. A way to place calls over a 4G network instead of older voice channels, giving clearer audio and quicker connections where it's supported." },
];

/** Group terms by their leading letter, in alphabetical order. */
export function groupTermsByLetter() {
  const byLetter = {};
  for (const t of GLOSSARY_TERMS) (byLetter[t.letter] ||= []).push(t);
  return Object.keys(byLetter)
    .sort()
    .map((letter) => ({ letter, terms: byLetter[letter] }));
}
