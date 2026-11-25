import unittest
from supply_chain import ALLOWED, approved

class LicensePolicyTests(unittest.TestCase):
    def test_alternatives_and_conjunctions(self):
        self.assertTrue(approved("(MIT OR GPL-3.0-only) AND Unicode-3.0", ALLOWED))
        self.assertFalse(approved("(MIT OR ISC) AND AGPL-3.0-only", ALLOWED))
        self.assertTrue(approved("Apache-2.0 WITH LLVM-exception", ALLOWED))
        self.assertFalse(approved("Apache-2.0 WITH Unknown-exception", ALLOWED))

    def test_rejects_partial_or_empty_input(self):
        for expression in ("", "MIT OR", "(MIT", "MIT OR Apache-2.0 unknown", "MIT WITH)"):
            with self.assertRaises(ValueError):
                approved(expression, ALLOWED)

if __name__ == "__main__":
    unittest.main()
