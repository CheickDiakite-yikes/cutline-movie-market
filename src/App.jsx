import { useEffect, useMemo, useRef, useState } from "react";
import "@fontsource/anton";
import "@fontsource/ibm-plex-sans-condensed/400.css";
import "@fontsource/ibm-plex-sans-condensed/600.css";
import "@fontsource/ibm-plex-sans-condensed/700.css";
import { ArrowLeft, ArrowRight, CaretRight } from "@phosphor-icons/react";
import automaticPrior from "./data/automatic-prior.json";
import criticBenchmark from "./data/critic-benchmark.json";
import { buildAutomaticModel } from "./lib/automatic-model.js";
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

const marketModules = import.meta.glob("./data/markets/*.json", {
  eager: true,
  import: "default",
});
const MODELS = Object.values(marketModules);
const MODEL_BY_EVENT = new Map(MODELS.map((model) => [model.market.kalshi.eventTicker, model]));
const DEFAULT_EVENT = MODELS[0]?.market.kalshi.eventTicker || "KXRT-RES";
const resolveModel = (event) => {
  if (!event) return null;
  return MODEL_BY_EVENT.get(event.eventTicker) || buildAutomaticModel(event, automaticPrior);
};
const isAutomaticModel = (model) => model?.automation?.mode === "automatic-hierarchical-prior";

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

