const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "part",
  "the",
  "to",
  "versus",
  "vs",
  "with",
]);

const rounded = (value) => Math.round(value * 10) / 10;

export function titleFamilyKey(value) {
  const words = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word) && !/^\d+$/.test(word));
  return words[0] || "";
}

const weightedScore = (factors) => rounded(
  factors.reduce((total, item) => total + item.value * item.weight / 100, 0),
);

const factor = ({ label, value, weight, sampleSize, detail, titles = [], status }) => ({
  label,
  value: rounded(value),
  weight,
  contribution: rounded(value * weight / 100),
  sampleSize,
  detail,
  titles,
  ...(status ? { status } : {}),
});

const monthFromDate = (value) => {
  const parsed = new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCMonth() + 1;
};

const dateLabel = (value) => {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return "DATE PENDING";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(parsed)
    .toUpperCase();
};

const automaticThresholds = (event) => {
  const available = [...new Set((event?.markets || []).map((market) => Number(market.threshold)).filter(Number.isFinite))]
    .sort((left, right) => left - right);
  if (available.length <= 3) return available.length ? available : [75, 80, 85];
  const anchor = available.reduce(
    (best, threshold, index) => Math.abs(threshold - 75) < Math.abs(available[best] - 75) ? index : best,
    0,
  );
  const start = Math.max(0, Math.min(anchor - 1, available.length - 3));
  return available.slice(start, start + 3);
};

