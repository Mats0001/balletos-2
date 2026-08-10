# BalletOS 2.0 — Concept & Ideas Book

**Status:** Living document · **Book version:** 0.1.0 · **Owner:** BalletOS product team

**Created:** 2026-08-10 · **Last updated:** 2026-08-10
**Purpose:** Preserve product and pedagogy ideas without interrupting the active engineering focus.

---

## 1. Why this document exists

BalletOS needs a safe place for valuable ideas that are not ready for implementation. This document is that place.

It has three jobs:

1. retain ideas, questions, and design hypotheses;
2. make the current product focus explicit;
3. prevent a promising idea from silently becoming a development task.

An entry in this book is **not** an implementation approval, metric definition, scientific validation, or sprint commitment.

The authoritative sources remain separate:

- metric definitions and evidence provenance: Metric Registry;
- executable scoring policy: DecisionGate and Evaluation Policy;
- planned engineering work: sprint backlog and accepted issues;
- implementation history: commits and pull requests.

---

## 2. Focus rule

> **One active foundation at a time. Ideas may be captured at any time, but only explicitly promoted ideas may enter a sprint.**

### NOW — Active engineering focus

The current focus is the **Skeleton Measurement Foundation**:

- frame and video synchronization;
- `PosePacket` and frame provenance;
- mandatory `FrameGeometry` and coordinate-space correctness;
- raw `MeasurementObservation` values without hidden verdicts;
- central, fail-closed `DecisionGate`;
- Metric Registry and validation contracts;
- capture capability and quality gates;
- neutral handling of unvalidated and non-measurable outputs;
- regression and contract tests.

The NOW phase is complete only when an invalid or unvalidated measurement cannot produce a score, red/green verdict, safety claim, or homework instruction through any application path.

### Explicitly not in NOW

The following may be researched and documented, but must not expand the current Skeleton sprint:

- adaptive student feedback profiles;
- Cue Point Manager redesign;
- gamification and reward systems;
- parent-facing reports;
- final iPad or smartphone product flows;
- calibrated multi-camera reconstruction;
- Linux/NVIDIA 3090 server deployment;
- kinetics, pressure plates, or injury-risk claims.

### NEXT — Product and pedagogy layer

Candidates after the Skeleton foundation:

- Teacher Review workflow and durable review events;
- adaptive coaching profiles;
- Cue Point Manager V2;
- separate teacher, student, and parent views;
- guided single-camera capture;
- progress comparison against a valid personal baseline;
- controlled Shadow Mode evaluation with Nicole.

### LATER — Extended platform

- dedicated iPad application or optimized PWA;
- mobile capture and review experience;
- calibrated multi-view studio setup;
- fixed Linux/NVIDIA 3090 inference server;
- optional sensor integrations;
- validated 3D and kinetics workflows;
- longitudinal learning analytics.

---

## 3. Idea lifecycle

Every idea has two independent labels: a **status** and a **horizon**.

### Status

| Status | Meaning |
|---|---|
| `INBOX` | Captured, not yet assessed |
| `EXPLORING` | Problem and options are being clarified |
| `EVIDENCE_NEEDED` | Requires pedagogical, scientific, UX, or technical evidence |
| `READY_FOR_DECISION` | Sufficiently specified for an explicit product decision |
| `ACCEPTED` | Approved concept, but not automatically scheduled |
| `PARKED` | Valuable, deliberately deferred |
| `REJECTED` | Deliberately not pursued; rationale retained |
| `SUPERSEDED` | Replaced by another concept or decision |

### Horizon

| Horizon | Meaning |
|---|---|
| `NOW` | Part of the single active foundation |
| `NEXT` | Eligible only after the NOW exit criteria are met |
| `LATER` | Strategic option without near-term implementation commitment |

### Promotion gate

An idea may move from this book into the product backlog only when all applicable questions are answered:

- What user problem does it solve?
- Who is the primary user?
- What is explicitly out of scope?
- Does it alter measurement truth, scoring, safety, or only presentation?
- What evidence or teacher review is required?
- What dependencies and failure modes exist?
- How will success and unintended harm be evaluated?
- Has Nicole reviewed the pedagogical behavior?
- Has engineering estimated the change?
- Has a named owner accepted the work?

