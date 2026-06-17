// Map team name -> ISO 3166-1 alpha-2 code, then to flag emoji.
// Backed by i18n-iso-countries (covers every country in the world),
// with FIFA / common-name overrides on top.
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";

countries.registerLocale(enLocale);

const OVERRIDES: Record<string, string> = {
  // FIFA / common naming quirks that the ISO library doesn't resolve.
  "USA": "US",
  "England": "GB-ENG",
  "Wales": "GB-WLS",
  "Scotland": "GB-SCT",
  "Northern Ireland": "GB-NIR",
  "Republic of Ireland": "IE",
  "Korea Republic": "KR",
  "South Korea": "KR",
  "Korea DPR": "KP",
  "North Korea": "KP",
  "IR Iran": "IR",
  "Iran": "IR",
  "Türkiye": "TR",
  "Turkiye": "TR",
  "Ivory Coast": "CI",
  "Côte d'Ivoire": "CI",
  "Cote d'Ivoire": "CI",
  "DR Congo": "CD",
  "Congo DR": "CD",
  "Cape Verde": "CV",
  "Cabo Verde": "CV",
  "Curaçao": "CW",
  "Curacao": "CW",
  "UAE": "AE",
  "Czechia": "CZ",
  "Czech Republic": "CZ",
  "Russia": "RU",
  "Vietnam": "VN",
  "Syria": "SY",
  "Laos": "LA",
  "Moldova": "MD",
  "Tanzania": "TZ",
  "Bolivia": "BO",
  "Venezuela": "VE",
  "Palestine": "PS",
  "Taiwan": "TW",
  "Chinese Taipei": "TW",
  "Hong Kong": "HK",
  "Macau": "MO",
  "Macao": "MO",
  "Brunei": "BN",
  "Eswatini": "SZ",
  "Swaziland": "SZ",
  "North Macedonia": "MK",
  "Macedonia": "MK",
  "East Timor": "TL",
  "Timor-Leste": "TL",
  "St Kitts and Nevis": "KN",
  "St Lucia": "LC",
  "St Vincent and the Grenadines": "VC",
  "Antigua and Barbuda": "AG",
  "Trinidad and Tobago": "TT",
  "Bosnia-Herzegovina": "BA",
  "Kosovo": "XK",
};

function lookupIso(team: string): string | undefined {
  const name = team.trim();
  if (OVERRIDES[name]) return OVERRIDES[name];
  const code = countries.getAlpha2Code(name, "en");
  return code || undefined;
}

const SUBDIVISION_FLAG: Record<string, string> = {
  // Tag sequence flags for England/Scotland/Wales
  "GB-ENG": "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  "GB-SCT": "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
  "GB-WLS": "\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}",
  "GB-NIR": "\u{1F1EC}\u{1F1E7}",
};

export function flagFor(team: string): string {
  const code = lookupIso(team);
  if (!code) return "";
  if (SUBDIVISION_FLAG[code]) return SUBDIVISION_FLAG[code];
  if (code.length !== 2) return "";
  const A = 0x1f1e6;
  const a = "A".charCodeAt(0);
  return String.fromCodePoint(A + (code.charCodeAt(0) - a), A + (code.charCodeAt(1) - a));
}