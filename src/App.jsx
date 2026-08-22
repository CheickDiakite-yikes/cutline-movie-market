import { useEffect, useMemo, useState } from "react";
import historical from "./data/resident-evil-historical.json";

const MARKET_URL = "https://kalshi.com/markets/kxrt/rotten-tomatoes-scores/kxrt-res";
const DATASET_URL = historical.source.kaggleUrl;
const TMDB_URL = historical.source.tmdbUrl;
const cohort = historical.cohort;
const historicalFit = historical.scores.historicalFit;
const talentPrior = historical.scores.talentPrior;
const dataCoverage = historical.scores.dataCoverage;

const displayScore = (value) => (typeof value === "number" ? Math.round(value) : "—");
const money = (value) => `$${Math.round(value / 1_000_000)}M`;

const scoreDetails = {
  historical: {
    kicker: "Historical 01",
    label: "Historical fit",
    value: historicalFit.value,
    sampleSize: historicalFit.sampleSize,
    summary:
      `A reproducible ${displayScore(historicalFit.value)}/100 historical context score from prior TMDB community ratings. It is grounded in a ${cohort.sampleSize}-film comparable cohort, not Rotten Tomatoes critic outcomes.`,
    status: `Kaggle / TMDB historical prior · ${historical.source.snapshotDate}`,
    formula:
      "Each factor is a TMDB community-rating prior on a 0–100 scale. Small filmographies shrink toward the comparable cohort, then the displayed weights are summed.",
    caveat: "This score is not a Rotten Tomatoes Tomatometer estimate and does not imply a Kalshi threshold probability.",
    factors: historicalFit.factors,
  },
  live: {
    kicker: "Live 02",
    label: "Live heat",
    value: null,
    sampleSize: null,
    summary:
      "No live score is shown because critic reviews, trailer velocity, search interest, and social chatter are not connected. The manual Kalshi snapshot remains a separate reference input.",
    status: "Unavailable · live connectors not configured",
    formula: "No calculation runs until source timestamps, observations, and normalization rules are connected.",
    caveat: "Unavailable signals contribute zero evidence, not a neutral or estimated score.",
    factors: historical.unconnectedSignals.map((signal) => ({
      label: signal.name,
      value: null,
      weight: null,
      contribution: null,
      sampleSize: null,
      detail: signal.status,
      titles: [],
    })),
  },
  talent: {
    kicker: "Historical 03",
    label: "Talent prior",
    value: talentPrior.value,
    sampleSize: talentPrior.sampleSize,
    summary:
      `The first four billed cast members, Zach Cregger, and the credited producers resolve to ${talentPrior.sampleSize} unique eligible prior films after deduplication.`,
    status: `Kaggle / TMDB historical prior · ${historical.source.snapshotDate}`,
    formula:
      "Prior-film TMDB community ratings are deduplicated within each factor, shrunk toward the comparable cohort, and combined at the declared weights.",
    caveat: "This score is not a Rotten Tomatoes Tomatometer estimate and does not imply a Kalshi threshold probability.",
    factors: talentPrior.factors,
  },
  coverage: {
    kicker: "Coverage 04",
    label: "Data coverage",
    value: dataCoverage.value,
    sampleSize: dataCoverage.sampleSize,
    summary:
      "This is an availability score, not trade confidence. Historical ratings and named-talent joins are strong; target budget/runtime and much of the raw financial history are missing.",
    status: `Availability only · ${historical.audit.rows.moviesParsed.toLocaleString()} parsed movies`,
    formula: "Field-level completeness percentages are combined at the declared weights. No outcome probability is produced.",
    caveat: "Coverage measures whether data exists, not whether the model is right.",
    factors: dataCoverage.factors,
  },
};

const thresholds = {
  75: { market: 73, price: 62 },
  80: { market: 55, price: 56 },
  85: { market: 48, price: 47 },
};

function Header({ view, setView, savedCount }) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => setView("scout")} aria-label="Open Cutline scout">
        <span className="brand-mark">CUTLINE</span>
        <span className="brand-sub">MOVIE MARKET INTELLIGENCE</span>
      </button>

      <nav className="primary-nav" aria-label="Primary navigation">
        <button className={view === "scout" ? "nav-link active" : "nav-link"} onClick={() => setView("scout")}>
          Scout
        </button>
        <button className={view === "saved" ? "nav-link active" : "nav-link"} onClick={() => setView("saved")}>
          Saved ideas <span className="nav-count">{String(savedCount).padStart(2, "0")}</span>
        </button>
      </nav>

      <div className="freshness">
        <span className="freshness-dot" aria-hidden="true" />
        MANUAL MARKET REF · AUG 21, 2026
      </div>
    </header>
  );
}