Promotion must be recorded in the Decision Log and linked to a dedicated issue or specification.

---

## 4. Idea index

| ID | Idea | Status | Horizon | Depends on |
|---|---|---|---|---|
| `IDEA-001` | Adaptive Coaching Profiles | `EXPLORING` | `NEXT` | DecisionGate, stable Finding model |
| `IDEA-002` | Cue Point Manager V2 | `EXPLORING` | `NEXT` | IDEA-001, Teacher Review workflow |
| `IDEA-003` | Three-surface deployment: iPad, mobile, Linux server | `PARKED` | `LATER` | validated local pipeline, product requirements |

---

## 5. IDEA-001 — Adaptive Coaching Profiles

**Status:** `EXPLORING` · **Horizon:** `NEXT` · **Entry version:** 0.1.0

**Primary users:** Nicole, students across age and training stages
**Problem:** A technically correct system can still demotivate learners if it displays every deviation with equal intensity or predominantly red feedback.

### Core invariant

> Measurement truth does not change with age, skill, temperament, or coaching mode. Only selection, density, wording, timing, and visual emphasis may change.

Proposed separation:

```text
Measurement + DecisionGate
→ immutable technical Finding
→ Pedagogical Feedback Selector
→ Coaching Profile
→ Cue Point Manager
→ teacher / student / parent presentation
```

The pedagogical layer must never:

- loosen or tighten a scientific threshold;
- turn an unvalidated proxy into a valid score;
- suppress a teacher-relevant finding from the teacher view;
- convert missing evidence into praise or criticism;
- make medical or injury-risk claims.

### Proposed coaching profiles

The user-facing term should be **Feedback Focus**, not measurement sharpness.

| Profile | Typical use | Student presentation |
|---|---|---|
| `JOY_AND_CONFIDENCE` | young learners, anxious or very new beginners | strengths first, one next step, no red error display |
| `BUILD_AND_PROGRESS` | beginners of any age | strength, personal progress, one or two priorities |
| `TECHNIQUE_AND_PRECISION` | intermediate and advanced learners | selected technical detail, phase comparison, optional values |
| `ANALYSIS_AND_EXAM` | advanced, examination, professional, teacher | full eligible findings, evidence and uncertainty |

These are starting hypotheses, not scientific norms. They require testing with Nicole and representative students.

Age alone must not select a profile. Relevant inputs may include:

- age group;
- training stage;
- lesson goal;
- learner preference;
- confidence and frustration signals reported by the teacher;
- teacher override for the current session.

### Initial feedback budget hypothesis

| Profile | Positive/progress cues | Visible next steps per short clip |
|---|---:|---:|
| `JOY_AND_CONFIDENCE` | at least 2 | at most 1 |
| `BUILD_AND_PROGRESS` | at least 1 strength + 1 progress cue | at most 2 |
| `TECHNIQUE_AND_PRECISION` | at least 1 | at most 3 |
| `ANALYSIS_AND_EXAM` | no fixed budget in teacher view | all eligible findings |

This budget is a product hypothesis. BalletOS must not claim that a universal feedback ratio has been scientifically validated.

### Color policy hypothesis

- green: confirmed strength or valid progress;
- blue/violet: next learning step;
- amber: teacher-guided review;
- gray: unvalidated, not scored, or not evaluable;
- red: reserved for teacher-only, explicitly eligible high-priority findings.

In the current unvalidated product phase, student-facing red technical verdicts remain disabled.

### Open questions for Nicole

1. Which profiles match her real class groups, and where do they fail?
2. Should learners be allowed to request more or less detail?
3. Which metaphors work by age group, and which feel childish or unclear?
4. How many correction points are useful in a 15-, 30-, or 60-second clip?
5. Which findings should always remain teacher-only?
6. What counts as meaningful progress from a teacher's perspective?

### Exit condition from EXPLORING

- profiles reviewed by Nicole;
- terminology tested with at least one child, adult beginner, older adult, and advanced learner context;
- student and teacher wireframes created;
- feedback budget tested in Shadow Mode;
- no path can alter DecisionGate output.

---

## 6. IDEA-002 — Cue Point Manager V2

