import { useEffect, useMemo, useRef, useState } from "react";
import "@fontsource/anton";
import "@fontsource/ibm-plex-sans-condensed/400.css";
import "@fontsource/ibm-plex-sans-condensed/600.css";
import "@fontsource/ibm-plex-sans-condensed/700.css";
import { ArrowLeft, ArrowRight, CaretRight } from "@phosphor-icons/react";
import automaticPrior from "./data/automatic-prior.json";
import criticBenchmark from "./data/critic-benchmark.json";
import targetEnrichment from "./data/target-enrichment.json";
import { buildAutomaticModel } from "./lib/automatic-model.js";
import {
  fetchAccountIdeas,
  fetchAccountSession,
  removeAccountIdea,
  upsertAccountIdea,
} from "./lib/account.js";
import {
  chooseThresholds,
  fetchKalshiSlate,
  groupKalshiEvents,
  readCachedSlate,
  writeCachedSlate,
} from "./lib/kalshi.js";
import {
  IDEA_STORAGE_KEY,
  createIdeasExport,
  mergeIdeas,
  normalizeIdeas,
  parseIdeasExport,
} from "./lib/ideas.js";
import { classifySwipe } from "./lib/swipe.js";
import {
  explainScore,
  plainFactorDetail,
  plainFactorLabel,
  plainScoreLabel,
} from "./lib/plain-language.js";

const marketModules = import.meta.glob("./data/markets/*.json", {
  eager: true,
  import: "default",
});
const MODELS = Object.values(marketModules);
const MODEL_BY_EVENT = new Map(MODELS.map((model) => [model.market.kalshi.eventTicker, model]));
const DEFAULT_EVENT = MODELS[0]?.market.kalshi.eventTicker || "KXRT-RES";
const resolveModel = (event) => {
  if (!event) return null;
  return MODEL_BY_EVENT.get(event.eventTicker) || buildAutomaticModel(event, automaticPrior, targetEnrichment);
};
const isAutomaticModel = (model) => model?.automation?.mode === "automatic-hierarchical-prior";
const isEnrichedModel = (model) => model?.automation?.enrichmentMode === "audited-snapshot-exact-match";
const modelTierLabel = (event) => {
  if (MODEL_BY_EVENT.has(event?.eventTicker)) return "deeper research";
  return isEnrichedModel(resolveModel(event)) ? "more background" : "first look";
};

const hydrateIdeas = (items) =>
  normalizeIdeas(items).map((item) => {
    const model = MODEL_BY_EVENT.get(item.eventTicker);
    if (!model) return item;
    return {
      ...item,
      movie: model.market.title,
      artwork: item.artwork || model.market.artwork,
      releaseLabel: item.releaseLabel || model.market.releaseDateLabel,
      marketUrl: item.marketUrl || model.market.kalshi.marketUrl,
      modelStatus: "historical prior connected",
      historicalFit: item.historicalFit > 0 ? item.historicalFit : model.scores.historicalFit.value,
      talentPrior: item.talentPrior > 0 ? item.talentPrior : model.scores.talentPrior.value,
    };
  });

const readDeviceIdeas = () => {
  try {
    return hydrateIdeas(JSON.parse(window.localStorage.getItem(IDEA_STORAGE_KEY)) || []);
  } catch {
    return [];
  }
};

const displayScore = (value) => (typeof value === "number" ? Math.round(value) : "—");
const meaningFor = (scoreKey, value) => explainScore(
  value,
  scoreKey === "coverage" ? "coverage" : scoreKey === "live" ? "live" : "history",
);
const money = (value) => (value ? `$${Math.round(value / 1_000_000)}M` : "N/A");
const marketUrl = (eventTicker) =>
  `https://kalshi.com/markets/kxrt/rotten-tomatoes-scores/${eventTicker.toLowerCase()}`;
const compactDate = (value) => {
  if (!value) return "UNAVAILABLE";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
    .format(new Date(value))
    .toUpperCase();
};
const shortDate = (value) => {
  if (!value) return "UNKNOWN";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
    .format(new Date(value))
    .toUpperCase();
};

