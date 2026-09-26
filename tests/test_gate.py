"""The security-review gate: what makes a submission need a person's read, what
lets an approval through, and what the bot says once a listing merges.

Run from the repository root: python3 -m unittest discover -s tests
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import gate  # noqa: E402

WF = os.path.join(ROOT, ".github", "workflows")


def wf(name):
    return open(os.path.join(WF, name), encoding="utf-8").read()


def finding(kind):
    return {"id": kind, "says": "x", "where": "a.py:1", "line": "x"}


class NeedsReview(unittest.TestCase):
    def test_clean_scan_needs_none(self):
        self.assertFalse(gate.needs_review({"outcome": "passed", "findings": []}))

    def test_a_risky_finding_needs_a_person(self):
        for kind in ("reads-ssh-keys", "escalates", "bundled-binary", "asks-for-full-scope", "runs-generated-code"):
            with self.subTest(kind=kind):
                self.assertTrue(gate.needs_review({"outcome": "findings", "findings": [finding(kind)]}))

    def test_only_low_signal_findings_do_not(self):
        self.assertFalse(gate.needs_review(
            {"outcome": "findings", "findings": [finding("hardcoded-endpoint"), finding("kills-by-pattern")]}))

    def test_one_risky_among_low_ones_does(self):
        self.assertTrue(gate.needs_review(
            {"outcome": "findings", "findings": [finding("hardcoded-endpoint"), finding("escalates")]}))

    def test_a_scan_that_did_not_complete_needs_a_person(self):
        self.assertTrue(gate.needs_review({"outcome": "unreadable", "findings": []}))
        self.assertTrue(gate.needs_review({}))
        self.assertTrue(gate.needs_review(None))


REPORT = {"login": "github-actions[bot]", "type": "Bot", "created_at": "2026-01-01T10:00:00Z",
          "updated_at": "2026-01-01T10:00:00Z"}


def ev(label, at, actor="maint", kind="User"):
    return {"label": label, "created_at": at, "actor": actor, "actor_type": kind}


def refusal(approved=True, **kw):
    args = dict(marker={"review": True}, fresh_review="yes",
                labels=["plugin-submission", "ready for listing", "approved for listing",
                        "security-review-required", "security-reviewed"],
                events=[ev("security-reviewed", "2026-01-01T11:00:00Z")],
                report=REPORT, perms={"maint": "write"})
    args.update(kw)
    if approved and not any(e["label"] == "approved for listing" for e in args["events"]):
        args["events"] = [ev("approved for listing", "2026-01-01T10:30:00Z")] + list(args["events"])
    return gate.approval_refusal(**args)


class Approval(unittest.TestCase):
    def test_reviewed_by_write_after_the_report_passes(self):
        self.assertIsNone(refusal())

    def test_nothing_risky_needs_no_review_label(self):
        self.assertIsNone(refusal(marker={"review": False}, fresh_review="no",
                                  labels=["plugin-submission", "ready for listing", "approved for listing"], events=[]))

    def test_risky_without_the_review_label_is_refused(self):
        self.assertIn("security-reviewed", refusal(labels=["security-review-required", "approved for listing"], events=[]))

    def test_the_marker_alone_requires_it_even_if_the_label_was_stripped(self):
        self.assertIsNotNone(refusal(fresh_review="no", labels=["approved for listing"], events=[]))

    def test_the_fresh_scan_alone_requires_it_even_if_the_report_said_clean(self):
        self.assertIsNotNone(refusal(marker={"review": False}, fresh_review="yes",
                                     labels=["approved for listing"], events=[]))

    def test_a_report_from_before_the_gate_requires_it(self):
        self.assertIsNotNone(refusal(marker={}, fresh_review="no", labels=["approved for listing"], events=[]))

    def test_a_fresh_scan_that_did_not_answer_requires_it(self):
        self.assertIsNotNone(refusal(marker={"review": False}, fresh_review="",
                                     labels=["approved for listing"], events=[]))

    def test_the_requirement_label_alone_requires_it(self):
        self.assertIsNotNone(refusal(marker={"review": False}, fresh_review="no",
                                     labels=["security-review-required", "approved for listing"], events=[]))

    def test_the_label_by_a_bot_is_refused_even_if_it_has_write(self):
        bot = ev("security-reviewed", "2026-01-01T11:00:00Z", "some-app[bot]", "Bot")
        self.assertIsNotNone(refusal(events=[bot], perms={"some-app[bot]": "write"}))
        typed = ev("security-reviewed", "2026-01-01T11:00:00Z", "some-app", "Bot")
        self.assertIsNotNone(refusal(events=[typed], perms={"some-app": "write"}))

    def test_the_label_by_somebody_without_write_is_refused(self):
        self.assertIsNotNone(refusal(perms={"maint": "triage"}))
        self.assertIsNotNone(refusal(perms={}))

    def test_admin_and_maintain_count(self):
        for level in ("admin", "maintain"):
            self.assertIsNone(refusal(perms={"maint": level}))

    def test_a_review_before_the_report_is_refused(self):
        self.assertIsNotNone(refusal(events=[ev("security-reviewed", "2026-01-01T09:00:00Z")]))

    def test_a_review_in_the_reports_own_second_is_refused(self):
        self.assertIsNotNone(refusal(events=[ev("security-reviewed", "2026-01-01T10:00:00Z")]))

    def test_a_report_rewritten_after_the_review_is_refused(self):
        self.assertIsNotNone(refusal(report={**REPORT, "updated_at": "2026-01-01T12:00:00Z"}))

    def test_a_review_label_that_is_gone_now_is_refused(self):
        self.assertIsNotNone(refusal(labels=["security-review-required", "approved for listing"]))

    def test_another_labels_event_is_not_a_review(self):
        self.assertIsNotNone(refusal(events=[ev("ready for listing", "2026-01-01T11:00:00Z")]))

    def test_a_later_triage_relabel_after_a_write_review_is_refused(self):
        self.assertIsNotNone(refusal(
            events=[ev("security-reviewed", "2026-01-01T11:00:00Z"), ev("security-reviewed", "2026-01-01T12:00:00Z", "drive-by")],
            perms={"maint": "write", "drive-by": "triage"}))

    def test_an_approval_by_somebody_without_write_is_refused_even_when_reviewed(self):
        ok = ev("security-reviewed", "2026-01-01T11:00:00Z")
        self.assertIsNotNone(refusal(events=[ev("approved for listing", "2026-01-01T10:30:00Z", "drive-by"), ok],
                                     perms={"maint": "write", "drive-by": "triage"}))
        self.assertIsNotNone(refusal(events=[ev("approved for listing", "2026-01-01T10:30:00Z", "x[bot]", "Bot"), ok],
                                     perms={"maint": "write", "x[bot]": "write"}))

    def test_no_approval_event_is_refused(self):
        self.assertIsNotNone(refusal(events=[ev("security-reviewed", "2026-01-01T11:00:00Z")], approved=False))


BODY = ('Adds `thing` to `plugins.json`.\n\n'
        '<!-- agentglass-listing {"issue":42,"plugin":"acme-thing","ref":"%s"} -->\n' % ("ab" * 20))


class Listed(unittest.TestCase):
    def test_says_ref_and_merge_and_leaves_it_open(self):
        out = gate.listing_comment(BODY, "cd" * 20, ["plugin-submission"])
        self.assertEqual(out["issue"], 42)
        self.assertIn("Listed at `" + "ab" * 6 + "`", out["body"])
        self.assertIn("merge `" + "cd" * 6 + "`", out["body"])
        self.assertIn("stays open", out["body"])

    def test_no_marker_says_nothing(self):
        self.assertIsNone(gate.listing_comment("Adds a thing.", "cd" * 20, ["plugin-submission"]))

    def test_two_markers_say_nothing(self):
        self.assertIsNone(gate.listing_comment(BODY + BODY, "cd" * 20, ["plugin-submission"]))

    def test_a_ref_that_is_not_a_commit_says_nothing(self):
        bad = BODY.replace("ab" * 20, "main")
        self.assertIsNone(gate.listing_comment(bad, "cd" * 20, ["plugin-submission"]))

    def test_a_plugin_name_that_could_carry_markup_says_nothing(self):
        bad = BODY.replace("acme-thing", "x`--><b>")
        self.assertIsNone(gate.listing_comment(bad, "cd" * 20, ["plugin-submission"]))

    def test_an_issue_that_is_not_a_submission_says_nothing(self):
        self.assertIsNone(gate.listing_comment(BODY, "cd" * 20, ["bug"]))

    def test_a_merge_that_is_not_a_commit_says_nothing(self):
        self.assertIsNone(gate.listing_comment(BODY, "oops", ["plugin-submission"]))


class Cli(unittest.TestCase):
    def run_cli(self, *args, env=None):
        e = {**os.environ, **(env or {})}
        return subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "gate.py"), *args],
                              capture_output=True, text=True, env=e)

    def test_review_reads_a_baseline_file(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "b.json")
            json.dump({"outcome": "passed", "findings": []}, open(p, "w"))
            self.assertEqual(self.run_cli("review", p).stdout.strip(), "no")
            json.dump({"outcome": "findings", "findings": [finding("escalates")]}, open(p, "w"))
            self.assertEqual(self.run_cli("review", p).stdout.strip(), "yes")

    def test_review_of_a_missing_or_broken_file_is_yes(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(self.run_cli("review", os.path.join(d, "nope.json")).stdout.strip(), "yes")
            p = os.path.join(d, "b.json")
            open(p, "w").write("{")
            self.assertEqual(self.run_cli("review", p).stdout.strip(), "yes")

    def test_approval_refuses_through_the_refused_file(self):
        with tempfile.TemporaryDirectory() as d:
            def w(name, rows):
                open(os.path.join(d, name), "w").write("\n".join(json.dumps(r) for r in rows) + "\n")
            body = ("<!-- agentglass-plugin-submission -->\nx\n"
                    '<!-- agentglass-plugin-submission-result {"review":true} -->')
            w("comments", [{**REPORT, "login": "github-actions[bot]", "body": body}])
            w("events", [ev("approved for listing", "2026-01-01T10:30:00Z")])
            json.dump({"maint": "write"}, open(os.path.join(d, "perms"), "w"))
            env = {"COMMENTS": os.path.join(d, "comments"), "EVENTS": os.path.join(d, "events"),
                   "PERMS": os.path.join(d, "perms"), "LABELS": "plugin-submission,approved for listing",
                   "FRESH_REVIEW": "yes", "REFUSED": os.path.join(d, "refused")}
            r = self.run_cli("approval", env=env)
            self.assertNotEqual(r.returncode, 0)
            self.assertIn("security-reviewed", open(env["REFUSED"]).read())


class Workflows(unittest.TestCase):
    """The wiring: the parts of the two workflows the gate hangs on."""

    def test_the_scan_result_reaches_the_marker_and_the_labels(self):
        s = wf("plugin-submission.yml")
        self.assertIn('"review": review', s)
        self.assertIn("security-review-required", s)
        self.assertRegex(s, r"--add-label \"security-review-required\"")

    def test_the_bot_never_adds_security_reviewed(self):
        for name in ("plugin-submission.yml", "plugin-approve.yml", "plugin-listed.yml"):
            for added in re.findall(r'--add-label\s+"?([^"\s]+)', wf(name)):
                self.assertNotEqual(added, "security-reviewed", name)
        self.assertIn('--remove-label "security-reviewed"', wf("plugin-submission.yml"))

    def test_approve_runs_on_either_label_once(self):
        s = wf("plugin-approve.yml")
        job_if = re.search(r"\n  list:\n(?:    #.*\n)*    if: \|?\s*(.*?)\n    runs-on", s, re.S).group(1)
        self.assertIn("github.run_attempt == 1", job_if)
        self.assertIn("'approved for listing'", job_if)
        self.assertIn("'security-reviewed'", job_if)

    def test_approve_runs_the_gate_after_the_fresh_scan_and_before_writing(self):
        s = wf("plugin-approve.yml")
        i_scan = s.index("scripts/plugin-baseline.py /tmp/plugin")
        i_gate = s.index("scripts/gate.py approval")
        i_write = s.index("- name: Write the entry")
        self.assertLess(i_scan, i_gate)
        self.assertLess(i_gate, i_write)

    def test_a_listing_is_not_auto_closing(self):
        s = wf("plugin-approve.yml")
        self.assertNotRegex(s, r"(?i)\bcloses\s+#")
        self.assertIn("agentglass-listing", s)

    def test_a_second_run_finds_the_branch_taken(self):
        self.assertIn("git/ref/heads/$branch", wf("plugin-approve.yml"))

    def test_the_comment_goes_to_the_issue_the_marker_validated(self):
        self.assertIn("jq -r .issue", wf("plugin-listed.yml"))

    def test_listed_workflow_is_narrow(self):
        s = wf("plugin-listed.yml")
        self.assertIn("github.event.pull_request.merged == true", s)
        self.assertIn("github.event.pull_request.head.repo.full_name == github.repository", s)
        self.assertIn("github.event.pull_request.user.type == 'Bot'", s)
        self.assertRegex(s, r"permissions: \{\}")
        self.assertRegex(s, r"issues: write")
        self.assertNotRegex(s, r"(?m)^\s+(contents|pull-requests|statuses|checks|actions): write")
        self.assertNotRegex(s, r"gh issue close|state=closed|--state closed")
        # The script it runs is the default branch's, never the pull request's.
        self.assertRegex(s, r"ref: \$\{\{ github\.event\.repository\.default_branch \}\}")
        self.assertRegex(s, r"persist-credentials: false")
        self.assertNotIn("curl", s)

    def test_every_workflow_declares_permissions_at_the_top(self):
        for name in os.listdir(WF):
            if name.endswith(".yml"):
                self.assertRegex(wf(name), r"(?m)^permissions:", name)


if __name__ == "__main__":
    unittest.main()
