import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("pgr_geometry", Path(__file__).parents[1] / "scripts" / "pgr-column-geometry.py")
geometry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(geometry)


class ColumnGeometryTests(unittest.TestCase):
    def test_whole_word_crossing_rule_preserves_characters(self):
        words = [{"text": "Produto", "x0": 20, "x1": 60, "top": 10},
                 {"text": "Ar,", "x0": 298, "x1": 308, "top": 10},
                 {"text": "contato", "x0": 310, "x1": 340, "top": 10}]
        result = geometry.recover(words, 298, 300, ["Produto A", None, "r, contato"])
        self.assertEqual(result["source"], "Produto")
        self.assertEqual(result["propagation"], "Ar, contato")
        self.assertEqual(geometry.recover(words, 298.75, 300, ["Produto A", None, "r, contato"])["propagation"], "Ar, contato")
        self.assertIsNone(geometry.recover(words, 280, 300, ["Produto A", None, "r, contato"]))
        self.assertIsNone(geometry.recover(words, 298, 300, ["Outra palavra", None, "r, contato"]))
        self.assertIsNone(geometry.recover(words, 298, 350, ["Produto A", None, "r, contato"]))


if __name__ == "__main__":
    unittest.main()