function ScoreButton({ scoreKey, onOpen }) {
  const score = scoreDetails[scoreKey];
  const scoreLabel = displayScore(score.value);
  return (
    <button className={score.value === null ? "score-button unavailable" : "score-button"} onClick={() => onOpen(scoreKey)} aria-label={score.value === null ? `Explain why ${score.label} is unavailable` : `Explain ${score.label} score of ${scoreLabel}`}>
      <span className="score-number">{scoreLabel}</span>
      <span className="score-copy">
        <span>{score.label}</span>
        <small>{score.value === null ? "WHY UNAVAILABLE" : "OPEN RATIONALE"}</small>
      </span>
    </button>
  );
}

function MarketPanel({ threshold, setThreshold }) {
  const market = thresholds[threshold];
  return (
    <section className="market-panel" aria-labelledby="market-heading">
      <div className="market-panel-head">
        <div>
          <p className="eyebrow">KALSHI · ROTTEN TOMATOES</p>
          <h2 id="market-heading">Will the score finish above {threshold}?</h2>
        </div>
        <a href={MARKET_URL} target="_blank" rel="noreferrer" className="market-link">
          Open market
        </a>
      </div>

      <div className="thresholds" aria-label="Choose Rotten Tomatoes threshold">
        {[75, 80, 85].map((item) => (
          <button key={item} onClick={() => setThreshold(item)} className={threshold === item ? "threshold active" : "threshold"}>
            ABOVE {item}
          </button>
        ))}
      </div>

      <div className="probability-grid">
        <div className="probability-block market-probability">
          <span>MARKET SNAPSHOT</span>
          <strong>{market.market}%</strong>
          <small>MANUAL REF · YES {market.price}¢</small>
        </div>
        <div className="probability-block model-probability">
          <span>RT PROBABILITY</span>
          <strong className="unavailable-value">—</strong>
          <small>CRITIC LABELS NOT CONNECTED</small>
        </div>
        <div className="edge-block">
          <span>MODEL EDGE</span>
          <strong className="unavailable-value">—</strong>
          <small>NOT CALCULATED</small>
        </div>
      </div>

      <div className="market-foot">
        <div>
          <span className="market-meta-label">Market closes</span>
          <strong>SEP 21 · 10:00 AM ET</strong>
        </div>
        <div>
          <span className="market-meta-label">Snapshot freshness</span>
          <strong>MANUAL · AUG 21</strong>
        </div>
      </div>
    </section>
  );
}

function ScoutView({ saved, onSave, onPass, onOpenScore }) {
  const [threshold, setThreshold] = useState(80);

  return (
    <main className="scout-view">
      <section className="feature-grid" aria-label="Featured movie trade idea">
        <article className="movie-panel">
          <img src="/assets/resident-evil.jpg" alt="Resident Evil movie artwork showing a medical courier in a snow-covered city" />
          <div className="movie-overlay">
            <div>
              <p className="eyebrow light">FEATURED RELEASE · 01 / 04</p>
              <h1>Resident Evil</h1>
            </div>
            <div className="movie-meta">
              <span>SEP 18</span>
              <span>HORROR · ACTION</span>
              <span>COLUMBIA</span>
            </div>
          </div>
        </article>

        <MarketPanel threshold={threshold} setThreshold={setThreshold} />
      </section>

      <section className="analysis-grid" aria-label="Cutline analysis">
        <div className="score-rail">
          <div className="score-rail-title">
            <p className="eyebrow">WHY THIS MODEL MOVED</p>
            <span>SELECT A SCORE TO TRACE IT</span>
          </div>
          <div className="scores">
            {Object.keys(scoreDetails).map((key) => (
              <ScoreButton key={key} scoreKey={key} onOpen={onOpenScore} />
            ))}
          </div>
        </div>

        <article className="thesis-panel">
          <div className="stance-row">
            <p className="eyebrow">CUTLINE CALL · ABOVE {threshold}</p>
            <span className="stance muted">RESEARCH ONLY</span>
          </div>
          <h2>Historical context is constructive, but it cannot price a Rotten Tomatoes threshold yet.</h2>
          <p>
            The reproducible Kaggle/TMDB layer scores historical fit at {displayScore(historicalFit.value)} and talent at {displayScore(talentPrior.value)}, anchored to {cohort.sampleSize} comparable Horror + Science Fiction releases. Those are community-rating priors—not critic outcomes—so Cutline is withholding a probability, edge, and entry price until Rotten Tomatoes calibration and live early indicators are connected.
          </p>
          <div className="source-line">
            <span>HISTORICAL: KAGGLE / TMDB · FEB 17, 2026</span>
            <span>SEPARATE INPUTS: KALSHI · CRITICS · TRAILER · SEARCH · SOCIAL</span>
          </div>
        </article>

        <aside className="decision-panel" aria-label="Trade idea actions">
          <div>
            <p className="eyebrow light">DECISION</p>
            <span className="decision-price">NO CALIBRATED ENTRY</span>
            <p className="decision-note">Decision support only. No trade is placed here.</p>
          </div>
          <div className="decision-actions">
            <button className={saved ? "save-button saved" : "save-button"} onClick={() => onSave(threshold)}>
              {saved ? "Idea saved" : "Save research idea"}
            </button>
            <button className="pass-button" onClick={onPass}>Pass for now</button>
          </div>
        </aside>
      </section>

      <footer className="data-note">
        <span>KAGGLE / TMDB HISTORICAL SNAPSHOT · CC BY-NC-SA 4.0</span>
        <span>TMDB PRIORS ARE REPRODUCIBLE · RT PROBABILITY AND LIVE SIGNALS UNAVAILABLE</span>
        <span>NOT FINANCIAL ADVICE</span>
      </footer>
    </main>
  );
}

