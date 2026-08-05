// Curated crisis hotlines keyed by ISO-3166 alpha-2 country code. Therry and
// crisis flows surface these resources to users in crisis. Keep this list
// current and region-accurate; unknown regions get a safe global fallback.

const HOTLINES = {
  US: [
    {
      name: "988 Suicide & Crisis Lifeline",
      phone: "988",
      website: "https://988lifeline.org",
    },
    {
      name: "Crisis Text Line",
      phone: "Text HOME to 741741",
      website: "https://www.crisistextline.org",
    },
  ],
  CA: [
    {
      name: "Talk Suicide Canada",
      phone: "1-833-456-4566",
      website: "https://talksuicide.ca",
    },
    {
      name: "Kids Help Phone",
      phone: "1-800-668-6868",
      website: "https://kidshelpphone.ca",
    },
  ],
  UK: [
    {
      name: "Samaritans",
      phone: "116 123",
      website: "https://www.samaritans.org",
    },
    {
      name: "Shout 85258 (Crisis Text Line UK)",
      phone: "Text SHOUT to 85258",
      website: "https://giveusashout.org",
    },
  ],
  AU: [
    {
      name: "Lifeline Australia",
      phone: "13 11 14",
      website: "https://www.lifeline.org.au",
    },
    {
      name: "Beyond Blue",
      phone: "1300 22 4636",
      website: "https://www.beyondblue.org.au",
    },
  ],
};

const FALLBACK = [
  {
    name: "988 Suicide & Crisis Lifeline (US)",
    phone: "988",
    website: "https://988lifeline.org",
  },
  {
    name: "International Association for Suicide Prevention",
    phone: null,
    website: "https://www.iasp.info",
  },
];

export const getHotlinesForCountry = (countryCode) => {
  const code = (countryCode || "US").toUpperCase();
  return HOTLINES[code] || FALLBACK;
};
