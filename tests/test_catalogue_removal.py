"""The catalogue check refuses removals, except a labelled owner removal that does nothing else."""
import importlib.util
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("catalogue_check", os.path.join(HERE, "..", "scripts", "catalogue-check.py"))
cc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cc)


def cat(*ids):
    return {"name": "acme-plugins", "owner": "acme", "plugins": [{"id": i, "title": i} for i in ids]}


class Removal(unittest.TestCase):
    def test_a_removal_is_refused_by_default(self):
        problems = cc.check(cat("a", "b"), cat("a"))
        self.assertTrue(any("removes b" in p for p in problems))

    def test_the_owner_may_remove_when_it_does_nothing_else(self):
        self.assertEqual(cc.check(cat("a", "b", "c"), cat("a"), allow_removal=True), [])

    def test_a_removal_that_also_changes_an_entry_is_still_refused(self):
        head = cat("a")
        head["plugins"][0]["title"] = "changed"
        problems = cc.check(cat("a", "b"), head, allow_removal=True)
        self.assertTrue(any("removes b" in p for p in problems))

    def test_a_removal_that_adds_an_entry_is_still_refused(self):
        problems = cc.check(cat("a", "b"), cat("a", "c"), allow_removal=True)
        self.assertTrue(problems)


if __name__ == "__main__":
    unittest.main()