const displayScore = (value) => (typeof value === "number" ? Math.round(value) : "—");
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
        kicker: "Historical 01",
        label: "Historical fit",
        summary: "This market is live, but its historical comparable cohort has not been generated yet.",
      },
      live: createLiveScore(liveConnected, liveCached, liveState, criticCount, criticJoin),
      talent: {
        ...unmodeled,
        kicker: "Historical 03",
        label: "Talent prior",
        summary: "Cast, director, and producer histories are unavailable until this movie receives a market configuration.",
      },
      coverage: {
        ...unmodeled,
        kicker: "Coverage 04",
        label: "Data coverage",
        summary: "Coverage cannot be assessed until target metadata and historical joins are generated.",
      },
    };
  }

  const historicalFit = model.scores.historicalFit;
  const talentPrior = model.scores.talentPrior;
  const dataCoverage = model.scores.dataCoverage;
  const cohort = model.cohort;
  const automatic = isAutomaticModel(model);
  const specificity = model.automation?.specificity?.toUpperCase();
  return {
    historical: {
      kicker: "Historical 01",
      label: "Historical fit",
      value: historicalFit.value,
      sampleSize: historicalFit.sampleSize,
      summary: automatic
        ? `An automatic ${displayScore(historicalFit.value)}/100 historical context prior built from ${cohort.sampleSize.toLocaleString()} eligible releases, settlement-month context, and optional strongly-shrunk title-family evidence.`
        : `A reproducible ${displayScore(historicalFit.value)}/100 historical context score from prior TMDB community ratings, grounded in a ${cohort.sampleSize}-film comparable cohort.`,
      status: automatic
        ? `Automatic hierarchical prior · ${specificity} specificity · ${model.source.snapshotDate}`
        : `Kaggle / TMDB historical prior · ${model.source.snapshotDate}`,
      formula: automatic
        ? "The global historical baseline receives 55%, settlement-month context 25%, and strongly-shrunk lexical title-family context 20%. Missing evidence stays at the baseline and lowers coverage."
        : "Each factor is a TMDB community-rating prior on a 0–100 scale. Small filmographies shrink toward the comparable cohort, then the configured weights are summed.",
      caveat: automatic
        ? model.automation.caveat
        : "This score is not a Tomatometer estimate and does not imply a Kalshi threshold probability.",
      factors: historicalFit.factors,
    },
    live: createLiveScore(liveConnected, liveCached, liveState, criticCount, criticJoin),
    talent: {
      kicker: "Historical 03",
      label: "Talent prior",
      value: talentPrior.value,
      sampleSize: talentPrior.sampleSize,
      summary: automatic
        ? "Target cast, director, and producer identities are not connected yet. The visible talent value is an explicit global-baseline imputation, not invented filmography evidence."
        : `The configured lead cast, director, and credited producers resolve to ${talentPrior.sampleSize} unique eligible prior films after deduplication.`,
      status: automatic
        ? `Imputed baseline · target talent enrichment pending · ${model.source.snapshotDate}`
        : `Kaggle / TMDB historical prior · ${model.source.snapshotDate}`,
      formula: automatic
        ? "Until verified target identities are joined, the eligible-release baseline is carried forward at 100% and the talent sample remains n=0."
        : "Prior-film TMDB community ratings are deduplicated within each factor, shrunk toward the comparable cohort, and combined at the declared weights.",
      caveat: automatic
        ? "The talent value is a missing-feature imputation and must not be described as the target cast or crew track record."
        : "This score is not a Tomatometer estimate and does not imply a Kalshi threshold probability.",
      factors: talentPrior.factors,
    },
    coverage: {
      kicker: "Coverage 04",
      label: "Data coverage",
      value: dataCoverage.value,
      sampleSize: dataCoverage.sampleSize,
      summary: automatic
        ? `This ${displayScore(dataCoverage.value)}/100 availability score exposes which automatic inputs are present. Target genre, talent, and artwork remain enrichment gaps.`
        : "This is an availability score, not trade confidence. It measures historical fields, named-talent joins, and target context.",
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
    kicker: "Live 02",
    label: "Live heat",
    value: null,
    sampleSize: null,
    summary:
      "Kalshi market prices are connected as live context, and a Rotten Tomatoes outcome benchmark is audited. Trailer, search, social, and a validated critic calibration model remain unconnected.",
    status: `${marketStatus} · no composite live score`,
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

function Header({ view, setView, savedCount, liveState, position, total }) {
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
          Saved <span>{String(savedCount).padStart(2, "0")}</span>
        </button>
      </div>
      <nav className="primary-nav" aria-label="Primary navigation">
        <button className={view === "scout" ? "nav-link nav-scout active" : "nav-link nav-scout"} onClick={() => setView("scout")}>Scout</button>
        <button className={view === "saved" ? "nav-link nav-saved active" : "nav-link nav-saved"} onClick={() => setView("saved")}>Saved ideas <span className="nav-count">{String(savedCount).padStart(2, "0")}</span></button>
      </nav>
      <div className={`freshness ${liveState.status}`}>
        <span className="freshness-dot" aria-hidden="true" />
        {freshness}
      </div>
      <div className="mobile-progress" aria-label={view === "scout" ? `Trade idea ${position} of ${total}` : `${savedCount} saved ideas`}>
        {view === "scout" ? <><strong>{String(position).padStart(2, "0")}</strong><span>/</span>{String(total).padStart(2, "0")}</> : <><strong>{String(savedCount).padStart(2, "0")}</strong><span>SAVED</span></>}
      </div>
    </header>
  );
}

function SlateStrip({ events, selectedEventTicker, onSelect, configuredCount, liveState }) {
  const automaticCount = Math.max(0, events.length - configuredCount);
  return (
    <section className="slate-strip" aria-label="Movie market slate">
      <div>
        <p className="eyebrow">CONTINUOUS KXRT SLATE</p>
        <span>{events.length} MODELED EVENTS · {configuredCount} CONFIGURED · {automaticCount} AUTOMATIC</span>
      </div>
      <label>
        <span>SELECT MOVIE MARKET</span>
        <select value={selectedEventTicker} onChange={(event) => onSelect(event.target.value)}>
          {events.map((item) => (
            <option key={item.eventTicker} value={item.eventTicker}>
              {item.title} — {MODEL_BY_EVENT.has(item.eventTicker) ? "configured model" : "automatic prior"}
            </option>
          ))}
        </select>
      </label>
      <div className="slate-status">
        <strong>{liveState.status === "live" ? "LIVE" : liveState.status.toUpperCase()}</strong>
        <span>PUBLIC API · NO TRADE EXECUTION</span>
      </div>
    </section>
  );
}

function ScoreButton({ scoreKey, score, onOpen }) {
  const scoreLabel = displayScore(score.value);
  return (
    <button className={score.value === null ? "score-button unavailable" : "score-button"} onClick={() => onOpen(scoreKey)} aria-label={score.value === null ? `Explain why ${score.label} is unavailable` : `Explain ${score.label} score of ${scoreLabel}`}>
      <span className="score-number">{scoreLabel}</span>
      <span className="score-copy"><span>{score.label}</span><small>{score.value === null ? "OPEN SOURCE STATUS" : "OPEN RATIONALE"}</small></span>
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
          <p className="eyebrow">KALSHI · ROTTEN TOMATOES</p>
          <h2 id="market-heading">Will the score finish above {threshold}?</h2>
        </div>
        <a href={link} target="_blank" rel="noreferrer" className="market-link">Open market</a>
      </div>
      <div className="thresholds" aria-label="Choose Rotten Tomatoes threshold" style={{ "--threshold-count": options.length }}>
        {options.map((item) => (
          <button key={item} onClick={() => setThreshold(item)} className={threshold === item ? "threshold active" : "threshold"}>ABOVE {item}</button>
        ))}
      </div>
      <div className="probability-grid">
        <div className="probability-block market-probability">
          <span>MARKET LAST TRADE</span>
          <strong className={price === null || price === undefined ? "unavailable-value" : ""}>{price === null || price === undefined ? "—" : `${price}%`}</strong>
          <small>{market ? `YES BID ${market.yesBid ?? "—"}¢ · ASK ${market.yesAsk ?? "—"}¢` : "LIVE CONTRACT UNAVAILABLE"}</small>
        </div>
        <div className="probability-block model-probability">
          <span>RT PROBABILITY</span>
          <strong className="unavailable-value">—</strong>
          <small>{criticBenchmark.audit.eligibleOutcomeRows} LABEL BENCHMARK · NOT CALIBRATED</small>
        </div>
        <div className="edge-block">
          <span>MODEL EDGE</span>
          <strong className="unavailable-value">—</strong>
          <small>NOT CALCULATED</small>
        </div>
      </div>
      <div className="market-foot">
        <div><span className="market-meta-label">Market closes</span><strong>{compactDate(market?.closeTime || event?.closeTime)}</strong></div>
        <div><span className="market-meta-label">Source freshness</span><strong>{liveState.status === "live" ? compactDate(liveState.slate?.source?.observedAt) : liveState.status.toUpperCase()}</strong></div>
      </div>
    </section>
  );
}

function MoviePanel({ event, model, position, total }) {
  const title = model?.market.title || event?.title || "Unconfigured movie";
  const hasArtwork = Boolean(model?.market.artwork);
  const automatic = isAutomaticModel(model);
  return (
    <article className={hasArtwork ? "movie-panel" : "movie-panel unmodeled"}>
      {hasArtwork ? (
        <img src={model.market.artwork} alt={model.market.artworkAlt} />
      ) : (
        <div className="unmodeled-art" aria-label={`${title} artwork is not configured`}>
          <span>{automatic ? "AUTOMATIC HISTORICAL PRIOR" : "MARKET CONNECTED"}</span><strong>{title}</strong><small>{automatic ? `${model.automation.specificity.toUpperCase()} SPECIFICITY · TARGET ENRICHMENT PENDING` : "POSTER + RESEARCH PACK NOT BUILT"}</small>
        </div>
      )}
      <div className="movie-overlay">
        <div><p className="eyebrow light">ACTIVE RELEASE · {String(position).padStart(2, "0")} / {String(total).padStart(2, "0")}</p><h1>{title}</h1></div>
        <div className="movie-meta">
          <span>{model?.market.releaseDateLabel || shortDate(event?.closeTime)}</span>
          <span>{model?.market.genreLabel || "LIVE MARKET"}</span>
          <span>{automatic ? "AUTO MODEL" : model ? "CONFIGURED MODEL" : "MARKET ONLY"}</span>
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
  const options = chooseThresholds(event, model?.market.kalshi.thresholds || [75, 80, 85]);
  const market = event?.markets.find((item) => item.threshold === threshold);
  const midpoint = market?.yesBid !== null && market?.yesAsk !== null
    ? Math.round((market.yesBid + market.yesAsk) / 2)
    : null;
  const price = market?.lastPrice ?? midpoint;
  const scoreRows = [
    {
      key: "historical",
      label: "FIT",
      value: model?.scores.historicalFit.value ?? null,
      detail: automatic ? `${model.cohort.sampleSize.toLocaleString()} releases anchor the automatic prior.` : model ? `${model.cohort.sampleSize} comparable releases anchor the prior.` : "Historical cohort not generated.",
    },
    {
      key: "talent",
      label: "TALENT",
      value: model?.scores.talentPrior.value ?? null,
      detail: automatic ? "Global imputation; target talent enrichment is pending." : model ? "Cast, director, and producer track record." : "Named-talent joins are not generated.",
    },
    {
      key: "coverage",
      label: "COVERAGE",
      value: model?.scores.dataCoverage.value ?? null,
      detail: automatic ? `${model.automation.specificity} specificity · availability only.` : model ? "Availability only — not model confidence." : "Target data coverage is not assessed.",
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
      else onPass();
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
  const synthesis = automatic
    ? "Automatic prior is live; target enrichment and critic probability are withheld."
    : model
      ? "Market is live; historical fit is moderate; critic probability is withheld."
    : "Market is live; movie-specific historical evidence is not generated."
  const recommendation = model ? "PASS FOR NOW" : "RESEARCH ONLY";

  return (
    <section className="mobile-scout" aria-label="Swipe through movie trade ideas">
      {nextEvent && (
        <div className={nextModel?.market.artwork ? "mobile-next-peek" : "mobile-next-peek unmodeled"} aria-hidden="true">
          {nextModel?.market.artwork ? <img src={nextModel.market.artwork} alt="" /> : <span>{nextEvent.title}</span>}
        </div>
      )}
      <article
        className={isAnimating ? "mobile-trade-card animating" : "mobile-trade-card"}
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
            <div><span>{automatic ? "AUTOMATIC HISTORICAL PRIOR" : "LIVE MARKET ONLY"}</span><strong>{title}</strong><small>{automatic ? `${model.automation.specificity.toUpperCase()} SPECIFICITY · ENRICHMENT PENDING` : "POSTER + RESEARCH PACK NOT BUILT"}</small></div>
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
              <span>MARKET QUESTION</span>
              <strong>ABOVE {threshold}?</strong>
            </button>
            <div className="mobile-market-columns">
              <div className="mobile-live-price">
                <span>LIVE MARKET</span>
                <strong className={price == null ? "unavailable-value" : ""}>{price == null ? "—" : `${price}¢`}</strong>
                <p>{market ? `${market.yesBid ?? "—"}¢ / ${market.yesAsk ?? "—"}¢` : "— / —"}</p>
                <small>BID / ASK</small>
              </div>
              <div className="mobile-model-score">
                <span>{automatic ? "AUTO HISTORICAL MODEL" : "HISTORICAL MODEL"}</span>
                <strong className={model ? "" : "status-label"}>{model ? displayScore(model.scores.historicalFit.value) : "NOT BUILT"}</strong>
                <button onClick={() => onOpenScore("historical")}>{model ? "TRACE SCORE" : "WHY UNAVAILABLE"} <CaretRight aria-hidden="true" weight="bold" /></button>
              </div>
            </div>
          </section>

          <section className="mobile-callout">
            <div><span>RECOMMENDATION</span><strong>{recommendation}</strong><p>{model ? "No calibrated critic edge." : "Historical score withheld."}</p></div>
            <div><span>SYNTHESIS</span><p>{synthesis}</p></div>
          </section>

          <section className="mobile-score-list" aria-label="Explainable model scores">
            {scoreRows.map((row) => (
              <button key={row.key} onClick={() => onOpenScore(row.key)}>
                <span>{row.label}</span>
                <strong>{row.value == null ? "N/A" : displayScore(row.value)}</strong>
                <p>{row.detail}</p>
                <CaretRight aria-hidden="true" weight="bold" />
              </button>
            ))}
          </section>

          <div className="mobile-actions" aria-label="Trade idea actions">
            <button className="mobile-pass" onClick={() => completeSwipe("left")}><strong>PASS</strong><span>NO EDGE</span></button>
            <button className={deferred ? "mobile-later deferred" : "mobile-later"} onClick={completeLater}><strong>LATER</strong><span>{deferred ? "IN IDEA BOOK" : "COME BACK"}</span></button>
            <button className={saved ? "mobile-save saved" : "mobile-save"} onClick={() => completeSwipe("right")}><strong>{saved ? "SAVED" : "SAVE"}</strong><span>{saved ? "IN IDEA BOOK" : "ADD TO IDEAS"}</span></button>
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
  const title = model?.market.title || event?.title || event?.eventTicker;
  const eventPosition = Math.max(1, events.findIndex((item) => item.eventTicker === event?.eventTicker) + 1);
  const automatic = isAutomaticModel(model);

  return (
    <main className="scout-view">
      <MobileSwipeCard event={event} model={model} events={events} threshold={threshold} setThreshold={setThreshold} saved={ideaDisposition === "research"} deferred={ideaDisposition === "later"} onSave={onSave} onLater={onLater} onPass={onPass} onAdvance={onAdvance} onOpenScore={onOpenScore} />
      <section className="feature-grid desktop-scout" aria-label="Featured movie trade idea">
        <MoviePanel event={event} model={model} position={eventPosition} total={events.length} />
        <MarketPanel event={event} model={model} threshold={threshold} setThreshold={setThreshold} liveState={liveState} />
      </section>
      <section className="analysis-grid desktop-scout" aria-label="Cutline analysis">
        <div className="score-rail">
          <div className="score-rail-title"><p className="eyebrow">WHY THIS MODEL MOVED</p><span>SELECT A SCORE TO TRACE IT</span></div>
          <div className="scores">{Object.entries(scoreDetails).map(([key, score]) => <ScoreButton key={key} scoreKey={key} score={score} onOpen={onOpenScore} />)}</div>
        </div>
        <article className="thesis-panel">
          <div className="stance-row"><p className="eyebrow">CUTLINE CALL · ABOVE {threshold}</p><span className="stance muted">RESEARCH ONLY</span></div>
          {automatic ? (
            <>
              <h2>Every live market receives an automatic prior; this one is {model.automation.specificity}-specificity.</h2>
              <p>The automatic layer scores historical context at {displayScore(historicalFit)} from {model.cohort.sampleSize.toLocaleString()} eligible releases, settlement-month context, and any strongly-shrunk title-family evidence. The talent value is explicitly imputed until verified cast and crew metadata is joined. No critic probability or edge is produced.</p>
            </>
          ) : model ? (
            <>
              <h2>Live market context is connected; the critic probability is still withheld.</h2>
              <p>The historical layer scores fit at {displayScore(historicalFit)} and talent at {displayScore(talentPrior)}, anchored to {model.cohort.sampleSize} comparable releases. Kalshi is live, and {criticBenchmark.audit.eligibleOutcomeRows} critic outcomes are audited, but the {criticBenchmark.audit.joinToTmdb.exactMatches}-film exact join is too small for defensible threshold calibration.</p>
            </>
          ) : (
            <>
              <h2>This live market is ready for research, but not yet historically modeled.</h2>
              <p>{title} is present in the live Kalshi slate. Cutline will not borrow Resident Evil’s cohort or talent score; add a movie-specific configuration and rebuild before using historical context.</p>
            </>
          )}
          <div className="source-line"><span>MARKET: KALSHI PUBLIC API · {liveState.status.toUpperCase()}</span><span>CRITIC BENCHMARK: {criticBenchmark.audit.eligibleOutcomeRows} LABELS · CALIBRATION PENDING</span></div>
        </article>
        <aside className="decision-panel" aria-label="Trade idea actions">
          <div><p className="eyebrow light">DECISION</p><span className="decision-price">NO CALIBRATED ENTRY</span><p className="decision-note">Decision support only. No trade is placed here.</p></div>
          <div className="decision-actions">
            <button className={ideaDisposition === "research" ? "save-button saved" : "save-button"} onClick={() => onSave({ threshold, market })}>{ideaDisposition === "research" ? "Idea saved" : "Save research idea"}</button>
            <button className={ideaDisposition === "later" ? "later-button deferred" : "later-button"} onClick={() => onLater({ threshold, market })}>{ideaDisposition === "later" ? "Saved for later" : "Come back later"}</button>
            <button className="pass-button" onClick={onPass}>Pass for now</button>
          </div>
        </aside>
      </section>
      <footer className="data-note desktop-scout"><span>KALSHI LIVE MARKET CONTEXT · PUBLIC API</span><span>TMDB PRIORS + RT OUTCOME BENCHMARK · PROBABILITY NOT CALIBRATED</span><span>NOT FINANCIAL ADVICE</span></footer>
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
          <div className="idea-table-head"><span>RELEASE</span><span>MARKET / THESIS</span><span>HISTORICAL</span><span>MARKET</span><span>STATUS</span><span>ACTION</span></div>
          {items.map((item) => (
            <article className="idea-row" key={item.id}>
              <div className="idea-release">
                {item.artwork ? <img src={item.artwork} alt="" /> : <span className="idea-art-placeholder">CUT</span>}
                <div><strong>{item.movie}</strong><span>{item.releaseLabel || item.eventTicker}</span></div>
              </div>
              <div className="idea-thesis"><strong>RT score above {item.threshold}</strong><span>{item.disposition === "later" ? "Held for another pass; no research decision has been made." : "Saved research snapshot; critic probability and entry remain withheld."}</span></div>
              <div className="idea-stat"><strong>{displayScore(item.historicalFit)}</strong><span>FIT / 100</span></div>
              <div className="idea-stat"><strong>{item.marketSnapshot?.lastPrice != null ? `${item.marketSnapshot.lastPrice}¢` : "—"}</strong><span>SAVED LAST TRADE</span></div>
              <div className={item.disposition === "later" ? "idea-status later" : "idea-status"}><span>{item.disposition === "later" ? "LATER" : "RESEARCH"}</span><small>SAVED {compactDate(item.savedAt)}</small></div>
              <div className="idea-row-actions"><button className="review-idea" onClick={() => onReview(item)}>Review</button><button className="remove-idea" onClick={() => onRemove(item.id)}>Remove</button></div>
            </article>
          ))}
        </section>
      )}
      <section className="saved-method"><p className="eyebrow">TEAM RESEARCH LOOP</p><div><span>01</span><p>Refresh live Kalshi price and volume</p><span>02</span><p>Export or merge teammate idea files</p><span>03</span><p>Calibrate only after forward validation</p></div></section>
    </main>
  );
}

function ScoreDrawer({ scoreKey, scoreDetails, model, liveState, onClose }) {
  const score = scoreDetails[scoreKey];
  if (!score) return null;
  const cohort = model?.cohort;
  const financial = cohort?.financialContext;
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="score-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-head"><div><p className="eyebrow">{score.kicker}</p><h2 id="drawer-title">{score.label}</h2></div><button onClick={onClose} className="drawer-close">Close</button></div>
        <div className="drawer-score"><strong className={score.value === null ? "unavailable-value" : ""}>{displayScore(score.value)}</strong><span>{score.value === null ? "NOT SCORED" : "/ 100"}</span></div>
        <p className="drawer-summary">{score.summary}</p>
        <div className="drawer-evidence-grid">
          <div><span>{scoreKey === "live" ? "MARKET SOURCE" : "HISTORICAL COHORT"}</span><strong>{scoreKey === "live" ? liveState.status.toUpperCase() : cohort ? `${cohort.sampleSize} films` : "NOT GENERATED"}</strong></div>
          <div><span>SCORE SAMPLE</span><strong>{score.sampleSize ?? "N/A"}</strong></div>
          <div><span>FRESHNESS</span><strong>{scoreKey === "live" ? compactDate(liveState.slate?.source?.observedAt) : model?.source.snapshotDate || "N/A"}</strong></div>
          <div><span>OUTCOME</span><strong>{scoreKey === "live" ? "NO COMPOSITE" : model ? "TMDB USER RATING" : "N/A"}</strong></div>
        </div>
        <div className="factor-list">
          {score.factors.map((factor) => (
            <div className="factor" key={factor.label}>
              <div className="factor-copy"><span>{factor.label}</span><span>{factor.value === null ? factor.status || "NOT CONNECTED" : `${factor.weight}% weight · ${factor.value}/100 · +${factor.contribution} pts${factor.status ? ` · ${factor.status}` : ""}`}</span></div>
              {factor.value !== null && <div className="factor-track"><span style={{ width: `${factor.value}%` }} /></div>}
              <p className="factor-detail">{factor.detail} {factor.sampleSize !== null && factor.sampleSize !== undefined && `Sample n=${factor.sampleSize}.`}</p>
              {factor.titles?.length > 0 && <p className="factor-titles">Examples: {factor.titles.join(" · ")}</p>}
            </div>
          ))}
        </div>
        <div className="drawer-formula"><span>CALCULATION</span><p>{score.formula}</p></div>
        {scoreKey === "historical" && cohort && (
          <div className="cohort-context">
            <div className="cohort-context-head"><span>{isAutomaticModel(model) ? "AUTOMATIC REFERENCE COHORT" : "COMPARABLE-FILM COHORT"}</span><strong>N={cohort.sampleSize}</strong></div>
            <p>{model.methodology.cohortRule}</p>
            <div className="comparable-list">{cohort.recentComparables.map((movie) => <div key={movie.title}><span>{movie.title}</span><span>{movie.releaseDate.slice(0, 4)} · {movie.rating.toFixed(1)} / 10 · {movie.votes.toLocaleString()} votes</span></div>)}</div>
            <div className="financial-line"><span>FINANCIAL CONTEXT · N={financial.completeSampleSize}</span><strong>Median budget {money(financial.medianBudgetUsd)} · revenue {money(financial.medianRevenueUsd)}</strong><small>{financial.caveat}</small></div>
          </div>
        )}
        <div className="critic-benchmark">
          <span>CRITIC OUTCOME BENCHMARK</span>
          <strong>{criticBenchmark.audit.eligibleOutcomeRows} eligible labels · {criticBenchmark.audit.joinToTmdb.exactMatches} exact TMDB joins</strong>
          <p>{criticBenchmark.calibration.reason}</p>
          <a href={criticBenchmark.source.kaggleUrl} target="_blank" rel="noreferrer">Review benchmark source</a>
        </div>
        <div className="drawer-provenance"><span>PROVENANCE & LIMITS</span><p>{score.caveat}</p>{model && <><p>{model.source.attribution}</p><div><a href={model.source.kaggleUrl} target="_blank" rel="noreferrer">TMDB dataset</a><a href={model.source.tmdbUrl} target="_blank" rel="noreferrer">TMDB source</a></div></>}</div>
        <div className="drawer-status">{score.status}</div>
      </aside>
    </div>
  );
}

export function App() {
  const liveState = useKalshiSlate();
  const [view, setView] = useState("scout");
  const [selectedEventTicker, setSelectedEventTicker] = useState(DEFAULT_EVENT);
  const [scoreKey, setScoreKey] = useState(null);
  const [savedItems, setSavedItems] = useState(() => {
    try {
      return hydrateIdeas(JSON.parse(window.localStorage.getItem(IDEA_STORAGE_KEY)) || []);
    } catch {
      return [];
    }
  });
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
  const selectedPosition = Math.max(1, events.findIndex((item) => item.eventTicker === selectedEvent?.eventTicker) + 1);

  useEffect(() => {
    window.localStorage.setItem(IDEA_STORAGE_KEY, JSON.stringify(savedItems));
  }, [savedItems]);
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
      modelStatus: isAutomaticModel(model) ? `automatic prior · ${model.automation.specificity} specificity` : model ? "configured historical prior" : "unavailable",
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
    announce(disposition === "later" ? "Saved for later · return from Saved" : "Research idea saved · no trade placed");
  };

  const saveIdea = (idea) => rememberIdea(idea, "research");
  const saveForLater = (idea) => rememberIdea(idea, "later");

  const exportIdeas = () => {
    const payload = createIdeasExport(savedItems);
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cutline-ideas-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    announce(`Exported ${savedItems.length} research idea${savedItems.length === 1 ? "" : "s"}`);
  };

  const importIdeas = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = parseIdeasExport(await file.text());
      setSavedItems((items) => mergeIdeas(items, hydrateIdeas(imported)));
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
      <Header view={view} setView={setView} savedCount={savedItems.length} liveState={liveState} position={selectedPosition} total={events.length} />
      {view === "saved" ? (
        <SavedView items={savedItems} onOpenScout={() => setView("scout")} onReview={(item) => { setSelectedEventTicker(item.eventTicker); setView("scout"); }} onRemove={(id) => setSavedItems((items) => items.filter((item) => item.id !== id))} onExport={exportIdeas} onImport={importIdeas} />
      ) : (
        <>
          <SlateStrip events={events} selectedEventTicker={selectedEvent?.eventTicker || DEFAULT_EVENT} onSelect={setSelectedEventTicker} configuredCount={events.filter((event) => MODEL_BY_EVENT.has(event.eventTicker)).length} liveState={liveState} />
          <ScoutView event={selectedEvent} model={model} events={events} liveState={liveState} scoreDetails={scoreDetails} ideaDisposition={selectedIdea?.disposition || null} onSave={saveIdea} onLater={saveForLater} onPass={() => announce("Passed for now · moved to the next live market")} onAdvance={advanceEvent} onOpenScore={setScoreKey} />
        </>
      )}
      {scoreKey && <ScoreDrawer scoreKey={scoreKey} scoreDetails={scoreDetails} model={model} liveState={liveState} onClose={() => setScoreKey(null)} />}
      <div className={toast ? "toast visible" : "toast"} role="status">{toast}</div>
    </div>
  );
}