function useKalshiSlate() {
  const [state, setState] = useState(() => {
    const cached = readCachedSlate();
    return cached
      ? { status: "stale", slate: cached, error: null }
      : { status: "loading", slate: null, error: null };
  });

  useEffect(() => {
    let active = true;
    const refresh = () => {
      fetchKalshiSlate()
        .then((slate) => {
          if (!active) return;
          writeCachedSlate(slate);
          setState({ status: "live", slate, error: null });
        })
        .catch((error) => {
          if (!active) return;
          setState((current) => ({
            status: current.slate ? "stale" : "unavailable",
            slate: current.slate,
            error: error.message,
          }));
        });
    };
    const refreshWhenVisible = () => document.visibilityState === "visible" && refresh();
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return state;
}

function buildScoreDetails(model, liveState) {
  const liveConnected = liveState.status === "live";
  const liveCached = liveState.status === "stale";
  const criticCount = criticBenchmark.audit.eligibleOutcomeRows;
  const criticJoin = criticBenchmark.audit.joinToTmdb.exactMatches;

  if (!model) {
    const unmodeled = {
      value: null,
      sampleSize: null,
      status: "Unavailable · historical market config not generated",
      formula: "Add a market configuration and rebuild the audited historical cache.",
      caveat: "No score is inferred from the live market price.",
      factors: [
        {
          label: "Historical market config",
          value: null,
          weight: null,
          contribution: null,
          sampleSize: null,
          status: "NOT GENERATED",
          detail: "This live Kalshi event does not yet have a checked-in Cutline historical artifact.",
          titles: [],
        },
      ],
    };
    return {
      historical: {
        ...unmodeled,
        kicker: "Clue 01",
        label: "Similar movies",
        summary: "We have the live market, but we have not built a trustworthy group of similar movies yet.",
      },
      live: createLiveScore(liveConnected, liveCached, liveState, criticCount, criticJoin),
      talent: {
        ...unmodeled,
        kicker: "Clue 03",
        label: "Cast + crew",
        summary: "We have not connected this movie's cast, director, and producers to their earlier movies yet.",
      },
      coverage: {
        ...unmodeled,
        kicker: "Clue 04",
        label: "How much we know",
        summary: "We cannot tell how complete the background research is until this movie is matched to its source data.",
      },
    };
  }

  const historicalFit = model.scores.historicalFit;
  const talentPrior = model.scores.talentPrior;
  const dataCoverage = model.scores.dataCoverage;
  const cohort = model.cohort;
  const automatic = isAutomaticModel(model);
  const enriched = isEnrichedModel(model);
  const specificity = model.automation?.specificity?.toUpperCase();
  return {
    historical: {
      kicker: "Clue 01",
      label: "Similar movies",
      value: historicalFit.value,
      sampleSize: historicalFit.sampleSize,
      summary: `We compared this movie with ${cohort.sampleSize.toLocaleString()} relevant past releases. Their results look ${meaningFor("historical", historicalFit.value).phrase}—useful context, but not a critic-score prediction.`,
      status: automatic
        ? `${enriched ? "Snapshot-enriched automatic prior" : "Automatic hierarchical prior"} · ${specificity} specificity · ${model.source.snapshotDate}`
        : `Kaggle / TMDB historical prior · ${model.source.snapshotDate}`,
      formula: automatic
        ? enriched
          ? "The verified genre cohort receives 30%, target release-month context 15%, title-family context 15%, lead cast 20%, director 10%, and producers 10%. Missing role history is explicitly imputed and lowers coverage."
          : "The global historical baseline receives 55%, settlement-month context 25%, and strongly-shrunk lexical title-family context 20%. Missing evidence stays at the baseline and lowers coverage."
        : "Each factor is a TMDB community-rating prior on a 0–100 scale. Small filmographies shrink toward the comparable cohort, then the configured weights are summed.",
      caveat: automatic
        ? model.automation.caveat
        : "This score is not a Tomatometer estimate and does not imply a Kalshi threshold probability.",
      factors: historicalFit.factors,
    },
    live: createLiveScore(liveConnected, liveCached, liveState, criticCount, criticJoin),
    talent: {
      kicker: "Clue 03",
      label: "Cast + crew",
      value: talentPrior.value,
      sampleSize: talentPrior.sampleSize,
      summary: talentPrior.sampleSize > 0
        ? `We checked ${talentPrior.sampleSize} earlier movie examples from the named cast and crew. That history looks ${meaningFor("talent", talentPrior.value).phrase}.`
        : "We do not have reliable movie-specific cast and crew history yet, so this clue stays a rough baseline.",
      status: automatic
        ? enriched
          ? `Snapshot ID joins · ${specificity} specificity · ${model.source.snapshotDate}`
          : `Imputed baseline · target talent enrichment pending · ${model.source.snapshotDate}`
        : `Kaggle / TMDB historical prior · ${model.source.snapshotDate}`,
      formula: automatic
        ? enriched
          ? "Lead cast receives 50%, director 30%, and credited producers 20%. Prior films are deduplicated within each factor and small samples shrink toward the verified genre cohort."
          : "Until verified target identities are joined, the eligible-release baseline is carried forward at 100% and the talent sample remains n=0."
        : "Prior-film TMDB community ratings are deduplicated within each factor, shrunk toward the comparable cohort, and combined at the declared weights.",
      caveat: automatic
        ? enriched
          ? model.automation.caveat
          : "The talent value is a missing-feature imputation and must not be described as the target cast or crew track record."
        : "This score is not a Tomatometer estimate and does not imply a Kalshi threshold probability.",
      factors: talentPrior.factors,
    },
    coverage: {
      kicker: "Clue 04",
      label: "How much we know",
      value: dataCoverage.value,
      sampleSize: dataCoverage.sampleSize,
      summary: `${meaningFor("coverage", dataCoverage.value).phrase}. This only says how complete the background research is—not whether the trade will win.`,
      status: automatic
        ? `Availability only · ${specificity} specificity · automatic model ${model.automation.modelVersion}`
        : `Availability only · ${model.audit.rows.moviesParsed.toLocaleString()} parsed movies`,
      formula: "Field-level completeness percentages are combined at the declared weights. No outcome probability is produced.",
      caveat: "Coverage measures whether data exists, not whether the model is right.",
      factors: dataCoverage.factors,
    },
  };
}

function createLiveScore(liveConnected, liveCached, liveState, criticCount, criticJoin) {
  const marketStatus = liveConnected ? "CONNECTED" : liveCached ? "STALE CACHE" : "UNAVAILABLE";
  return {
    kicker: "Clue 02",
    label: "Current buzz",
    value: null,
    sampleSize: null,
    summary:
      "We can see the live market price, but trailer interest, searches, social media talk, and a trustworthy critic prediction are not connected yet.",
    status: `${marketStatus} · current buzz score not ready`,
    formula: "No composite score runs until source-specific time windows, normalization, and validation rules are declared.",
    caveat: "Market price is context, not a model feature. Unavailable signals are never replaced with a neutral estimate.",
    factors: [
      {
        label: "Kalshi public market data",
        value: null,
        weight: null,
        contribution: null,
        sampleSize: liveState.slate?.markets?.length ?? 0,
        status: marketStatus,
        detail: liveState.slate?.source?.observedAt
          ? `Observed ${compactDate(liveState.slate.source.observedAt)} through the public market-data API.`
          : "The public market-data API did not return a usable slate.",
        titles: [],
      },
      {
        label: "Rotten Tomatoes outcome history",
        value: null,
        weight: null,
        contribution: null,
        sampleSize: criticCount,
        status: "BENCHMARK ONLY",
        detail: `${criticCount} critic outcomes pass the five-review rule, but only ${criticJoin} exact title/year rows join to the selected TMDB snapshot.`,
        titles: [],
      },
      ...["Trailer velocity", "Search interest", "Social chatter and sentiment"].map((label) => ({
        label,
        value: null,
        weight: null,
        contribution: null,
        sampleSize: null,
        status: "NOT CONNECTED",
        detail: "No provider, observation window, or normalization rule is configured.",
        titles: [],
      })),
    ],
  };
}

function AccountStatus({ account }) {
  const localHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (account.status === "loading") {
    return <div className="account-status loading"><span>ACCOUNT</span><strong>CHECKING</strong></div>;
  }
  if (account.status === "signedIn") {
    return (
      <a className={account.syncError ? "account-status warning" : "account-status"} href="/signout-with-chatgpt?return_to=/" title="Sign out of Cutline">
        <span>{account.syncError ? "SYNC PENDING" : "ACCOUNT SYNC"}</span>
        <strong>{account.user?.name || account.user?.email || "SIGNED IN"}</strong>
      </a>
    );
  }
  return localHost ? (
    <div className="account-status device"><span>LOCAL PREVIEW</span><strong>DEVICE ONLY</strong></div>
  ) : (
    <a className="account-status device" href="/signin-with-chatgpt?return_to=/">
      <span>GUEST · DEVICE ONLY</span><strong>SIGN IN TO SYNC</strong>
    </a>
  );
}

function Header({ view, setView, savedCount, liveState, position, total, account }) {
  const freshness =
    liveState.status === "live"
      ? `KALSHI LIVE · ${compactDate(liveState.slate?.source?.observedAt)}`
      : liveState.status === "stale"
        ? `KALSHI STALE · ${compactDate(liveState.slate?.source?.observedAt)}`
        : "KALSHI CONNECTING";
  return (
    <header className="topbar">
      <div className="brand-cluster">
        <button className="brand" onClick={() => setView("scout")} aria-label="Open Cutline scout">
          <span className="brand-mark">CUTLINE</span>
          <span className="brand-sub">MOVIE MARKET INTELLIGENCE</span>
        </button>
        <button className={view === "saved" ? "mobile-saved-tab active" : "mobile-saved-tab"} onClick={() => setView("saved")}>
          Saved <span>{String(savedCount).padStart(2, "0")}</span><small>{account.status === "signedIn" ? "SYNC" : "DEVICE"}</small>
        </button>
      </div>
      <nav className="primary-nav" aria-label="Primary navigation">
        <button className={view === "scout" ? "nav-link nav-scout active" : "nav-link nav-scout"} onClick={() => setView("scout")}>Scout</button>
        <button className={view === "saved" ? "nav-link nav-saved active" : "nav-link nav-saved"} onClick={() => setView("saved")}>Saved ideas <span className="nav-count">{String(savedCount).padStart(2, "0")}</span></button>
      </nav>
      <div className="topbar-status">
        <AccountStatus account={account} />
        <div className={`freshness ${liveState.status}`}>
          <span className="freshness-dot" aria-hidden="true" />
          {freshness}
        </div>
      </div>
      <div className="mobile-progress" aria-label={view === "scout" ? `Trade idea ${position} of ${total}` : `${savedCount} saved ideas`}>
        {view === "scout" ? <><strong>{String(position).padStart(2, "0")}</strong><span>/</span>{String(total).padStart(2, "0")}</> : <><strong>{String(savedCount).padStart(2, "0")}</strong><span>SAVED</span></>}
      </div>
    </header>
  );
}

function SlateStrip({ events, selectedEventTicker, onSelect, configuredCount, enrichedCount, liveState }) {
  const baselineCount = Math.max(0, events.length - configuredCount - enrichedCount);
  return (
    <section className="slate-strip" aria-label="Movie market slate">
      <div>
        <p className="eyebrow">LIVE MOVIE MARKETS</p>
        <span>{events.length} MOVIES TO REVIEW · {configuredCount + enrichedCount} WITH MORE BACKGROUND · {baselineCount} FIRST LOOKS</span>
      </div>
      <label>
        <span>CHOOSE A MOVIE</span>
        <select value={selectedEventTicker} onChange={(event) => onSelect(event.target.value)}>
          {events.map((item) => (
            <option key={item.eventTicker} value={item.eventTicker}>
              {item.title} — {modelTierLabel(item)}
            </option>
          ))}
        </select>
      </label>
      <div className="slate-status">
        <strong>{liveState.status === "live" ? "LIVE" : liveState.status.toUpperCase()}</strong>
        <span>PRICES ONLY · CUTLINE NEVER PLACES A TRADE</span>
      </div>
    </section>
  );
}

function ScoreButton({ scoreKey, score, onOpen }) {
  const scoreLabel = displayScore(score.value);
  const meaningValue = scoreKey === "talent" && score.sampleSize === 0 ? null : score.value;
  const meaning = meaningFor(scoreKey, meaningValue);
  return (
    <button className={score.value === null ? "score-button unavailable" : "score-button"} onClick={() => onOpen(scoreKey)} aria-label={score.value === null ? `Explain why ${score.label} is unavailable` : `Explain ${score.label} score of ${scoreLabel}`}>
      <span className="score-number plain-score">{meaning.label}</span>
      <span className="score-copy"><span>{plainScoreLabel(scoreKey)}</span><small>{score.value === null ? "SEE WHAT'S MISSING" : `${scoreLabel}/100 · HOW WE KNOW`}</small></span>
    </button>
  );
}

function MarketPanel({ event, model, threshold, setThreshold, liveState }) {
  const configuredThresholds = model?.market.kalshi.thresholds || [75, 80, 85];
  const options = chooseThresholds(event, configuredThresholds);
  const market = event?.markets.find((item) => item.threshold === threshold);
  const midpoint = market?.yesBid !== null && market?.yesAsk !== null
    ? Math.round((market.yesBid + market.yesAsk) / 2)
    : null;
  const price = market?.lastPrice ?? midpoint;
  const link = model?.market.kalshi.marketUrl || marketUrl(event?.eventTicker || "KXRT");
  return (
    <section className="market-panel" aria-labelledby="market-heading">
      <div className="market-panel-head">
        <div>
          <p className="eyebrow">THE QUESTION PEOPLE ARE BETTING ON</p>
          <h2 id="market-heading">Will the Rotten Tomatoes score finish above {threshold}?</h2>
        </div>
        <a href={link} target="_blank" rel="noreferrer" className="market-link">Open market</a>
      </div>
      <div className="thresholds" aria-label="Choose Rotten Tomatoes threshold" style={{ "--threshold-count": options.length }}>
        {options.map((item) => (
          <button key={item} onClick={() => setThreshold(item)} className={threshold === item ? "threshold active" : "threshold"}>SCORE OVER {item}</button>
        ))}
      </div>
      <div className="probability-grid">
        <div className="probability-block market-probability">
          <span>YES SHARES LAST COST</span>
          <strong className={price === null || price === undefined ? "unavailable-value" : ""}>{price === null || price === undefined ? "—" : `${price}¢`}</strong>
          <small>{market ? `BUYERS OFFER ${market.yesBid ?? "—"}¢ · SELLERS ASK ${market.yesAsk ?? "—"}¢` : "THE LIVE PRICE IS UNAVAILABLE"}</small>
        </div>
        <div className="probability-block model-probability">
          <span>CUTLINE'S PREDICTION</span>
          <strong className="plain-market-answer">NOT READY</strong>
          <small>WE NEED MORE PAST MOVIES WE CAN COMPARE FAIRLY</small>
        </div>
        <div className="edge-block">
          <span>IS {price == null ? "THIS" : `${price}¢`} A GOOD PRICE?</span>
          <strong className="plain-market-answer">CAN'T TELL YET</strong>
          <small>WE DON'T HAVE A FAIR COMPARISON YET</small>
        </div>
      </div>
      <div className="market-foot">
        <div><span className="market-meta-label">Betting ends</span><strong>{compactDate(market?.closeTime || event?.closeTime)}</strong></div>
        <div><span className="market-meta-label">Market price checked</span><strong>{liveState.status === "live" ? compactDate(liveState.slate?.source?.observedAt) : liveState.status.toUpperCase()}</strong></div>
      </div>
    </section>
  );
}

function MoviePanel({ event, model, position, total }) {
  const title = model?.market.title || event?.title || "Unconfigured movie";
  const hasArtwork = Boolean(model?.market.artwork);
  const automatic = isAutomaticModel(model);
  const enriched = isEnrichedModel(model);
  return (
    <article className={hasArtwork ? "movie-panel" : "movie-panel unmodeled"}>
      {hasArtwork ? (
        <img src={model.market.artwork} alt={model.market.artworkAlt} />
      ) : (
        <div className="unmodeled-art" aria-label={`${title} artwork is not configured`}>
          <span>{automatic ? enriched ? "MORE BACKGROUND FOUND" : "FIRST LOOK" : "LIVE MARKET FOUND"}</span><strong>{title}</strong><small>{automatic ? enriched ? "MOVIE, RELEASE, STYLE, CAST, AND CREW MATCHED" : "CAST, CREW, STYLE, AND POSTER STILL MISSING" : "MOVIE BACKGROUND IS NOT READY"}</small>
        </div>
      )}
      <div className="movie-overlay">
        <div><p className="eyebrow light">ACTIVE RELEASE · {String(position).padStart(2, "0")} / {String(total).padStart(2, "0")}</p><h1>{title}</h1></div>
        <div className="movie-meta">
          <span>{model?.market.releaseDateLabel || shortDate(event?.closeTime)}</span>
          <span>{model?.market.genreLabel || "LIVE MARKET"}</span>
          <span>{automatic ? enriched ? "MORE BACKGROUND" : "FIRST LOOK" : model ? "DEEPER RESEARCH" : "PRICE ONLY"}</span>
        </div>
      </div>
    </article>
  );
}

function MobileSwipeCard({
  event,
  model,
  events,
  threshold,
  setThreshold,
  saved,
  deferred,
  onSave,
  onLater,
  onPass,
  onAdvance,
  onOpenScore,
}) {
  const [dragX, setDragX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const gestureRef = useRef(null);
  const animationTimerRef = useRef(null);
  const eventIndex = Math.max(0, events.findIndex((item) => item.eventTicker === event?.eventTicker));
  const nextEvent = events.length > 1 ? events[(eventIndex + 1) % events.length] : null;
  const nextModel = resolveModel(nextEvent);
  const automatic = isAutomaticModel(model);
  const enriched = isEnrichedModel(model);
  const options = chooseThresholds(event, model?.market.kalshi.thresholds || [75, 80, 85]);
  const market = event?.markets.find((item) => item.threshold === threshold);
  const midpoint = market?.yesBid !== null && market?.yesAsk !== null
    ? Math.round((market.yesBid + market.yesAsk) / 2)
    : null;
  const price = market?.lastPrice ?? midpoint;
  const historicalMeaning = meaningFor("historical", model?.scores.historicalFit.value ?? null);
  const scoreRows = [
    {
      key: "historical",
      label: "SIMILAR MOVIES",
      value: model?.scores.historicalFit.value ?? null,
      meaning: meaningFor("historical", model?.scores.historicalFit.value ?? null),
      detail: model ? `${model.cohort.sampleSize.toLocaleString()} relevant past movies were checked.` : "We have not found a trustworthy comparison group yet.",
    },
    {
      key: "talent",
      label: "CAST + CREW",
      value: model?.scores.talentPrior.value ?? null,
      meaning: meaningFor("talent", model?.scores.talentPrior.value ?? null),
      detail: model?.scores.talentPrior.sampleSize > 0 ? `${model.scores.talentPrior.sampleSize} earlier movie examples were checked.` : "We do not have this movie's people yet.",
    },
    {
      key: "coverage",
      label: "BACKGROUND INFO",
      value: model?.scores.dataCoverage.value ?? null,
      meaning: meaningFor("coverage", model?.scores.dataCoverage.value ?? null),
      detail: model ? "This says how complete our research is—not whether the bet will win." : "We have not checked the background yet.",
    },
  ];

  useEffect(() => {
    setDragX(0);
    setIsAnimating(false);
  }, [event?.eventTicker]);

  useEffect(() => () => window.clearTimeout(animationTimerRef.current), []);

  const cycleThreshold = () => {
    const index = options.indexOf(threshold);
    setThreshold(options[(index + 1) % options.length]);
  };

  const completeSwipe = (direction) => {
    if (isAnimating) return;
    setIsAnimating(true);
    setDragX(direction === "right" ? window.innerWidth * 1.15 : window.innerWidth * -1.15);
    animationTimerRef.current = window.setTimeout(() => {
      if (direction === "right") onSave({ threshold, market });
      else onPass({ threshold, market });
      onAdvance(1);
      setDragX(0);
      setIsAnimating(false);
    }, 190);
  };

  const completeLater = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    onLater({ threshold, market });
    animationTimerRef.current = window.setTimeout(() => {
      onAdvance(1);
      setIsAnimating(false);
    }, 160);
  };

  const handlePointerDown = (pointerEvent) => {
    if (pointerEvent.pointerType === "mouse" && pointerEvent.button !== 0) return;
    if (pointerEvent.target.closest("button, a")) return;
    gestureRef.current = {
      id: pointerEvent.pointerId,
      startX: pointerEvent.clientX,
      startY: pointerEvent.clientY,
      deltaX: 0,
      deltaY: 0,
    };
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  };

  const handlePointerMove = (pointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== pointerEvent.pointerId || isAnimating) return;
    gesture.deltaX = pointerEvent.clientX - gesture.startX;
    gesture.deltaY = pointerEvent.clientY - gesture.startY;
    if (Math.abs(gesture.deltaX) > Math.abs(gesture.deltaY)) setDragX(gesture.deltaX);
  };

  const handlePointerUp = (pointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== pointerEvent.pointerId || isAnimating) return;
    gestureRef.current = null;
    const result = classifySwipe(gesture.deltaX, gesture.deltaY);
    if (result === "save") completeSwipe("right");
    else if (result === "pass") completeSwipe("left");
    else setDragX(0);
  };

  const title = model?.market.title || event?.title || "Unconfigured movie";
  const synthesis = model
    ? `Similar movies look ${historicalMeaning.phrase}, but that is not enough to tell whether ${price == null ? "the current price" : `${price}¢`} is cheap or expensive.`
    : "We can see the market, but we do not have enough movie background to judge the price."
  const recommendation = "WAIT FOR NOW";

  return (
    <section className="mobile-scout" aria-label="Swipe through movie trade ideas">
      {nextEvent && (
        <div className={nextModel?.market.artwork ? "mobile-next-peek" : "mobile-next-peek unmodeled"} aria-hidden="true">
          {nextModel?.market.artwork ? <img src={nextModel.market.artwork} alt="" /> : <span>{nextEvent.title}</span>}
        </div>
      )}
      <article
        className={`mobile-trade-card${nextEvent ? " has-next" : ""}${isAnimating ? " animating" : ""}`}
        style={{ "--drag-x": `${dragX}px`, "--drag-rotate": `${dragX / 30}deg` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { gestureRef.current = null; setDragX(0); }}
        onKeyDown={(keyEvent) => {
          if (keyEvent.key === "ArrowLeft") completeSwipe("left");
          if (keyEvent.key === "ArrowRight") completeSwipe("right");
        }}
        tabIndex="0"
        aria-label={`${title}. Swipe left to pass, use Later to come back, or swipe right to save.`}
      >
        <div className={model?.market.artwork ? "mobile-movie-art" : "mobile-movie-art unmodeled"}>
          {model?.market.artwork ? (
            <img src={model.market.artwork} alt={model.market.artworkAlt} draggable="false" />
          ) : (
            <div><span>{automatic ? enriched ? "MORE BACKGROUND FOUND" : "FIRST LOOK" : "LIVE PRICE ONLY"}</span><strong>{title}</strong><small>{automatic ? enriched ? "MOVIE DETAILS AND PEOPLE MATCHED" : "CAST, CREW, STYLE, AND POSTER STILL MISSING" : "MOVIE BACKGROUND IS NOT READY"}</small></div>
          )}
        </div>

        <div className="mobile-ticket">
          <section className="mobile-title-block">
            <p>{model?.market.releaseDateLabel || shortDate(event?.closeTime)} <span>·</span> {model?.market.genreLabel || "LIVE MARKET"}</p>
            <h1>{title}</h1>
            <span className="mobile-market-source">KALSHI <i>·</i> ROTTEN TOMATOES</span>
          </section>

          <section className="mobile-market-ticket" aria-label="Active market snapshot">
            <button className="mobile-market-question" onClick={cycleThreshold} aria-label="Change Rotten Tomatoes score threshold">
              <span>THE QUESTION PEOPLE ARE BETTING ON</span>
              <strong>SCORE OVER {threshold}?</strong>
            </button>
            <div className="mobile-market-columns">
              <div className="mobile-live-price">
                <span>YES SHARES COST</span>
                <strong className={price == null ? "unavailable-value" : ""}>{price == null ? "—" : `${price}¢`}</strong>
                <p>{market ? `BUYERS ${market.yesBid ?? "—"}¢ · SELLERS ${market.yesAsk ?? "—"}¢` : "LIVE PRICE UNAVAILABLE"}</p>
                <small>WHAT THE MARKET PAYS</small>
              </div>
              <div className="mobile-model-score">
                <span>WHAT SIMILAR MOVIES SAY</span>
                <strong className="plain-signal">{historicalMeaning.label}</strong>
                <button onClick={() => onOpenScore("historical")}>{model ? `${displayScore(model.scores.historicalFit.value)}/100 · HOW WE KNOW` : "SEE WHAT'S MISSING"} <CaretRight aria-hidden="true" weight="bold" /></button>
              </div>
            </div>
          </section>

          <section className="mobile-callout">
            <div><span>BOTTOM LINE</span><strong>{recommendation}</strong><p>{price == null ? "We cannot judge the price yet." : `We cannot tell if ${price}¢ is a good deal yet.`}</p></div>
            <div><span>WHY</span><p>{synthesis}</p></div>
          </section>

          <section className="mobile-score-list" aria-label="Explainable model scores">
            {scoreRows.map((row) => (
              <button key={row.key} onClick={() => onOpenScore(row.key)}>
                <span>{row.label}</span>
                <strong>{row.meaning.label}</strong>
                <p>
                  {row.value == null ? row.detail : <><b>{displayScore(row.value)}/100</b><span> · {row.detail}</span></>}
                </p>
                <CaretRight aria-hidden="true" weight="bold" />
              </button>
            ))}
          </section>

          <div className="mobile-actions" aria-label="Trade idea actions">
            <button className="mobile-pass" onClick={() => completeSwipe("left")}><strong>PASS</strong><span>SKIP THIS ONE</span></button>
            <button className={deferred ? "mobile-later deferred" : "mobile-later"} onClick={completeLater}><strong>LATER</strong><span>{deferred ? "IN IDEA BOOK" : "REVIEW LATER"}</span></button>
            <button className={saved ? "mobile-save saved" : "mobile-save"} onClick={() => completeSwipe("right")}><strong>{saved ? "SAVED" : "SAVE"}</strong><span>{saved ? "IN IDEA BOOK" : "WATCH THIS"}</span></button>
          </div>
          <div className="mobile-swipe-cue" aria-hidden="true"><ArrowLeft weight="bold" /><span>SWIPE LEFT / RIGHT</span><ArrowRight weight="bold" /></div>
        </div>
      </article>
    </section>
  );
}

function ScoutView({ event, model, events, liveState, scoreDetails, ideaDisposition, onSave, onLater, onPass, onAdvance, onOpenScore }) {
  const options = chooseThresholds(event, model?.market.kalshi.thresholds || [75, 80, 85]);
  const preferred = model?.market.kalshi.defaultThreshold;
  const [threshold, setThreshold] = useState(preferred && options.includes(preferred) ? preferred : options[0]);
  useEffect(() => {
    const next = model?.market.kalshi.defaultThreshold;
    setThreshold(next && options.includes(next) ? next : options[0]);
  }, [event?.eventTicker, model?.market.slug]);
  const market = event?.markets.find((item) => item.threshold === threshold);
  const historicalFit = model?.scores.historicalFit.value;
  const talentPrior = model?.scores.talentPrior.value;
  const currentPrice = market?.lastPrice ?? (
    market?.yesBid != null && market?.yesAsk != null
      ? Math.round((market.yesBid + market.yesAsk) / 2)
      : null
  );
  const historicalMeaning = meaningFor("historical", historicalFit ?? null);
  const talentMeaning = meaningFor("talent", talentPrior ?? null);
  const title = model?.market.title || event?.title || event?.eventTicker;
  const eventPosition = Math.max(1, events.findIndex((item) => item.eventTicker === event?.eventTicker) + 1);
  const automatic = isAutomaticModel(model);
  const enriched = isEnrichedModel(model);

  return (
    <main className="scout-view">
      <MobileSwipeCard event={event} model={model} events={events} threshold={threshold} setThreshold={setThreshold} saved={ideaDisposition === "research"} deferred={ideaDisposition === "later"} onSave={onSave} onLater={onLater} onPass={onPass} onAdvance={onAdvance} onOpenScore={onOpenScore} />
      <section className="feature-grid desktop-scout" aria-label="Featured movie trade idea">
        <MoviePanel event={event} model={model} position={eventPosition} total={events.length} />
        <MarketPanel event={event} model={model} threshold={threshold} setThreshold={setThreshold} liveState={liveState} />
      </section>
      <section className="analysis-grid desktop-scout" aria-label="Cutline analysis">
        <div className="score-rail">
          <div className="score-rail-title"><p className="eyebrow">WHAT THE EVIDENCE SAYS</p><span>CHOOSE A CLUE TO SEE HOW WE KNOW</span></div>
          <div className="scores">{Object.entries(scoreDetails).map(([key, score]) => <ScoreButton key={key} scoreKey={key} score={score} onOpen={onOpenScore} />)}</div>
        </div>
        <article className="thesis-panel">
          <div className="stance-row"><p className="eyebrow">BOTTOM LINE · SCORE OVER {threshold}</p><span className="stance muted">WAIT FOR NOW</span></div>
          {automatic ? (
            <>
              <h2>{currentPrice == null ? "We do not have enough evidence to judge this market yet." : `We cannot tell if ${currentPrice}¢ is a good deal yet.`}</h2>
              <p>{enriched
                ? `We found the right movie and checked ${model.cohort.sampleSize.toLocaleString()} similar releases. Those movies look ${historicalMeaning.phrase}, and the cast and crew history looks ${talentMeaning.phrase}. That is useful background, but we still do not have enough matched critic results to predict whether the score will beat ${threshold}.`
                : `This is only a rough first look based on ${model.cohort.sampleSize.toLocaleString()} older releases and timing. We have not verified this movie's cast, crew, or style yet, and we cannot predict whether the critic score will beat ${threshold}.`}</p>
            </>
          ) : model ? (
            <>
              <h2>{currentPrice == null ? "We do not have enough evidence to judge this market yet." : `We cannot tell if ${currentPrice}¢ is a good deal yet.`}</h2>
              <p>We checked {model.cohort.sampleSize} similar movies, and their results were {historicalMeaning.phrase}. The cast and crew history is {talentMeaning.phrase}. But only {criticBenchmark.audit.joinToTmdb.exactMatches} older movies can be compared fairly across both sources. That is too few for a prediction we trust.</p>
            </>
          ) : (
            <>
              <h2>We can see the betting market, but we cannot judge it yet.</h2>
              <p>We have not matched {title} to trustworthy movie background, so we will not borrow another movie's numbers or pretend to know more than we do.</p>
            </>
          )}
          <div className="source-line"><span>WHAT'S LIVE: KALSHI MARKET PRICE · {liveState.status.toUpperCase()}</span><span>WHAT'S MISSING: A TRUSTWORTHY CRITIC-SCORE PREDICTION</span></div>
        </article>
        <aside className="decision-panel" aria-label="Trade idea actions">
          <div><p className="eyebrow light">WHAT TO DO</p><span className="decision-price">WAIT FOR NOW</span><p className="decision-note">The evidence is not strong enough to call the current price cheap or expensive. Cutline never places a trade.</p></div>
          <div className="decision-actions">
            <button className={ideaDisposition === "research" ? "save-button saved" : "save-button"} onClick={() => onSave({ threshold, market })}>{ideaDisposition === "research" ? "Saved to watch" : "Save to watch"}</button>
            <button className={ideaDisposition === "later" ? "later-button deferred" : "later-button"} onClick={() => onLater({ threshold, market })}>{ideaDisposition === "later" ? "Saved for later" : "Review later"}</button>
            <button className={ideaDisposition === "passed" ? "pass-button passed" : "pass-button"} onClick={() => onPass({ threshold, market })}>{ideaDisposition === "passed" ? "Skipped · revisit" : "Skip this one"}</button>
          </div>
        </aside>
      </section>
      <footer className="data-note desktop-scout"><span>LIVE PRICE FROM KALSHI</span><span>PAST MOVIE DATA FROM TMDB · CRITIC PREDICTION NOT READY</span><span>RESEARCH HELP ONLY · NO TRADE IS PLACED</span></footer>
    </main>
  );
}

function SavedView({ items, onOpenScout, onReview, onRemove, onExport, onImport }) {
  const importRef = useRef(null);
  return (
    <main className="saved-view">
      <div className="saved-heading">
        <div><p className="eyebrow">IDEA BOOK</p><h1>Saved trade ideas</h1></div>
        <div className="saved-heading-actions">
          <button className="back-to-scout" onClick={onExport} disabled={!items.length}>Export ideas</button>
          <button className="back-to-scout" onClick={() => importRef.current?.click()}>Import ideas</button>
          <input ref={importRef} type="file" accept="application/json" hidden onChange={onImport} />
          <button className="back-to-scout" onClick={onOpenScout}>Return to scout</button>
        </div>
      </div>
      {items.length === 0 ? (
        <section className="empty-state"><span>00</span><h2>Your watchlist is clean.</h2><p>Save a thesis from any live movie market, or import a teammate’s Cutline ideas file.</p><button onClick={onOpenScout}>Review live markets</button></section>
      ) : (
        <section className="idea-table" aria-label="Saved movie trade ideas">
          <div className="idea-table-head"><span>MOVIE</span><span>QUESTION</span><span>SIMILAR MOVIES</span><span>PRICE WHEN SAVED</span><span>YOUR CHOICE</span><span>ACTION</span></div>
          {items.map((item) => (
            <article className="idea-row" key={item.id}>
              <div className="idea-release">
                {item.artwork ? <img src={item.artwork} alt="" /> : <span className="idea-art-placeholder">CUT</span>}
                <div><strong>{item.movie}</strong><span>{item.releaseLabel || item.eventTicker}</span></div>
              </div>
              <div className="idea-thesis"><strong>Will the critic score finish above {item.threshold}?</strong><span>{item.disposition === "later" ? "You saved this to review later." : "You saved this to watch. Cutline still cannot tell whether the price is cheap or expensive."}</span></div>
              <div className="idea-stat plain"><strong>{explainScore(item.historicalFit).label}</strong><span>{displayScore(item.historicalFit)}/100 BACKGROUND SCORE</span></div>
              <div className="idea-stat"><strong>{item.marketSnapshot?.lastPrice != null ? `${item.marketSnapshot.lastPrice}¢` : "—"}</strong><span>SAVED LAST TRADE</span></div>
              <div className={item.disposition === "later" ? "idea-status later" : "idea-status"}><span>{item.disposition === "later" ? "REVIEW LATER" : "WATCHING"}</span><small>SAVED {compactDate(item.savedAt)}</small></div>
              <div className="idea-row-actions"><button className="review-idea" onClick={() => onReview(item)}>Review</button><button className="remove-idea" onClick={() => onRemove(item)}>Remove</button></div>
            </article>
          ))}
        </section>
      )}
      <section className="saved-method"><p className="eyebrow">A SIMPLE REVIEW LOOP</p><div><span>01</span><p>Check whether the live price changed</p><span>02</span><p>Share ideas with your team when useful</p><span>03</span><p>Only act when the evidence becomes clear</p></div></section>
    </main>
  );
}

function ScoreDrawer({ scoreKey, scoreDetails, model, liveState, onClose }) {
  const score = scoreDetails[scoreKey];
  if (!score) return null;
  const cohort = model?.cohort;
  const financial = cohort?.financialContext;
  const meaningValue = scoreKey === "talent" && score.sampleSize === 0 ? null : score.value;
  const meaning = meaningFor(scoreKey, meaningValue);
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="score-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-head"><div><p className="eyebrow">{score.kicker} · PLAIN ENGLISH</p><h2 id="drawer-title">{plainScoreLabel(scoreKey)}</h2></div><button onClick={onClose} className="drawer-close">Close</button></div>
        <div className="drawer-plain-result"><strong>{meaning.label}</strong><span>{score.value === null ? "NO SCORE YET" : `${displayScore(score.value)}/100 BACKGROUND SCORE`}</span></div>
        <p className="drawer-summary">{score.summary}</p>
        <div className="drawer-evidence-grid">
          <div><span>{scoreKey === "live" ? "LIVE MARKET" : "SIMILAR MOVIES CHECKED"}</span><strong>{scoreKey === "live" ? liveState.status.toUpperCase() : cohort ? `${cohort.sampleSize} MOVIES` : "NOT READY"}</strong></div>
          <div><span>PAST EXAMPLES USED</span><strong>{score.sampleSize ?? "NOT READY"}</strong></div>
          <div><span>DATA CHECKED</span><strong>{scoreKey === "live" ? compactDate(liveState.slate?.source?.observedAt) : model?.source.snapshotDate || "UNKNOWN"}</strong></div>
          <div><span>WHAT THIS LOOKS AT</span><strong>{scoreKey === "live" ? "CURRENT INTEREST" : model ? "PAST MOVIE RATINGS" : "NOT READY"}</strong></div>
        </div>
        <div className="factor-list">
          {score.factors.map((factor) => {
            const factorMeaning = meaningFor(scoreKey, factor.value);
            return (
              <div className="factor" key={factor.label}>
                <div className="factor-copy"><span>{plainFactorLabel(factor.label)}</span><span>{factor.value === null ? "NOT CONNECTED" : factorMeaning.label}</span></div>
                {factor.value !== null && <div className="factor-track"><span style={{ width: `${factor.value}%` }} /></div>}
                <p className="factor-detail">{plainFactorDetail(factor)}</p>
                {factor.titles?.length > 0 && <p className="factor-titles">For example: {factor.titles.join(" · ")}</p>}
                <details className="factor-technical">
                  <summary>Show the math</summary>
                  <p>{factor.value === null ? factor.status || "Not connected" : `${factor.value}/100 · ${factor.weight}% of the score · adds ${factor.contribution} points.`}</p>
                  <p>{factor.detail}</p>
                </details>
              </div>
            );
          })}
        </div>
        <div className="critic-benchmark">
          <span>WHY WE DON'T PREDICT THE CRITIC SCORE YET</span>
          <strong>Only {criticBenchmark.audit.joinToTmdb.exactMatches} older movies can be compared fairly across both data sources.</strong>
          <p>That is too few examples for a prediction we would trust, so Cutline shows “not ready” instead of guessing.</p>
        </div>
        <details className="deep-dive">
          <summary>See exact math, movie examples, and sources</summary>
          <div className="drawer-formula"><span>EXACT CALCULATION</span><p>{score.formula}</p></div>
          {scoreKey === "historical" && cohort && (
            <div className="cohort-context">
              <div className="cohort-context-head"><span>SIMILAR-MOVIE GROUP</span><strong>{cohort.sampleSize} MOVIES</strong></div>
              <p>{model.methodology.cohortRule}</p>
              <div className="comparable-list">{cohort.recentComparables.map((movie) => <div key={movie.title}><span>{movie.title}</span><span>{movie.releaseDate.slice(0, 4)} · {movie.rating.toFixed(1)} / 10 · {movie.votes.toLocaleString()} votes</span></div>)}</div>
              <div className="financial-line"><span>FINANCIAL BACKGROUND · {financial.completeSampleSize} MOVIES</span><strong>Typical budget {money(financial.medianBudgetUsd)} · reported revenue {money(financial.medianRevenueUsd)}</strong><small>{financial.caveat}</small></div>
            </div>
          )}
          <div className="drawer-provenance"><span>SOURCES & LIMITS</span><p>{score.caveat}</p>{model && <><p>{model.source.attribution}</p><div><a href={model.source.kaggleUrl} target="_blank" rel="noreferrer">Movie data</a><a href={model.source.tmdbUrl} target="_blank" rel="noreferrer">TMDB source</a><a href={criticBenchmark.source.kaggleUrl} target="_blank" rel="noreferrer">Critic data</a></div></>}</div>
          <div className="drawer-status">TECHNICAL STATUS · {score.status}</div>
        </details>
      </aside>
    </div>
  );
}

