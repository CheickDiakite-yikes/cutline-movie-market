import { useEffect, useMemo, useState } from "react";

const MARKET_URL = "https://kalshi.com/markets/kxrt/rotten-tomatoes-scores/kxrt-res";

const scoreDetails = {
  critical: {
    kicker: "Signal 01",
    label: "Critical fit",
    value: 86,
    summary:
      "Zach Cregger’s recent horror track record lifts the prior sharply, while the franchise’s uneven critical history keeps it below certainty.",
    status: "Model input · illustrative",
    factors: [
      { label: "Director horror prior", value: 94, weight: "35%" },
      { label: "Franchise critic history", value: 46, weight: "20%" },
      { label: "Creative team fit", value: 88, weight: "25%" },
      { label: "Distributor positioning", value: 82, weight: "20%" },
    ],
  },
  audience: {
    kicker: "Signal 02",
    label: "Audience heat",
    value: 78,
    summary:
      "A globally recognized franchise and a strong director-led campaign create awareness, but normalized social-volume and sentiment feeds are not connected yet.",
    status: "Partial data · confidence capped",
    factors: [
      { label: "Franchise awareness", value: 96, weight: "30%" },
      { label: "Trailer velocity", value: 74, weight: "30%" },
      { label: "Release proximity", value: 79, weight: "20%" },
      { label: "Social sentiment", value: 58, weight: "20%" },
    ],
  },
  talent: {
    kicker: "Signal 03",
    label: "Talent prior",
    value: 69,
    summary:
      "The cast supports the concept, but the film is being sold on Cregger’s authorship and the property more than conventional star power.",
    status: "Historical prior · illustrative",
    factors: [
      { label: "Lead cast history", value: 66, weight: "30%" },
      { label: "Ensemble depth", value: 74, weight: "25%" },
      { label: "Producer history", value: 72, weight: "25%" },
      { label: "Role / genre fit", value: 65, weight: "20%" },
    ],
  },
  confidence: {
    kicker: "Signal 04",
    label: "Confidence",
    value: 71,
    summary:
      "Verified market, release, director and cast data make the direction useful; zero published reviews and partial social coverage still limit conviction.",
    status: "Data coverage · 71%",
    factors: [
      { label: "Historical coverage", value: 91, weight: "35%" },
      { label: "Market liquidity", value: 73, weight: "25%" },
      { label: "Early reviews", value: 12, weight: "25%" },
      { label: "Social recency", value: 61, weight: "15%" },
    ],
  },
};

const thresholds = {
  75: { market: 73, price: 62, model: 81, stance: "LEAN YES", edge: 8 },
  80: { market: 55, price: 56, model: 64, stance: "WATCH YES", edge: 9 },
  85: { market: 48, price: 47, model: 44, stance: "NO EDGE", edge: -4 },
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
        MARKET SNAPSHOT · AUG 21, 2026
      </div>
    </header>
  );
}

function ScoreButton({ scoreKey, onOpen }) {
  const score = scoreDetails[scoreKey];
  return (
    <button className="score-button" onClick={() => onOpen(scoreKey)} aria-label={`Explain ${score.label} score of ${score.value}`}>
      <span className="score-number">{score.value}</span>
      <span className="score-copy">
        <span>{score.label}</span>
        <small>OPEN RATIONALE</small>
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
          <span>MARKET</span>
          <strong>{market.market}%</strong>
          <small>YES {market.price}¢</small>
        </div>
        <div className="probability-block model-probability">
          <span>CUTLINE MODEL</span>
          <strong>{market.model}%</strong>
          <small>PROTOTYPE ESTIMATE</small>
        </div>
        <div className="edge-block">
          <span>MODEL EDGE</span>
          <strong>{market.edge > 0 ? "+" : ""}{market.edge}</strong>
          <small>POINTS</small>
        </div>
      </div>

      <div className="market-foot">
        <div>
          <span className="market-meta-label">Market closes</span>
          <strong>SEP 21 · 10:00 AM ET</strong>
        </div>
        <div>
          <span className="market-meta-label">Status</span>
          <strong>OPEN · 31 DAYS</strong>
        </div>
      </div>
    </section>
  );
}

function ScoutView({ saved, onSave, onPass, onOpenScore }) {
  const [threshold, setThreshold] = useState(80);
  const market = thresholds[threshold];

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
            <span className={`stance ${market.stance === "NO EDGE" ? "muted" : ""}`}>{market.stance}</span>
          </div>
          <h2>
            {threshold === 80
              ? "The market may be pricing the franchise’s baggage more heavily than Cregger’s recent form."
              : threshold === 75
                ? "The lower threshold offers the cleanest cushion, but the current ask leaves less room."
                : "The model does not see enough separation above 85 to justify action."}
          </h2>
          <p>
            Cregger’s horror prior and the campaign point above the market, while the franchise’s uneven critic history, zero published reviews and incomplete live social data keep confidence at 71. Save the thesis and watch for YES at or below {threshold === 75 ? "59" : threshold === 80 ? "52" : "42"}¢, or a material rise in verified early sentiment.
          </p>
          <div className="source-line">
            <span>VERIFIED: MARKET · RELEASE · CAST</span>
            <span>PENDING: LIVE SOCIAL · EARLY REVIEWS</span>
          </div>
        </article>

        <aside className="decision-panel" aria-label="Trade idea actions">
          <div>
            <p className="eyebrow light">DECISION</p>
            <span className="decision-price">ENTRY WATCH ≤ {threshold === 75 ? "59" : threshold === 80 ? "52" : "42"}¢</span>
            <p className="decision-note">Decision support only. No trade is placed here.</p>
          </div>
          <div className="decision-actions">
            <button className={saved ? "save-button saved" : "save-button"} onClick={() => onSave(threshold)}>
              {saved ? "Idea saved" : "Save trade idea"}
            </button>
            <button className="pass-button" onClick={onPass}>Pass for now</button>
          </div>
        </aside>
      </section>

      <footer className="data-note">
        <span>LIVE MARKET SNAPSHOT FROM KALSHI</span>
        <span>PROTOTYPE SCORES ARE ILLUSTRATIVE UNTIL DATA PIPELINES ARE CONNECTED</span>
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
                <span>Director prior leads; reviews remain the unlock.</span>
              </div>
              <div className="idea-stat"><strong>{thresholds[item.threshold].model}%</strong><span>PROBABILITY</span></div>
              <div className="idea-stat"><strong>≤ {item.entry}¢</strong><span>YES PRICE</span></div>
              <div className="idea-status"><span>WATCHING</span><small>SAVED {item.savedAt}</small></div>
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
          <strong>{score.value}</strong>
          <span>/ 100</span>
        </div>
        <p className="drawer-summary">{score.summary}</p>
        <div className="factor-list">
          {score.factors.map((factor) => (
            <div className="factor" key={factor.label}>
              <div className="factor-copy">
                <span>{factor.label}</span>
                <span>{factor.weight} weight · {factor.value}/100</span>
              </div>
              <div className="factor-track"><span style={{ width: `${factor.value}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="drawer-formula">
          <span>CALCULATION</span>
          <p>Weighted component scores are normalized to 100, then dampened when evidence is missing or stale.</p>
        </div>
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
    const entry = threshold === 75 ? 59 : threshold === 80 ? 52 : 42;
    setSavedItems((items) => {
      const withoutMovie = items.filter((item) => item.movie !== "Resident Evil");
      return [
        {
          id: "resident-evil-rt",
          movie: "Resident Evil",
          threshold,
          entry,
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