function SavedView({ items, onOpenScout, onRemove }) {
  return (
    <main className="saved-view">
      <div className="saved-heading">
        <div>
          <p className="eyebrow">IDEA BOOK</p>
          <h1>Saved trade ideas</h1>
        </div>
        <button className="back-to-scout" onClick={onOpenScout}>Return to scout</button>
      </div>

      {items.length === 0 ? (
        <section className="empty-state">
          <span>00</span>
          <h2>Your watchlist is clean.</h2>
          <p>Save a thesis from the Scout view and it will appear here with its entry trigger and model timestamp.</p>
          <button onClick={onOpenScout}>Review featured market</button>
        </section>
      ) : (
        <section className="idea-table" aria-label="Saved movie trade ideas">
          <div className="idea-table-head">
            <span>RELEASE</span>
            <span>MARKET / THESIS</span>
            <span>MODEL</span>
            <span>ENTRY</span>
            <span>STATUS</span>
            <span>ACTION</span>
          </div>
          {items.map((item) => (
            <article className="idea-row" key={item.id}>
              <div className="idea-release">
                <img src="/assets/resident-evil.jpg" alt="" />
                <div>
                  <strong>{item.movie}</strong>
                  <span>SEP 18 · COLUMBIA</span>
                </div>
              </div>
              <div className="idea-thesis">
                <strong>RT score above {item.threshold}</strong>
                <span>Historical prior saved; critic calibration and live signals remain the unlock.</span>
              </div>
              <div className="idea-stat"><strong>—</strong><span>RT PROBABILITY</span></div>
              <div className="idea-stat"><strong>—</strong><span>NO ENTRY RULE</span></div>
              <div className="idea-status"><span>RESEARCH</span><small>SAVED {item.savedAt}</small></div>
              <button className="remove-idea" onClick={() => onRemove(item.id)}>Remove</button>
            </article>
          ))}
        </section>
      )}

      <section className="saved-method">
        <p className="eyebrow">NEXT AUTOMATION LAYER</p>
        <div>
          <span>01</span><p>Refresh Kalshi price and volume</p>
          <span>02</span><p>Re-score new critic and audience signals</p>
          <span>03</span><p>Flag ideas when edge or confidence crosses your rule</p>
        </div>
      </section>
    </main>
  );
}