**Status:** `EXPLORING` · **Horizon:** `NEXT` · **Entry version:** 0.1.0
**Problem:** The current concept risks treating cue points as an error list instead of structured learning moments.

### Proposed role

The Cue Point Manager is an editorial and teaching layer. It selects, sequences, phrases, and approves learning moments. It does not measure movement and does not decide scientific validity.

### Cue types

```ts
type CueKind =
  | 'strength'
  | 'progress'
  | 'next_step'
  | 'teacher_review'
  | 'capture_issue';
```

### Conceptual CuePoint V2

```ts
interface CoachingCue {
  cueId: string;
  findingId?: string;
  startPts: number;
  endPts: number;

  kind: CueKind;
  priority: number;
  visibility: 'teacher_only' | 'student' | 'parent';

  positiveAnchor?: string;
  learnerAction?: string;
  technicalExplanation?: string;
  metaphor?: string;

  coachingProfileIds: string[];
  evidenceState: 'validated' | 'display_only' | 'unvalidated';
  teacherReviewStatus: 'pending' | 'approved' | 'edited' | 'rejected';
  evidenceSnapshotHash?: string;
}
```

### Live versus replay

- **Live:** at most one active teaching cue; no cascade of simultaneous corrections.
- **Immediate replay:** curated strength, progress, and next-step moments.
- **Teacher review:** complete technical findings and evidence state.
- **Student release:** only teacher-approved or policy-eligible cues.
- **Parent view:** progress and teaching focus, not raw diagnostic-style output.

### Ranking hypothesis

Cue candidates may later be ranked by:

1. teacher-defined pedagogical priority;
2. measurement and evidence quality;
3. relevance to the current lesson goal;
4. repetition across attempts;
5. realistic actionability;
6. valid progress against the learner's own baseline.

No ranking formula is approved yet.

### Dependencies

- stable Finding/Decision model;
- neutral display states;
- Teacher Review Event model;
- coaching profiles;
- valid per-video timestamps and cue ranges;
- privacy model for minors and parent-facing output.

---

## 7. IDEA-003 — Three-surface deployment

**Status:** `PARKED` · **Horizon:** `LATER`
**Entry version:** 0.1.0

Potential long-term surfaces:

1. iPad capture and studio teaching interface;
2. mobile capture/review experience;
3. fixed Linux server with NVIDIA 3090 for controlled local inference.

This idea remains parked until the same measurement contracts, provenance, and DecisionGate behavior work consistently in the current application. Hardware-specific optimization must not fork scientific definitions or scoring policy.

---

## 8. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-10 | Skeleton Measurement Foundation is the only NOW focus. | Correct geometry, synchronization, evidence, and decision contracts are prerequisites for every later feature. |
| 2026-08-10 | Adaptive feedback and Cue Point Manager V2 are captured as NEXT concepts, not sprint work. | Preserve the ideas without expanding the current implementation scope. |
| 2026-08-10 | Learner profiles may change presentation, never measurement truth or scientific eligibility. | Protect both pedagogy and epistemic integrity. |
| 2026-08-10 | No universal positive-to-correction ratio is claimed. | Feedback budgets are hypotheses that require real-world evaluation with Nicole. |

---

## 9. Template for future ideas

Copy this section for each new entry:

```markdown
## IDEA-XXX — Short title

**Status:** INBOX
**Horizon:** LATER
**Proposer:**
**Date:**
**Primary user:**

### Problem

What real user or product problem exists?

### Concept

What is the idea, without prematurely specifying implementation?

### Non-goals

What will this idea explicitly not do?

### Scientific, pedagogical, and safety boundaries

Which truths, policies, or claims must remain unchanged?

### Dependencies

What must exist first?

### Evidence needed

What research, testing, teacher review, or validation is needed?

### Open questions

What has not yet been decided?

### Promotion trigger

What concrete condition makes this eligible for READY_FOR_DECISION?
```

---

## 10. Maintenance rule

- Add ideas through a small pull request.
- Never delete rejected ideas; preserve the rationale.
- Review the NEXT section when a NOW exit criterion is completed, not whenever a new idea appears.
- Move implementation detail into a dedicated specification once an idea is accepted.
- Keep this document conceptual; do not turn it into a second backlog or a second Metric Registry.