export function buildAutomaticModel(event, prior) {
  if (!event?.eventTicker || !prior?.baseline) return null;

  const baseline = prior.baseline;
  const month = monthFromDate(event.closeTime);
  const monthPrior = prior.months?.[String(month)] || {
    name: "Unknown month",
    value: baseline.value,
    sampleSize: 0,
  };
  const familyKey = titleFamilyKey(event.title);
  const family = prior.titleFamilies?.[familyKey] || null;
  const familyValue = family?.value ?? baseline.value;
  const familyCoverage = family ? Math.min(100, family.sampleSize * 25) : 0;
  const title = event.title || event.eventTicker;
  const thresholds = automaticThresholds(event);
  const defaultThreshold = thresholds.reduce(
    (best, threshold) => Math.abs(threshold - 75) < Math.abs(best - 75) ? threshold : best,
    thresholds[0],
  );

  const historicalFactors = [
    factor({
      label: "English-language baseline",
      value: baseline.value,
      weight: 55,
      sampleSize: baseline.sampleSize,
      detail: `All eligible English-language releases in the audited snapshot form the starting prior for ${title}.`,
    }),
    factor({
      label: `${monthPrior.name} context`,
      value: monthPrior.value,
      weight: 25,
      sampleSize: monthPrior.sampleSize,
      detail: month
        ? "The Kalshi settlement month selects historical release-month context; settlement date is only a release-timing proxy."
        : "Settlement timing is unavailable, so this factor remains at the global baseline.",
      status: month ? "SETTLEMENT-MONTH PROXY" : "IMPUTED",
    }),
    factor({
      label: "Lexical title-family prior",
      value: familyValue,
      weight: 20,
      sampleSize: family?.sampleSize || 0,
      detail: family
        ? `The title key “${familyKey}” matches ${family.sampleSize} historical titles and is strongly shrunk toward the global baseline.`
        : "No repeat title-family key cleared the minimum sample; the global baseline is explicitly imputed.",
      titles: family?.titles || [],
      status: family ? "LEXICAL MATCH · NOT A CONFIRMED FRANCHISE" : "IMPUTED",
    }),
  ];

  const talentFactors = [
    factor({
      label: "Talent baseline imputation",
      value: baseline.value,
      weight: 100,
      sampleSize: 0,
      detail: "Target cast, director, and producer identities are not present in the live market feed; the global prior is shown instead of inventing talent history.",
      status: "IMPUTED · TARGET TALENT NOT CONNECTED",
    }),
  ];

  const coverageFactors = [
    factor({ label: "Live event identity", value: 100, weight: 25, sampleSize: 1, detail: "Kalshi event ticker and title are connected.", status: "CONNECTED" }),
    factor({ label: "Settlement context", value: month ? 100 : 0, weight: 20, sampleSize: month ? 1 : 0, detail: "Settlement month is available as an explicit release-timing proxy.", status: month ? "PROXY CONNECTED" : "UNAVAILABLE" }),
    factor({ label: "Title-family context", value: familyCoverage, weight: 20, sampleSize: family?.sampleSize || 0, detail: "Repeat lexical title-family evidence in the historical snapshot; larger repeat samples receive more coverage credit.", status: family ? "CONNECTED" : "IMPUTED" }),
    factor({ label: "Target genre metadata", value: 0, weight: 15, sampleSize: 0, detail: "Genre metadata requires a verified target-movie enrichment match.", status: "NOT CONNECTED" }),
    factor({ label: "Named target talent", value: 0, weight: 15, sampleSize: 0, detail: "Cast, director, and producer identities require verified target metadata.", status: "NOT CONNECTED" }),
    factor({ label: "Verified artwork", value: 0, weight: 5, sampleSize: 0, detail: "No verified target poster is attached to this automatic pack.", status: "NOT CONNECTED" }),
  ];

  const historicalValue = weightedScore(historicalFactors);
  const talentValue = weightedScore(talentFactors);
  const coverageValue = weightedScore(coverageFactors);
  const specificity = family?.sampleSize >= 3 ? "medium-low" : "low";
  const recentFilms = prior.referenceCohort?.recentFilms || [];

  return {
    schemaVersion: 2,
    generatedFromSnapshot: prior.generatedFromSnapshot,
    automation: {
      mode: "automatic-hierarchical-prior",
      modelVersion: prior.modelVersion,
      specificity,
      targetMetadataStatus: "enrichment pending",
      titleFamilyStatus: family ? "lexical match" : "global imputation",
      caveat: "This automatic pack is a historical context prior, not a movie-specific Rotten Tomatoes forecast. Specificity rises only when verified target metadata is connected.",
    },
    market: {
      slug: event.eventTicker.toLowerCase(),
      title,
      artwork: null,
      artworkAlt: "",
      releaseDate: null,
      releaseDateLabel: dateLabel(event.closeTime),
      genreLabel: family ? "AUTO · TITLE CONTEXT" : "AUTO · BASELINE",
      studioLabel: "AUTOMATIC PACK",
      kalshi: {
        seriesTicker: "KXRT",
        eventTicker: event.eventTicker,
        marketUrl: `https://kalshi.com/markets/kxrt/rotten-tomatoes-scores/${event.eventTicker.toLowerCase()}`,
        thresholds,
        defaultThreshold,
      },
    },
    target: {
      movieId: null,
      title,
      releaseDateInDataset: null,
      configuredReleaseDate: null,
      language: null,
      genres: [],
      director: [],
      leadCast: [],
      producers: [],
      targetOutcomeUsed: false,
    },
    source: prior.source,
    audit: {
      schemaAssessment: "Automatic runtime pack uses a checked-in audited historical prior. Target metadata enrichment is pending.",
    },
    methodology: {
      outcomeMetric: prior.methodology.outcomeMetric,
      notAProxyFor: prior.methodology.notAProxyFor,
      eligibility: [
        `English-language releases from ${prior.eligibility.minReleaseYear} through ${prior.eligibility.maxReleaseDate}`,
        `At least ${prior.eligibility.minVoteCount} TMDB votes and a positive vote_average`,
        "No target-film outcome is used",
      ],
      cohortRule: `${baseline.sampleSize.toLocaleString()} eligible English-language historical releases form the automatic reference cohort.`,
      shrinkage: `Lexical title-family samples shrink toward the global prior with strength ${prior.familyMethod.priorStrength}.`,
      leakageControls: prior.methodology.leakageControls,
      config: "Runtime automatic model; no movie-specific configuration is connected.",
    },
    cohort: {
      sampleSize: baseline.sampleSize,
      ratingMean: baseline.value / 10,
      ratingMedian: baseline.median / 10,
      ratingRange: null,
      releaseMonth: month,
      releaseMonthName: monthPrior.name,
      releaseMonthSampleSize: monthPrior.sampleSize,
      recentComparables: recentFilms,
      financialContext: prior.referenceCohort.financialContext,
    },
    scores: {
      historicalFit: { value: historicalValue, sampleSize: baseline.sampleSize, factors: historicalFactors },
      talentPrior: { value: talentValue, sampleSize: 0, factors: talentFactors },
      dataCoverage: { value: coverageValue, sampleSize: baseline.sampleSize, factors: coverageFactors },
    },
    thresholdCalibration: {
      status: "unavailable",
      reason: "The automatic historical prior is not trained on Rotten Tomatoes outcomes and cannot produce a threshold probability or edge.",
    },
    unconnectedSignals: [
      { name: "Verified target metadata", status: "enrichment pending" },
      { name: "Rotten Tomatoes calibration", status: "not validated" },
      { name: "Trailer velocity", status: "not connected" },
      { name: "Search interest", status: "not connected" },
      { name: "Social chatter and sentiment", status: "not connected" },
    ],
  };
}
