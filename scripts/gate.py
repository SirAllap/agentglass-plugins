#!/usr/bin/env python3
"""The decisions behind the security-review gate, in one place a test can reach.

Three questions, each answered here so the workflows only carry the answer:

  review    Does this scan need a person's read before anything is listed?
  approval  May an approved submission be listed, given who reviewed it and when?
  listed    What does the bot say on the issue once the listing has merged?

Nothing here runs anything from a submitted repository. It reads JSON the
workflows already wrote and prints one line.
"""
import json
import os
import re
import sys

# Findings a scan makes all the time and that alone do not ask for a second
# pair of eyes. Everything else the scan can say does. A scan that did not
# complete is not one that found nothing.
LOW_SIGNAL = {"hardcoded-endpoint", "kills-by-pattern"}
WRITE = {"admin", "maintain", "write"}
REVIEWED = "security-reviewed"
REQUIRED = "security-review-required"

REPORT_HEAD = "<!-- agentglass-plugin-submission -->"
RESULT = re.compile(r"<!-- agentglass-plugin-submission-result (\{[^\n]*?\}) -->")
LISTING = re.compile(r"<!-- agentglass-listing (\{[^\n]*?\}) -->")


def needs_review(baseline):
    if not isinstance(baseline, dict) or baseline.get("outcome") not in ("passed", "findings"):
        return True
    return any(f.get("id") not in LOW_SIGNAL for f in baseline.get("findings") or [])


def latest_report(comments):
    reports = [c for c in comments
               if c.get("login") == "github-actions[bot]" and c.get("type") == "Bot"
               and str(c.get("body", "")).startswith(REPORT_HEAD)]
    return reports[-1] if reports else None


def marker_in(pattern, text):
    """The one JSON object a marker comment carries, or {} for none, two or a broken one."""
    found = pattern.findall(str(text or ""))
    if len(found) != 1:
        return {}
    try:
        mark = json.loads(found[0])
    except json.JSONDecodeError:
        return {}
    return mark if isinstance(mark, dict) else {}


def is_bot(event):
    return event.get("actor_type") == "Bot" or str(event.get("actor", "")).endswith("[bot]")


def approval_refusal(*, marker, fresh_review, labels, events, report, perms):
    """Why this approval may not list, or None when it may.

    A review is required when ANY of three things says so, so removing one
    signal is not a way past it: the report's own marker (anything but an
    explicit False, which is also what a report from before this gate says),
    a fresh scan of the commit being listed, and the label on the issue.
    It is given by the label `security-reviewed`, applied by somebody who has
    write access NOW, after the latest report was written (the same second
    counts as before), and still on the issue. A bot never counts.
    """
    # The approval itself, by somebody with write access NOW: a label a
    # triage user applied is on the issue too, and a writer applying the
    # other label must not sign it off by accident.
    approvals = [e for e in events if e.get("label") == "approved for listing"]
    if not approvals or is_bot(approvals[-1]) or perms.get(approvals[-1].get("actor")) not in WRITE:
        return "approved for listing was not applied by somebody with write access; a maintainer applies it again"
    required = (marker or {}).get("review") is not False or fresh_review != "no" or REQUIRED in labels
    if not required:
        return None
    if REVIEWED not in labels:
        return (f"the scan found something that needs a person's read, and nobody with write access has applied "
                f"{REVIEWED} since the latest report; read the report and the source, apply {REVIEWED}, then approve")
    posted = (report or {}).get("updated_at") or "9999"
    # The latest such event only: a triage user applying it again after a
    # writer's review is the review of somebody who may not give one.
    reviews = [e for e in events if e.get("label") == REVIEWED]
    if reviews and reviews[-1].get("created_at", "") > posted and not is_bot(reviews[-1]) \
            and perms.get(reviews[-1].get("actor")) in WRITE:
        return None
    return (f"{REVIEWED} was not applied by somebody with write access after the latest report was written; "
            f"read that report, remove {REVIEWED} and apply it again")


def listing_comment(pr_body, merge_sha, issue_labels):
    """The issue number and the comment for a merged listing, or None to say nothing."""
    m = marker_in(LISTING, pr_body)
    if not m or not re.fullmatch(r"[0-9a-f]{40}", str(merge_sha or "")) or "plugin-submission" not in issue_labels:
        return None
    issue, plugin, ref = m.get("issue"), m.get("plugin"), m.get("ref")
    if not (isinstance(issue, int) and not isinstance(issue, bool) and 0 < issue < 10**9):
        return None
    if not (isinstance(plugin, str) and re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", plugin)):
        return None
    if not (isinstance(ref, str) and re.fullmatch(r"[0-9a-f]{40}", ref)):
        return None
    return {"issue": issue,
            "body": f"Listed at `{ref[:12]}`, merge `{merge_sha[:12]}`. This issue stays open: "
                    f"close it when you have checked the listing of `{plugin}`."}


def rows(path):
    try:
        return [json.loads(l) for l in open(path) if l.strip()]
    except (OSError, ValueError):
        return []


def main(argv):
    env = os.environ
    if len(argv) == 3 and argv[1] == "review":
        try:
            baseline = json.load(open(argv[2]))
        except (OSError, ValueError):
            baseline = None
        print("yes" if needs_review(baseline) else "no")
        return 0
    if len(argv) == 2 and argv[1] == "approval":
        report = latest_report(rows(env["COMMENTS"]))
        try:
            perms = json.load(open(env["PERMS"]))
        except (OSError, ValueError):
            perms = {}
        why = approval_refusal(marker=marker_in(RESULT, (report or {}).get("body")), fresh_review=env.get("FRESH_REVIEW", ""),
                               labels=[l for l in env.get("LABELS", "").split(",") if l],
                               events=rows(env["EVENTS"]), report=report, perms=perms)
        if why:
            open(env["REFUSED"], "w").write(why)
            print(f"::error::{why}")
            return 1
        return 0
    if len(argv) == 2 and argv[1] == "listed-issue":
        issue = marker_in(LISTING, env.get("PR_BODY", "")).get("issue")
        if not (isinstance(issue, int) and not isinstance(issue, bool) and 0 < issue < 10**9):
            return 1
        print(issue)
        return 0
    if len(argv) == 2 and argv[1] == "listed":
        out = listing_comment(env.get("PR_BODY", ""), env.get("MERGE_SHA", ""),
                              [l for l in env.get("ISSUE_LABELS", "").split(",") if l])
        if out is None:
            return 1
        print(json.dumps(out))
        return 0
    print("usage: gate.py review <baseline.json> | approval | listed-issue | listed", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
