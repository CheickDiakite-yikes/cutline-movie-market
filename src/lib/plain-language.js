const SCORE_BANDS = [
  { minimum: 75, label: "STRONG HISTORY", phrase: "a strong history" },
  { minimum: 65, label: "A LITTLE PROMISING", phrase: "a little promising" },
  { minimum: 55, label: "ABOUT AVERAGE", phrase: "about average" },
  { minimum: 0, label: "WEAK HISTORY", phrase: "weaker than average" },
];

export function explainScore(value, kind = "history") {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return {
      label: kind === "live" ? "NOT CONNECTED" : "NOT ENOUGH INFO",
      phrase: "not enough information yet",
    };
  }
  const numeric = Number(value);
  if (kind === "coverage") {
    if (numeric >= 80) return { label: "WE KNOW A LOT", phrase: "we have most of the background information" };
    if (numeric >= 60) return { label: "WE KNOW ENOUGH", phrase: "we have enough background information for a first look" };
    return { label: "IMPORTANT GAPS", phrase: "important background information is missing" };
  }
  return SCORE_BANDS.find((band) => numeric >= band.minimum);
}

export function plainScoreLabel(kind) {
  return {
    historical: "Similar movies",
    live: "Current buzz",
    talent: "Cast + crew",
    coverage: "How much we know",
  }[kind] || kind;
}

export function plainFactorLabel(label) {
  const value = String(label || "").toLowerCase();
  if (value.includes("director")) return "The director's past movies";
  if (value.includes("producer")) return "The producers' past movies";
  if (value.includes("lead cast") || value.includes("cast")) return "The cast's past movies";
  if (value.includes("franchise") || value.includes("title-family")) return "Earlier movies with a related title";
  if (value.includes("genre")) return "Movies with a similar style";
  if (value.includes("september") || value.includes("month") || value.includes("timing")) return "Movies released around the same time";
  if (value.includes("baseline")) return "Movies overall";
  if (value.includes("artwork")) return "Movie artwork";
  if (value.includes("identity")) return "We found the right movie";
  if (value.includes("release")) return "We found the release date";
  if (value.includes("kalshi")) return "The live market price";
  if (value.includes("rotten tomatoes")) return "Past critic scores";
  if (value.includes("trailer")) return "Trailer interest";
  if (value.includes("search")) return "Search interest";
  if (value.includes("social")) return "Social media talk";
  return label;
}

export function plainFactorDetail(factor) {
  const sample = factor?.sampleSize;
  const count = Number.isFinite(Number(sample)) ? Number(sample) : null;
  const value = String(factor?.label || "").toLowerCase();
  if (value.includes("kalshi")) return "The current market price is connected and checked while Cutline is open.";
  if (value.includes("rotten tomatoes")) return count == null
    ? "Past critic results are not connected yet."
    : `We found ${count} past critic result${count === 1 ? "" : "s"}, but not enough match cleanly to make a prediction.`;
  if (value.includes("trailer")) return "Trailer interest is not connected yet.";
  if (value.includes("search")) return "Search interest is not connected yet.";
  if (value.includes("social")) return "Social media talk is not connected yet.";
  if (value.includes("identity")) return count ? "Cutline matched the market to one movie record." : "Cutline has not matched the market to the right movie yet.";
  if (value.includes("release")) return count ? "Cutline found the movie's release date." : "The movie's release date is missing.";
  if (value.includes("artwork")) return count ? "Cutline found artwork for this movie." : "Artwork for this movie is missing.";
  if (count === 0) return "We do not have a reliable past example for this clue yet.";
  if (count === null) return "This clue is not connected yet.";
  if (value.includes("director")) return `We checked ${count} earlier movie${count === 1 ? "" : "s"} from this director.`;
  if (value.includes("producer")) return `We checked ${count} earlier movie${count === 1 ? "" : "s"} from the credited producers.`;
  if (value.includes("cast")) return `We checked ${count} earlier movie${count === 1 ? "" : "s"} featuring the named cast.`;
  if (value.includes("franchise") || value.includes("title-family")) return `We found ${count} earlier movie${count === 1 ? "" : "s"} with a related title.`;
  if (value.includes("genre")) return `We compared this with ${count} movie${count === 1 ? "" : "s"} that share its style.`;
  if (value.includes("september") || value.includes("month") || value.includes("timing")) return `We checked ${count} movie${count === 1 ? "" : "s"} released around the same time of year.`;
  return `This clue uses ${count} past example${count === 1 ? "" : "s"}.`;
}
