import { getCountries, getCountryCallingCode } from "libphonenumber-js/min";

export interface SearchableOption {
  value: string;
  label: string;
  selectedLabel?: string;
  keywords?: string[];
}

export const UNITED_STATES = "United States";
export const CANADA = "Canada";

export const TITLE_OPTIONS = ["Mr", "Ms", "Mrs", "Mx"].map((title) => ({ value: title, label: title }));

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

const countries = getCountries()
  .map((code) => ({
    code,
    name: regionNames.of(code) ?? code,
    dialCode: `+${getCountryCallingCode(code)}`,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const PRIORITY_COUNTRIES = [UNITED_STATES, CANADA];

const byPriority = <T extends { name: string }>(items: T[]): T[] => [
  ...PRIORITY_COUNTRIES.flatMap((name) => items.filter((item) => item.name === name)),
  ...items.filter((item) => !PRIORITY_COUNTRIES.includes(item.name)),
];

export const COUNTRY_OPTIONS: SearchableOption[] = byPriority(countries).map((country) => ({
  value: country.name,
  label: country.name,
  keywords: [country.code],
}));

const dialCodeGroups = new Map<string, string[]>();
for (const country of byPriority(countries)) {
  dialCodeGroups.set(country.dialCode, [...(dialCodeGroups.get(country.dialCode) ?? []), country.name]);
}

export const PHONE_CODE_OPTIONS: SearchableOption[] = [...dialCodeGroups.entries()].map(([dialCode, names]) => ({
  value: dialCode,
  label: `${dialCode} ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` and ${names.length - 2} more` : ""}`,
  selectedLabel: dialCode,
  keywords: names,
}));

const US_STATES: SearchableOption[] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"],
  ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"],
  ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"],
  ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"],
  ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"],
  ["WY", "Wyoming"], ["AS", "American Samoa"], ["GU", "Guam"], ["MP", "Northern Mariana Islands"],
  ["PR", "Puerto Rico"], ["VI", "U.S. Virgin Islands"],
].map(([code, name]) => ({ value: code, label: `${name} (${code})`, selectedLabel: code, keywords: [name] }));

const CANADIAN_PROVINCES: SearchableOption[] = [
  ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"],
  ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"], ["NT", "Northwest Territories"], ["NU", "Nunavut"],
  ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"], ["SK", "Saskatchewan"], ["YT", "Yukon"],
].map(([code, name]) => ({ value: code, label: `${name} (${code})`, selectedLabel: code, keywords: [name] }));

export const getStateOptions = (country: string): SearchableOption[] | null => {
  if (country === UNITED_STATES) return US_STATES;
  if (country === CANADA) return CANADIAN_PROVINCES;
  return null;
};