export function App() {
  const liveState = useKalshiSlate();
  const [view, setView] = useState("scout");
  const [selectedEventTicker, setSelectedEventTicker] = useState(DEFAULT_EVENT);
  const [scoreKey, setScoreKey] = useState(null);
  const [savedItems, setSavedItems] = useState(readDeviceIdeas);
  const [account, setAccount] = useState({ status: "loading", user: null, syncError: false });
  const [toast, setToast] = useState("");

  const events = useMemo(() => {
    const liveEvents = groupKalshiEvents(liveState.slate?.markets || []);
    const byTicker = new Map(liveEvents.map((event) => [event.eventTicker, event]));
    for (const model of MODELS) {
      const ticker = model.market.kalshi.eventTicker;
      if (!byTicker.has(ticker)) {
        byTicker.set(ticker, {
          eventTicker: ticker,
          title: model.market.title,
          closeTime: null,
          markets: model.market.kalshi.thresholds.map((threshold) => ({
            eventTicker: ticker,
            ticker: `${ticker}-${threshold}`,
            title: `${model.market.title} Rotten Tomatoes score?`,
            threshold,
            status: "unavailable",
            lastPrice: null,
            yesBid: null,
            yesAsk: null,
            closeTime: null,
          })),
        });
      }
    }
    return [...byTicker.values()].sort((left, right) => {
      if (left.eventTicker === DEFAULT_EVENT) return -1;
      if (right.eventTicker === DEFAULT_EVENT) return 1;
      return new Date(left.closeTime || "2999-01-01") - new Date(right.closeTime || "2999-01-01");
    });
  }, [liveState.slate]);

  const selectedEvent = events.find((event) => event.eventTicker === selectedEventTicker) || events[0];
  const model = useMemo(() => resolveModel(selectedEvent), [selectedEvent]);
  const scoreDetails = useMemo(() => buildScoreDetails(model, liveState), [model, liveState]);
  const selectedIdea = savedItems.find((item) => item.eventTicker === selectedEvent?.eventTicker) || null;
  const visibleIdeas = savedItems.filter((item) => item.disposition !== "passed");
  const selectedPosition = Math.max(1, events.findIndex((item) => item.eventTicker === selectedEvent?.eventTicker) + 1);

  useEffect(() => {
    let active = true;
    const connectAccount = async () => {
      try {
        const session = await fetchAccountSession();
        if (!active) return;
        if (!session.authenticated) {
          setAccount({ status: "guest", user: null, syncError: false });
          return;
        }
        const guestItems = readDeviceIdeas();
        const serverItems = hydrateIdeas(await fetchAccountIdeas());
        const migratedItems = [];
        let syncError = false;
        for (const item of guestItems) {
          try {
            migratedItems.push(...hydrateIdeas([await upsertAccountIdea(item)]));
          } catch {
            syncError = true;
          }
        }
        if (!active) return;
        const merged = mergeIdeas(serverItems, syncError ? guestItems : migratedItems);
        setSavedItems(merged);
        if (!syncError) window.localStorage.removeItem(IDEA_STORAGE_KEY);
        setAccount({ status: "signedIn", user: session.user, syncError });
      } catch {
        if (!active) return;
        setAccount({ status: "guest", user: null, syncError: true });
      }
    };
    connectAccount();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (account.status !== "signedIn") {
      window.localStorage.setItem(IDEA_STORAGE_KEY, JSON.stringify(savedItems));
    }
  }, [account.status, savedItems]);
  useEffect(() => {
    const handleKey = (event) => event.key === "Escape" && setScoreKey(null);
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const announce = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const rememberIdea = ({ threshold, market }, disposition) => {
    const item = {
      id: `${selectedEvent.eventTicker}-${threshold}`,
      eventTicker: selectedEvent.eventTicker,
      movie: model?.market.title || selectedEvent.title,
      threshold,
      disposition,
      marketUrl: model?.market.kalshi.marketUrl || marketUrl(selectedEvent.eventTicker),
      artwork: model?.market.artwork || null,
      releaseLabel: model?.market.releaseDateLabel || shortDate(selectedEvent.closeTime),
      modelStatus: isAutomaticModel(model) ? `${isEnrichedModel(model) ? "snapshot-enriched automatic prior" : "automatic baseline prior"} · ${model.automation.specificity} specificity` : model ? "configured historical prior" : "unavailable",
      historicalFit: model?.scores.historicalFit.value ?? null,
      talentPrior: model?.scores.talentPrior.value ?? null,
      marketSnapshot: market
        ? {
            lastPrice: market.lastPrice,
            yesBid: market.yesBid,
            yesAsk: market.yesAsk,
            volume: market.volume,
            observedAt: liveState.slate?.source?.observedAt || null,
            sourceMode: liveState.status,
          }
        : null,
      savedAt: new Date().toISOString(),
    };
    setSavedItems((items) => [item, ...items.filter((existing) => existing.eventTicker !== item.eventTicker)]);
    if (account.status === "signedIn") {
      upsertAccountIdea(item).catch(() => {
        const pending = mergeIdeas([item], readDeviceIdeas());
        window.localStorage.setItem(IDEA_STORAGE_KEY, JSON.stringify(pending));
        setAccount((current) => ({ ...current, syncError: true }));
        announce("Account sync paused · decision backed up on this device");
      });
    }
    announce(
      disposition === "later"
        ? "Saved for later · return from Saved"
        : disposition === "passed"
          ? "Passed for now · decision remembered"
          : "Research idea saved · no trade placed",
    );
  };

  const saveIdea = (idea) => rememberIdea(idea, "research");
  const saveForLater = (idea) => rememberIdea(idea, "later");
  const passIdea = (idea) => rememberIdea(idea, "passed");

  const removeIdea = async (item) => {
    if (account.status === "signedIn") {
      try {
        await removeAccountIdea(item.eventTicker);
      } catch {
        setAccount((current) => ({ ...current, syncError: true }));
        announce("Could not remove this idea from account sync");
        return;
      }
    }
    setSavedItems((items) => items.filter((candidate) => candidate.eventTicker !== item.eventTicker));
    announce("Idea removed");
  };

  const exportIdeas = () => {
    const payload = createIdeasExport(visibleIdeas);
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cutline-ideas-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    announce(`Exported ${visibleIdeas.length} research idea${visibleIdeas.length === 1 ? "" : "s"}`);
  };

  const importIdeas = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = parseIdeasExport(await file.text());
      const hydrated = hydrateIdeas(imported);
      setSavedItems((items) => mergeIdeas(items, hydrated));
      if (account.status === "signedIn") {
        const results = await Promise.allSettled(hydrated.map(upsertAccountIdea));
        if (results.some((result) => result.status === "rejected")) {
          window.localStorage.setItem(IDEA_STORAGE_KEY, JSON.stringify(hydrated));
          setAccount((current) => ({ ...current, syncError: true }));
          announce("Imported locally · some account sync writes are pending");
          return;
        }
      }
      announce(`Imported ${imported.length} research idea${imported.length === 1 ? "" : "s"}`);
    } catch (error) {
      announce(error.message);
    }
  };

  const advanceEvent = (step = 1) => {
    if (!events.length) return;
    const currentIndex = Math.max(0, events.findIndex((item) => item.eventTicker === selectedEvent?.eventTicker));
    const nextIndex = (currentIndex + step + events.length) % events.length;
    setSelectedEventTicker(events[nextIndex].eventTicker);
  };

  return (
    <div className="app-shell">
      <Header view={view} setView={setView} savedCount={visibleIdeas.length} liveState={liveState} position={selectedPosition} total={events.length} account={account} />
      {view === "saved" ? (
        <SavedView items={visibleIdeas} onOpenScout={() => setView("scout")} onReview={(item) => { setSelectedEventTicker(item.eventTicker); setView("scout"); }} onRemove={removeIdea} onExport={exportIdeas} onImport={importIdeas} />
      ) : (
        <>
          <SlateStrip
            events={events}
            selectedEventTicker={selectedEvent?.eventTicker || DEFAULT_EVENT}
            onSelect={setSelectedEventTicker}
            configuredCount={events.filter((event) => MODEL_BY_EVENT.has(event.eventTicker)).length}
            enrichedCount={events.filter((event) => !MODEL_BY_EVENT.has(event.eventTicker) && isEnrichedModel(resolveModel(event))).length}
            liveState={liveState}
          />
          <ScoutView event={selectedEvent} model={model} events={events} liveState={liveState} scoreDetails={scoreDetails} ideaDisposition={selectedIdea?.disposition || null} onSave={saveIdea} onLater={saveForLater} onPass={passIdea} onAdvance={advanceEvent} onOpenScore={setScoreKey} />
        </>
      )}
      {scoreKey && <ScoreDrawer scoreKey={scoreKey} scoreDetails={scoreDetails} model={model} liveState={liveState} onClose={() => setScoreKey(null)} />}
      <div className={toast ? "toast visible" : "toast"} role="status">{toast}</div>
    </div>
  );
}
