import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from critic_outcomes import eligible_outcome, strict_threshold_rate  # noqa: E402


def row(score="80", reviews="10", kind="Movie"):
    return {
        "type": kind,
        "tomatometer_movie_rating": score,
        "tomatometer_reviews_count": reviews,
    }


class CriticOutcomeTests(unittest.TestCase):
    def test_requires_a_movie_score_and_minimum_review_count(self):
        self.assertTrue(eligible_outcome(row()))
        self.assertFalse(eligible_outcome(row(reviews="4")))
        self.assertFalse(eligible_outcome(row(score="")))
        self.assertFalse(eligible_outcome(row(kind="TV Series")))

    def test_threshold_rule_is_strictly_above(self):
        result = strict_threshold_rate([75, 76, 90], 75)
        self.assertEqual(result["aboveCount"], 2)
        self.assertEqual(result["aboveRate"], 0.6667)

    def test_checked_benchmark_is_not_a_probability_model(self):
        import json

        cache = json.loads((ROOT / "src/data/critic-benchmark.json").read_text())
        self.assertEqual(cache["calibration"]["status"], "unavailable")
        self.assertEqual(cache["usage"]["connectedAs"], "critic outcome benchmark")
        self.assertGreater(cache["audit"]["eligibleOutcomeRows"], 0)
        self.assertLess(cache["audit"]["joinToTmdb"]["exactMatches"], 50)


if __name__ == "__main__":
    unittest.main()
