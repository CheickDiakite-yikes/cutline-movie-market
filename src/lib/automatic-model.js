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

export function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

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

export function resolveSnapshotEnrichment(event, catalog) {
  if (!event?.title || !event?.closeTime || !catalog?.titleIndex || !catalog?.records) return null;
  const candidateIds = catalog.titleIndex[normalizeTitle(event.title)] || [];
  if (candidateIds.length !== 1) return null;
  const candidate = catalog.records[String(candidateIds[0])];
  if (!candidate?.releaseDate) return null;
  const closeTime = new Date(event.closeTime);
  const releaseTime = new Date(`${candidate.releaseDate}T00:00:00Z`);
  if (Number.isNaN(closeTime.getTime()) || Number.isNaN(releaseTime.getTime())) return null;
  const distanceDays = Math.abs(closeTime.getTime() - releaseTime.getTime()) / 86_400_000;
  return distanceDays <= (catalog.resolution?.maxReleaseDistanceDays || 550) ? candidate : null;
}

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

export function buildAutomaticModel(event, prior, enrichmentCatalog = null) {
  if (!event?.eventTicker || !prior?.baseline) return null;

  const baseline = prior.baseline;
  const enrichment = resolveSnapshotEnrichment(event, enrichmentCatalog);
  const timingInput = enrichment?.releaseDate || event.closeTime;
  const month = monthFromDate(timingInput);
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

  const familyFactor = (weight) => factor({
    label: "Lexical title-family prior",
    value: familyValue,
    weight,
    sampleSize: family?.sampleSize || 0,
    detail: family
      ? `The title key “${familyKey}” matches ${family.sampleSize} historical titles and is strongly shrunk toward the global baseline.`
      : "No repeat title-family key cleared the minimum sample; the global baseline is explicitly imputed.",
    titles: family?.titles || [],
    status: family ? "LEXICAL MATCH · NOT A CONFIRMED FRANCHISE" : "IMPUTED",
  });

  const targetHistoryFactor = (label, history, weight, roleDetail) => factor({
    label,
    value: history?.value ?? enrichment.genreContext.value,
    weight,
    sampleSize: history?.sampleSize || 0,
    detail: history?.people?.length
      ? `${roleDetail}: ${history.people.join(", ")}. Prior eligible films are deduplicated within this factor and small samples shrink toward the genre cohort.`
      : `No ${roleDetail.toLowerCase()} identities were present in the audited target record; the genre prior is explicitly imputed.`,
    titles: history?.titles || [],
    status: history?.sampleSize > 0 ? "SNAPSHOT ID JOIN" : "IMPUTED · NO ELIGIBLE HISTORY",
  });

  const historicalFactors = enrichment
    ? [
        factor({
          label: "Verified genre cohort",
          value: enrichment.genreContext.value,
          weight: 30,
          sampleSize: enrichment.genreContext.sampleSize,
          detail: `English-language releases sharing the audited ${enrichment.genreContext.genres.join(" + ")} target genres form the primary comparable cohort.`,
          titles: enrichment.genreContext.recentComparables.map((movie) => movie.title),
          status: "EXACT TARGET SNAPSHOT MATCH",
        }),
        factor({
          label: `${monthPrior.name} context`,
          value: monthPrior.value,
          weight: 15,
          sampleSize: monthPrior.sampleSize,
          detail: `The audited target release date ${enrichment.releaseDate} selects the historical release-month context.`,
          status: "TARGET RELEASE MONTH",
        }),
        familyFactor(15),
        targetHistoryFactor("Lead cast prior", enrichment.talent.cast, 20, "Top billed cast"),
        targetHistoryFactor("Director prior", enrichment.talent.director, 10, "Director"),
        targetHistoryFactor("Producer prior", enrichment.talent.producer, 10, "Credited producers"),
      ]
    : [
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
        familyFactor(20),
      ];

  const talentFactors = enrichment
    ? [
        targetHistoryFactor("Lead cast prior", enrichment.talent.cast, 50, "Top billed cast"),
        targetHistoryFactor("Director prior", enrichment.talent.director, 30, "Director"),
        targetHistoryFactor("Producer prior", enrichment.talent.producer, 20, "Credited producers"),
      ]
    : [
        factor({
          label: "Talent baseline imputation",
          value: baseline.value,
          weight: 100,
          sampleSize: 0,
          detail: "Target cast, director, and producer identities are not present in the live market feed; the global prior is shown instead of inventing talent history.",
          status: "IMPUTED · TARGET TALENT NOT CONNECTED",
        }),
      ];

  const roleCoverage = (history) => history?.peopleCount
    ? rounded(history.peopleWithHistory / history.peopleCount * 100)
    : 0;
  const coverageFactors = enrichment
    ? [
        factor({ label: "Live event identity", value: 100, weight: 15, sampleSize: 1, detail: "Kalshi event ticker and title are connected.", status: "CONNECTED" }),
        factor({ label: "Exact target identity", value: 100, weight: 20, sampleSize: 1, detail: `One unique normalized title and release-window match resolved to TMDB movie ${enrichment.movieId}.`, status: "SNAPSHOT MATCH" }),
        factor({ label: "Target release context", value: 100, weight: 10, sampleSize: 1, detail: `Audited release date ${enrichment.releaseDate} is present.`, status: "CONNECTED" }),
        factor({ label: "Target genre cohort", value: enrichment.genreContext.sampleSize ? 100 : 0, weight: 20, sampleSize: enrichment.genreContext.sampleSize, detail: "Verified target genres resolve to an eligible historical comparable cohort.", status: enrichment.genreContext.sampleSize ? "CONNECTED" : "UNAVAILABLE" }),
        factor({ label: "Lead cast history", value: roleCoverage(enrichment.talent.cast), weight: 15, sampleSize: enrichment.talent.cast.sampleSize, detail: `${enrichment.talent.cast.peopleWithHistory} of ${enrichment.talent.cast.peopleCount} top-billed identities have eligible prior-film history.`, status: enrichment.talent.cast.peopleCount ? "SNAPSHOT ID JOIN" : "UNAVAILABLE" }),
        factor({ label: "Director history", value: roleCoverage(enrichment.talent.director), weight: 10, sampleSize: enrichment.talent.director.sampleSize, detail: `${enrichment.talent.director.peopleWithHistory} of ${enrichment.talent.director.peopleCount} director identities have eligible prior-film history.`, status: enrichment.talent.director.peopleCount ? "SNAPSHOT ID JOIN" : "UNAVAILABLE" }),
        factor({ label: "Producer history", value: roleCoverage(enrichment.talent.producer), weight: 5, sampleSize: enrichment.talent.producer.sampleSize, detail: `${enrichment.talent.producer.peopleWithHistory} of ${enrichment.talent.producer.peopleCount} producer identities have eligible prior-film history.`, status: enrichment.talent.producer.peopleCount ? "SNAPSHOT ID JOIN" : "UNAVAILABLE" }),
        factor({ label: "Snapshot artwork", value: enrichment.artwork ? 100 : 0, weight: 5, sampleSize: enrichment.artwork ? 1 : 0, detail: "Artwork is present only when the audited target record includes a TMDB image path.", status: enrichment.artwork ? "CONNECTED" : "UNAVAILABLE" }),
      ]
    : [
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
  const specificity = enrichment
    ? [enrichment.talent.cast, enrichment.talent.director, enrichment.talent.producer].every((history) => history.peopleCount > 0)
      ? "medium-high"
      : "medium"
    : family?.sampleSize >= 3 ? "medium-low" : "low";
  const recentFilms = enrichment?.genreContext.recentComparables || prior.referenceCohort?.recentFilms || [];
  const source = enrichment ? enrichmentCatalog?.source || prior.source : prior.source;
  const talentSampleSize = enrichment
    ? enrichment.talent.cast.sampleSize + enrichment.talent.director.sampleSize + enrichment.talent.producer.sampleSize
    : 0;

  return {
    schemaVersion: 2,
    generatedFromSnapshot: prior.generatedFromSnapshot,
    automation: {
      mode: "automatic-hierarchical-prior",
      modelVersion: enrichment ? `${prior.modelVersion}+enrichment-${enrichmentCatalog.modelVersion}` : prior.modelVersion,
      specificity,
      enrichmentMode: enrichment ? "audited-snapshot-exact-match" : "none",
      targetMetadataStatus: enrichment ? "snapshot enriched" : "enrichment pending",
      titleFamilyStatus: family ? "lexical match" : "global imputation",
      caveat: enrichment
        ? `A unique title and release-window match resolved target metadata from the ${source.snapshotDate} audited snapshot. It is not a live refresh, manual review, Rotten Tomatoes forecast, or trade probability.`
        : "This automatic pack is a historical context prior, not a movie-specific Rotten Tomatoes forecast. Specificity rises only when verified target metadata is connected.",
    },
    market: {
      slug: event.eventTicker.toLowerCase(),
      title,
      artwork: enrichment?.artwork || null,
      artworkAlt: enrichment?.artworkAlt || "",
      releaseDate: enrichment?.releaseDate || null,
      releaseDateLabel: dateLabel(enrichment?.releaseDate || event.closeTime),
      genreLabel: enrichment ? enrichment.genres.slice(0, 2).join(" / ").toUpperCase() : family ? "AUTO · TITLE CONTEXT" : "AUTO · BASELINE",
      studioLabel: enrichment ? "SNAPSHOT ENRICHED" : "AUTOMATIC PACK",
      kalshi: {
        seriesTicker: "KXRT",
        eventTicker: event.eventTicker,
        marketUrl: `https://kalshi.com/markets/kxrt/rotten-tomatoes-scores/${event.eventTicker.toLowerCase()}`,
        thresholds,
        defaultThreshold,
      },
    },
    target: {
      movieId: enrichment?.movieId || null,
      title: enrichment?.title || title,
      releaseDateInDataset: enrichment?.releaseDate || null,
      configuredReleaseDate: null,
      language: enrichment?.language || null,
      genres: enrichment?.genres || [],
      director: enrichment?.talent.director.people || [],
      leadCast: enrichment?.talent.cast.people || [],
      producers: enrichment?.talent.producer.people || [],
      targetOutcomeUsed: false,
    },
    source,
    audit: {
      schemaAssessment: enrichment
        ? `Automatic runtime pack uses a checked-in audited historical prior and exact snapshot target record ${enrichment.movieId}. The match is automatic and not manually reviewed.`
        : "Automatic runtime pack uses a checked-in audited historical prior. Target metadata enrichment is pending.",
    },
    methodology: {
      outcomeMetric: prior.methodology.outcomeMetric,
      notAProxyFor: prior.methodology.notAProxyFor,
      eligibility: [
        `English-language releases from ${prior.eligibility.minReleaseYear} through ${prior.eligibility.maxReleaseDate}`,
        `At least ${prior.eligibility.minVoteCount} TMDB votes and a positive vote_average`,
        "No target-film outcome is used",
      ],
      cohortRule: enrichment
        ? `${enrichment.genreContext.sampleSize.toLocaleString()} eligible English-language releases sharing ${enrichment.genreContext.genres.join(" + ")} form the snapshot-enriched comparable cohort.`
        : `${baseline.sampleSize.toLocaleString()} eligible English-language historical releases form the automatic reference cohort.`,
      shrinkage: enrichment
        ? `Talent filmographies shrink toward the genre cohort with strength ${enrichmentCatalog.methodology.priorStrength}; lexical title families shrink toward the global prior with strength ${prior.familyMethod.priorStrength}.`
        : `Lexical title-family samples shrink toward the global prior with strength ${prior.familyMethod.priorStrength}.`,
      leakageControls: enrichment
        ? [...prior.methodology.leakageControls, ...enrichmentCatalog.methodology.leakageControls]
        : prior.methodology.leakageControls,
      config: enrichment ? `Automatic exact snapshot match to TMDB movie ${enrichment.movieId}; no reviewed market configuration.` : "Runtime automatic model; no movie-specific configuration is connected.",
    },
    cohort: {
      sampleSize: enrichment?.genreContext.sampleSize || baseline.sampleSize,
      ratingMean: (enrichment?.genreContext.value || baseline.value) / 10,
      ratingMedian: (enrichment?.genreContext.value || baseline.median) / 10,
      ratingRange: null,
      releaseMonth: month,
      releaseMonthName: monthPrior.name,
      releaseMonthSampleSize: monthPrior.sampleSize,
      recentComparables: recentFilms,
      financialContext: enrichment?.genreContext.financialContext || prior.referenceCohort.financialContext,
    },
    scores: {
      historicalFit: { value: historicalValue, sampleSize: enrichment?.genreContext.sampleSize || baseline.sampleSize, factors: historicalFactors },
      talentPrior: { value: talentValue, sampleSize: talentSampleSize, factors: talentFactors },
      dataCoverage: { value: coverageValue, sampleSize: enrichment?.genreContext.sampleSize || baseline.sampleSize, factors: coverageFactors },
    },
    thresholdCalibration: {
      status: "unavailable",
      reason: "The automatic historical prior is not trained on Rotten Tomatoes outcomes and cannot produce a threshold probability or edge.",
    },
    unconnectedSignals: [
      { name: "Audited target metadata", status: enrichment ? "exact snapshot match" : "enrichment pending" },
      { name: "Live target metadata refresh", status: "not connected" },
      { name: "Rotten Tomatoes calibration", status: "not validated" },
      { name: "Trailer velocity", status: "not connected" },
      { name: "Search interest", status: "not connected" },
      { name: "Social chatter and sentiment", status: "not connected" },
    ],
  };
}
