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
    weighted_score,
)


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
        cache = json.loads((ROOT / "src/data/resident-evil-historical.json").read_text())
        self.assertEqual(cache["source"]["license"], "CC BY-NC-SA 4.0")
        self.assertFalse(cache["target"]["targetOutcomeUsed"])
        self.assertEqual(cache["thresholdCalibration"]["status"], "unavailable")
        self.assertNotIn("probability", cache["thresholdCalibration"])
        self.assertGreater(cache["cohort"]["sampleSize"], 0)
        for score in cache["scores"].values():
            self.assertEqual(sum(factor["weight"] for factor in score["factors"]), 100)


if __name__ == "__main__":
    unittest.main()
