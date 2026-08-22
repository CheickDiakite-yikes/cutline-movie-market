import json
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from historical_model import (  # noqa: E402
    DATASET_SNAPSHOT,
    TARGET_MOVIE_ID,
    Movie,
    empirical_bayes_score,
    is_eligible_outcome,
    load_market_config,
    weighted_score,
)
from automatic_prior import AUTO_MODEL_VERSION, title_family_key  # noqa: E402
from target_enrichment import ENRICHMENT_MODEL_VERSION, normalize_title  # noqa: E402


def movie(movie_id, rating, votes=500, released=date(2020, 1, 1), status="Released"):
    return Movie(
        movie_id=movie_id,
        title=f"Movie {movie_id}",
        release_date=released,
        runtime=100,
        budget=10,
        revenue=20,
        vote_average=rating,
        vote_count=votes,
        status=status,
        original_language="en",
        genres=("Horror", "Science Fiction"),
    )


class HistoricalModelTests(unittest.TestCase):
    def test_empirical_bayes_shrinks_small_samples(self):
        score = empirical_bayes_score([movie(1, 9.0)], baseline=6.0, prior_strength=5)
        self.assertEqual(score, 65.0)

    def test_weighted_score_uses_declared_contributions(self):
        self.assertEqual(weighted_score([
            {"value": 80, "weight": 25},
            {"value": 60, "weight": 75},
        ]), 65.0)

    def test_weighted_score_rejects_incomplete_weights(self):
        with self.assertRaises(ValueError):
            weighted_score([{"value": 80, "weight": 80}])

    def test_target_and_post_snapshot_outcomes_are_ineligible(self):
        self.assertFalse(is_eligible_outcome(movie(TARGET_MOVIE_ID, 8.0)))
        self.assertFalse(is_eligible_outcome(movie(7, 8.0, released=date(2026, 2, 18))))
        self.assertTrue(is_eligible_outcome(movie(8, 8.0, released=DATASET_SNAPSHOT)))

    def test_low_vote_or_unreleased_rows_are_ineligible(self):
        self.assertFalse(is_eligible_outcome(movie(9, 8.0, votes=99)))
        self.assertFalse(is_eligible_outcome(movie(10, 8.0, status="Post Production")))

    def test_checked_in_cache_has_provenance_and_no_rt_probability(self):
        cache = json.loads((ROOT / "src/data/markets/resident-evil.json").read_text())
        self.assertEqual(cache["schemaVersion"], 2)
        self.assertEqual(cache["market"]["kalshi"]["eventTicker"], "KXRT-RES")
        self.assertEqual(cache["source"]["license"], "CC BY-NC-SA 4.0")
        self.assertFalse(cache["target"]["targetOutcomeUsed"])
        self.assertEqual(cache["thresholdCalibration"]["status"], "unavailable")
        self.assertNotIn("probability", cache["thresholdCalibration"])
        self.assertGreater(cache["cohort"]["sampleSize"], 0)
        for score in cache["scores"].values():
            self.assertEqual(sum(factor["weight"] for factor in score["factors"]), 100)

    def test_market_config_is_portable_and_weights_are_complete(self):
        market = load_market_config(ROOT / "config/markets/resident-evil.json")
        self.assertEqual(market.slug, "resident-evil")
        self.assertEqual(market.default_threshold, 80)
        self.assertEqual(sum(market.historical_weights.values()), 100)
        self.assertEqual(sum(market.talent_weights.values()), 100)

    def test_checked_in_automatic_prior_has_reproducible_hierarchical_inputs(self):
        prior = json.loads((ROOT / "src/data/automatic-prior.json").read_text())
        self.assertEqual(prior["modelVersion"], AUTO_MODEL_VERSION)
        self.assertEqual(prior["source"]["license"], "CC BY-NC-SA 4.0")
        self.assertGreater(prior["baseline"]["sampleSize"], 1000)
        self.assertEqual(len(prior["months"]), 12)
        self.assertEqual(sum(prior["methodology"]["weights"].values()), 100)
        self.assertIn("Kalshi price", " ".join(prior["methodology"]["leakageControls"]))

    def test_title_family_key_is_stable_and_not_a_franchise_claim(self):
        self.assertEqual(title_family_key("The Avengers: Doomsday"), "avengers")
        self.assertEqual(title_family_key("Dune: Part Three"), "dune")

    def test_checked_in_target_enrichment_is_exact_and_leakage_controlled(self):
        enrichment = json.loads((ROOT / "src/data/target-enrichment.json").read_text())
        self.assertEqual(enrichment["modelVersion"], ENRICHMENT_MODEL_VERSION)
        self.assertEqual(enrichment["source"]["license"], "CC BY-NC-SA 4.0")
        self.assertGreater(enrichment["resolution"]["candidateCount"], 50)
        avengers_ids = enrichment["titleIndex"][normalize_title("Avengers: Doomsday")]
        self.assertEqual(len(avengers_ids), 1)
        avengers = enrichment["records"][str(avengers_ids[0])]
        self.assertEqual(avengers["movieId"], 1003596)
        self.assertGreater(avengers["genreContext"]["sampleSize"], 0)
        self.assertGreater(avengers["talent"]["cast"]["sampleSize"], 0)
        leakage = " ".join(enrichment["methodology"]["leakageControls"])
        self.assertIn("Target-film rating", leakage)
        self.assertIn("Kalshi price", leakage)


if __name__ == "__main__":
    unittest.main()