function ScoreDrawer({ scoreKey, onClose }) {
  const score = scoreDetails[scoreKey];
  if (!score) return null;
  const financial = cohort.financialContext;

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="score-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="eyebrow">{score.kicker}</p>
            <h2 id="drawer-title">{score.label}</h2>
          </div>
          <button onClick={onClose} className="drawer-close">Close</button>
        </div>
        <div className="drawer-score">
          <strong className={score.value === null ? "unavailable-value" : ""}>{displayScore(score.value)}</strong>
          <span>{score.value === null ? "NOT SCORED" : "/ 100"}</span>
        </div>
        <p className="drawer-summary">{score.summary}</p>
        <div className="drawer-evidence-grid">
          <div><span>{scoreKey === "live" ? "LIVE OBSERVATIONS" : "HISTORICAL COHORT"}</span><strong>{scoreKey === "live" ? "0 connected" : `${cohort.sampleSize} films`}</strong></div>
          <div><span>SCORE SAMPLE</span><strong>{score.sampleSize ?? "N/A"}</strong></div>
          <div><span>FRESHNESS</span><strong>{scoreKey === "live" ? "NOT CONNECTED" : "FEB 17, 2026"}</strong></div>
          <div><span>OUTCOME</span><strong>{scoreKey === "live" ? "NOT CALCULATED" : "TMDB USER RATING"}</strong></div>
        </div>
        <div className="factor-list">
          {score.factors.map((factor) => (
            <div className="factor" key={factor.label}>
              <div className="factor-copy">
                <span>{factor.label}</span>
                <span>
                  {factor.value === null
                    ? "NOT CONNECTED"
                    : `${factor.weight}% weight · ${factor.value}/100 · +${factor.contribution} pts`}
                </span>
              </div>
              {factor.value !== null && <div className="factor-track"><span style={{ width: `${factor.value}%` }} /></div>}
              <p className="factor-detail">{factor.detail} {factor.sampleSize !== null && `Sample n=${factor.sampleSize}.`}</p>
              {factor.titles?.length > 0 && <p className="factor-titles">Examples: {factor.titles.join(" · ")}</p>}
            </div>
          ))}
        </div>
        <div className="drawer-formula">
          <span>CALCULATION</span>
          <p>{score.formula}</p>
        </div>
        {scoreKey === "historical" && (
          <div className="cohort-context">
            <div className="cohort-context-head">
              <span>COMPARABLE-FILM COHORT</span>
              <strong>N={cohort.sampleSize}</strong>
            </div>
            <p>{historical.methodology.cohortRule}</p>
            <div className="comparable-list">
              {cohort.recentComparables.map((movie) => (
                <div key={movie.title}>
                  <span>{movie.title}</span>
                  <span>{movie.releaseDate.slice(0, 4)} · {movie.rating.toFixed(1)} / 10 · {movie.votes.toLocaleString()} votes</span>
                </div>
              ))}
            </div>
            <div className="financial-line">
              <span>FINANCIAL CONTEXT · N={financial.completeSampleSize}</span>
              <strong>Median budget {money(financial.medianBudgetUsd)} · revenue {money(financial.medianRevenueUsd)}</strong>
              <small>{financial.caveat}</small>
            </div>
          </div>
        )}
        {scoreKey === "live" ? (
          <div className="drawer-provenance">
            <span>SOURCE STATUS</span>
            <p>{score.caveat}</p>
            <p>The Kaggle historical layer does not fill or estimate these time-sensitive inputs.</p>
          </div>
        ) : (
          <div className="drawer-provenance">
            <span>PROVENANCE & LIMITS</span>
            <p>{score.caveat}</p>
            <p>{historical.source.attribution}</p>
            <div>
              <a href={DATASET_URL} target="_blank" rel="noreferrer">Kaggle dataset</a>
              <a href={TMDB_URL} target="_blank" rel="noreferrer">TMDB source</a>
            </div>
          </div>
        )}
        <div className="drawer-status">{score.status}</div>
      </aside>
    </div>
  );
}

export function App() {
  const [view, setView] = useState("scout");
  const [scoreKey, setScoreKey] = useState(null);
  const [savedItems, setSavedItems] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem("cutline-saved-ideas")) || [];
    } catch {
      return [];
    }
  });
  const [passMessage, setPassMessage] = useState(false);

  useEffect(() => {
    window.localStorage.setItem("cutline-saved-ideas", JSON.stringify(savedItems));
  }, [savedItems]);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") setScoreKey(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const saved = savedItems.some((item) => item.movie === "Resident Evil");

  const saveIdea = (threshold) => {
    setSavedItems((items) => {
      const withoutMovie = items.filter((item) => item.movie !== "Resident Evil");
      return [
        {
          id: "resident-evil-rt",
          movie: "Resident Evil",
          threshold,
          entry: null,
          savedAt: "AUG 21",
        },
        ...withoutMovie,
      ];
    });
  };

  const screen = useMemo(() => {
    if (view === "saved") {
      return <SavedView items={savedItems} onOpenScout={() => setView("scout")} onRemove={(id) => setSavedItems((items) => items.filter((item) => item.id !== id))} />;
    }
    return (
      <ScoutView
        saved={saved}
        onSave={saveIdea}
        onPass={() => {
          setPassMessage(true);
          window.setTimeout(() => setPassMessage(false), 1800);
        }}
        onOpenScore={setScoreKey}
      />
    );
  }, [view, savedItems, saved]);

  return (
    <div className="app-shell">
      <Header view={view} setView={setView} savedCount={savedItems.length} />
      {screen}
      {scoreKey && <ScoreDrawer scoreKey={scoreKey} onClose={() => setScoreKey(null)} />}
      <div className={passMessage ? "toast visible" : "toast"} role="status">Passed for now · moving to the next idea soon</div>
    </div>
  );
}
