# BalletOS 2.0 — Concept & Ideas Book

**Status:** Living document · **Book version:** 0.2.0 · **Owner:** BalletOS product team

**Created:** 2026-08-10 · **Last updated:** 2026-08-11
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
- DecisionGate-eligible, Nicole-approved comparison cues under a comparable capture protocol, identical metric and model versions, known repeatability, and validated measurement error;
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

`PROPOSE_ONLY` is a separate decision marker. It records that a concept is documented for exploration but is not approved for implementation, promotion into NOW, or scientific claims. Storing a `PROPOSE_ONLY` concept in the canonical Draft PR does not change that decision status.

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
- Does it alter measurement values, evidence status, DecisionGate eligibility, safety claims, or only presentation?
- What evidence or teacher review is required?
- What dependencies and failure modes exist?
- How will success and unintended harm be evaluated?
- Has Nicole reviewed the pedagogical behavior?
- Has engineering estimated the change?
- Has a named owner accepted the work?

Promotion must be recorded in the Decision Log and linked to a dedicated issue or specification.

---

## 4. Idea index

| ID | Idea | Status | Horizon | Decision marker | Depends on |
|---|---|---|---|---|---|
| `IDEA-001` | Adaptive Coaching Profiles | `EXPLORING` | `NEXT` | `PROPOSE_ONLY` | DecisionGate, stable Finding model |
| `IDEA-002` | Cue Point Manager V2 | `EXPLORING` | `NEXT` | `PROPOSE_ONLY` | IDEA-001, Teacher Review workflow |
| `IDEA-003` | Three-surface deployment: iPad, mobile, Linux server | `PARKED` | `LATER` | — | validated local pipeline, product requirements |

---

## 5. IDEA-001 — Adaptive Coaching Profiles

**Status:** `EXPLORING` · **Horizon:** `NEXT` · **Decision marker:** `PROPOSE_ONLY` · **Entry version:** 0.2.0

**Primary users:** Nicole and learners across different ages, learning stages, technique tracks, and teaching contexts

**Problem:** The same technically unchanged observation may require different pedagogical sharpness, information density, prioritization, wording, and presentation. A learner-facing view should remain useful and motivating without changing measurement values, evidence status, or DecisionGate results.

### Source and concept status

- The open Draft PR is the `CANONICAL_PROJECT_SOURCE` for this working concept.
- The invariants in this section are `PROJECT_DECISION` constraints.
- The context model, presentation presets, `Finding`, `Teaching Moment`, `Context Snapshot`, `Pedagogical Feedback Selector`, `CoachingCue`, `Evidence Snapshot`, and `teacher_authored` are `PROPOSED_CONCEPT`, not existing repository contracts.
- Feedback budgets and profile recipes are `PRODUCT_HYPOTHESIS` until tested with Nicole.
- No claim in this section is a scientific validation.

### Core invariant

> Profiles never change the unchanged measurement and evidence basis. The same source observation, evidence status, measurability, eligibility, and DecisionGate result remain identical under every profile.

Profiles may change only:

- selection for a particular learner-facing release;
- pedagogical priority;
- wording and explanation depth;
- information density;
- timing and visual presentation.

Profiles must never:

- loosen or tighten a measurement threshold, including for beginners;
- write into Calculator, EvidenceGate, DecisionGate, or their inputs;
- turn an unvalidated proxy into an eligible result;
- turn `blocked`, `not_measurable`, or missing evidence into praise or criticism;
- suppress a teacher-relevant observation from Nicole's complete teacher view;
- convert teacher review into a changed evidence state or gate result;
- make medical, diagnostic, orthopaedic, injury-risk, force, pressure, or other unsupported safety claims.

Proposed one-way separation:

```text
Calculator + EvidenceGate + DecisionGate
→ unchanged source observation
→ context model (PROPOSED_CONCEPT)
→ Pedagogical Feedback Selector (PROPOSED_CONCEPT)
→ Cue Point Manager V2
→ Nicole preview and release
→ curated learner presentation
```

There is no return path from a profile or cue into measurement, evidence, or eligibility.

### Context model — `PROPOSED_CONCEPT`

A profile is a session- or moment-specific presentation recipe. It is not a permanent learner class. The following axes remain independent:

| Context axis | Examples | May affect | Must not affect |
|---|---|---|---|
| Teaching context | group class, individual coaching, rehearsal, masterclass | presentation density, timing, release workflow | measurement or eligibility |
| Learning stage | introduction, beginner, intermediate, advanced | explanation depth, cue budget | thresholds or evidence status |
| Technique track | general technique, pointe work, repertoire, examination | relevant cue categories and teacher workflow | measurability of unsupported quantities |
| Movement or phase | plié, port de bras, adagio, preparation, landing | pedagogical context and sequencing | the source observation |
| Lesson goal | introduction, consolidation, repetition, preparation | cue prioritization | DecisionGate result |
| Teacher Focus | Nicole's current teaching priority | ordering and learner release | source data or eligibility |
| Presentation preference | concise, explained, visual, technical | wording, pace, information density | technical interpretation |
| Protection and communication context | minor protection, readability, language register | roles, access, accessibility | scoring or tolerance |

Age may inform communication and safeguarding, but age alone never selects a profile. Minis, children, teens, young adults, and older adults do not receive different measurement thresholds because of age.

The selected axes may be captured in a versioned `Context Snapshot` (`PROPOSED_CONCEPT`) so a released cue remains traceable. Nicole must be able to select and override the context for the current class, session, clip, or moment.

### Presentation presets — `PRODUCT_HYPOTHESIS`

The existing profile names remain candidate presentation presets, not demographic labels:

| Preset | Candidate presentation behavior | Boundary |
|---|---|---|
| `JOY_AND_CONFIDENCE` | concise language, one next step, Nicole-confirmed strength may lead | not automatically assigned to children |
| `BUILD_AND_PROGRESS` | one primary focus, optional supporting cue, contextual explanation | no progress claim without comparison prerequisites |
| `TECHNIQUE_AND_PRECISION` | selected technical detail and movement-phase context | no implied increase in measurement precision |
| `ANALYSIS_AND_EXAM` | dense evidence-aware review and optional values | learner release remains curated; teacher view remains complete |

Any preset may be used for any age group when the teaching context supports it. Profile changes are presentation changes only.

### Nicole's teacher view versus learner view

| Information | Nicole's complete teacher view | Curated learner view |
|---|---|---|
| Source observations and values | complete and unchanged, with provenance where available | only when selected, released, and explainable |
| Evidence and measurability | complete and unchanged | neutral when blocked or not measurable |
| DecisionGate result and eligibility | complete and unchanged | never reinterpreted by profile, wording, or color |
| Not in current learning focus | visible and explicitly identified | hidden or explicitly shown as `not_in_current_learning_focus`; never positive |
| Cue candidates | complete candidate set with source reference | invisible before Nicole's release |
| Teacher observation | separate `teacher_authored` contribution | visible only when explicitly released and labelled by origin |
| Positive Teaching Moment | explicitly confirmed by Nicole | may be positively highlighted after confirmation |
| Next step | selected or edited by Nicole | a small number of prioritized, actionable cues |
| Teacher traffic-light aid | teacher-only presentation aid; never evidence or scoring | not inherited; color alone never communicates evidence |

Teacher review never changes measurability, eligibility, evidence status, or the DecisionGate result. Nicole may instead add a separate observation marked `teacher_authored` (`PROPOSED_CONCEPT`).

### Positive feedback and limited correction focus

1. Automatic positive evaluation remains blocked until the relevant system behavior is validated.
2. A visible strength may initially come only from a Teaching Moment explicitly confirmed by Nicole.
3. A criterion not yet taught or selected is `not_in_current_learning_focus`; it is not green, correct, passed, or improved.
4. `blocked`, `not_measurable`, missing, and insufficient evidence remain neutral under every profile.
5. As a discovery hypothesis, the learner view starts with one primary cue and at most one supporting cue. Nicole may override this for the situation.
6. Cue limits never reduce Nicole's complete teacher view.
7. A next step must be teacher-approved, actionable, and free from unsupported diagnosis or safety claims.
8. Fixed green/amber/gray semantics are not canonical. Color alone must never carry evidence status.
9. A comparison may be called a DecisionGate-eligible and Nicole-approved comparison cue only with a comparable capture protocol, identical metric and model versions, known repeatability, and validated measurement error.

### Use-case coverage across groups

These are scenario refinements of IDEA-001 and IDEA-002, not separate ideas or approved implementation contracts.

| Group or context | Example configuration | Learner-facing outcome | Guardrail |
|---|---|---|---|
| Minis and children | group class, introduction stage, general technique, one Teacher Focus | one Nicole-confirmed Teaching Moment and one simple next step | no age automation, public ranking, or changed thresholds |
| Teens | group class or coaching, individual learning stage, selectable explanation depth | few non-shaming cues with optional technical context | no persistent deficit profile |
| Young adults | beginner through advanced, varying lesson goals | concise or detailed presentation after Nicole's selection | age determines neither profile nor eligibility |
| Older adults | individual learning stage plus accessibility preferences | readable, appropriately paced feedback without changing the measurement basis | age is not treated as deficit or additional tolerance |
| Beginners | beginner learning stage and narrow Teacher Focus | one primary cue; remaining criteria stay outside the current learning focus | no artificially widened thresholds |
| Advanced learners | advanced stage with movement- or phase-specific focus | greater explanation depth and, when released, phase-specific cues | no unsupported precision from weak evidence |
| Pointe work | pointe technique track with mandatory teacher curation | only teacher-released technique cues | no pressure, force, injury, or safety claim from unsupported data |
| Masterclasses | temporary teaching context and session-specific Teacher Focus | only cues released for that context | no permanent profile assignment or participant ranking |

### Risks and safeguards

| Risk | Safeguard |
|---|---|
| Profile becomes a hidden scoring parameter | one-way architecture; profile data is unavailable to Calculator, EvidenceGate, and DecisionGate |
| Age-based stereotyping | contextual selection, no automatic age profile, Nicole override |
| Missing or unfocused evidence appears positive | neutral states and explicit `not_in_current_learning_focus` |
| Nicole loses the complete picture | profiles affect preview and learner release only |
| Automatic praise looks scientifically validated | positive highlighting initially requires Nicole-confirmed Teaching Moment |
| Too many cues overload the learner | small discovery budget with teacher override |
| Pointe context creates unsupported safety language | prohibit diagnostic, force, pressure, injury-risk, and unmeasurable claims |
| Context changes make output irreproducible | retain source reference and versioned Context Snapshot |
| Minor-facing feedback is exposed inappropriately | role-based release, no ranking, no automatic parent output |

### Open decisions

- Decide whether the four preset names remain user-facing or become internal recipes.
- Decide which context axes Nicole must select actively and which may be session defaults.
- Decide whether `not_in_current_learning_focus` is usually hidden or explicitly displayed in the learner view.

**Prioritized Discovery question:** What is the smallest combination of learning stage, technique track, lesson goal, and Teacher Focus Nicole needs to choose a suitable learner view reliably without relying on age-based profiles?

### Smallest Discovery test with Nicole

Run one 45–60 minute card-sorting session without implementation or real learner data:

1. Prepare one synthetic set of technically unchanged observations with fixed evidence and DecisionGate results.
2. Present eight context cards covering the groups above.
3. Ask Nicole to choose learning stage, technique track, lesson goal, Teacher Focus, detail level, and cue budget for each card.
4. Let Nicole construct the complete teacher view and the curated learner release.
5. Repeat selected choices without displaying the learner's age label.

The concept passes this first test only if the source observations remain unchanged, no age-based threshold decision appears, the two views remain clearly distinct, and blocked or unfocused information is never presented as positive.

### Exit condition from EXPLORING

- context axes and terminology reviewed by Nicole;
- model tested with at least one child, teen, adult beginner, older adult, advanced, pointe, and masterclass scenario;
- teacher and learner previews evaluated in Shadow Mode;
- feedback budget treated as a tested product hypothesis rather than a universal rule;
- architecture review confirms no profile or cue path can alter Calculator, EvidenceGate, DecisionGate, or their outputs.

---

## 6. IDEA-002 — Cue Point Manager V2

**Status:** `EXPLORING` · **Horizon:** `NEXT` · **Decision marker:** `PROPOSE_ONLY` · **Entry version:** 0.2.0

**Problem:** The concept risks treating cue points as an error list instead of contextual, teacher-controlled learning moments.

### Proposed role

The Cue Point Manager is an editorial and teaching layer. It selects, sequences, phrases, previews, and releases learning moments. It does not measure movement, change evidence, determine eligibility, or decide scientific validity.

### Connection to IDEA-001

IDEA-001 supplies the selected context and presentation recipe. IDEA-002 applies them downstream of the unchanged source observation:

1. retain the same Finding reference, value, evidence status, measurability, and DecisionGate result;
2. identify candidates relevant to Teacher Focus, lesson goal, movement, and technique track;
3. propose profile-appropriate wording, explanation depth, and information density;
4. require Nicole's preview and release for the learner-facing result.

If a Finding is not selected, it remains available in Nicole's complete view and is marked `not_in_current_learning_focus`; it is never converted into a positive result.

### Proposed concepts, not repository contracts

`Finding`, `CoachingCue`, `Evidence Snapshot`, `Context Snapshot`, `Teaching Moment`, `Pedagogical Feedback Selector`, and `teacher_authored` are `PROPOSED_CONCEPT` labels. The following fields are conceptual traceability needs, not an approved TypeScript interface:

| Conceptual field | Purpose |
|---|---|
| source observation or Finding reference | preserves the unchanged technical source |
| Evidence Snapshot reference | preserves evidence and eligibility provenance |
| Context Snapshot | records the presentation context used for selection |
| authorship | distinguishes a system candidate from `teacher_authored` content |
| cue kind | distinguishes next step, teacher review, capture issue, or Nicole-confirmed Teaching Moment |
| target visibility | separates teacher, learner, and any later parent release |
| teacher review state | records pending, approved, edited, withheld, or rejected presentation |
| source and presentation versions | supports later audit and reproducibility |

### Selection, formulation, and release rules

- Selection may use lesson goal, movement, technique track, Teacher Focus, and teacher-set priority only after the technical result is fixed.
- Wording may change with the presentation preset, but must retain the same source reference and must not imply changed evidence or precision.
- Teacher Review may approve or edit presentation, but never measurability, evidence, eligibility, or DecisionGate output.
- A separate `teacher_authored` observation may be released if its origin remains explicit.
- Blocked or not measurable inputs may generate a neutral capture or review cue, never a technical correction or strength.
- A learner receives only Nicole-released cues. The complete candidate set remains available to Nicole.
- A positive cue initially requires a Nicole-confirmed Teaching Moment; automatic positive evaluation remains blocked pending validation.
- No fixed color vocabulary is defined. Text, labels, and provenance must carry meaning independently of color.

### Live versus replay

- **Live:** one active teaching cue is the current product hypothesis; no cascade of simultaneous corrections.
- **Immediate replay:** a curated Teaching Moment and next step may be prepared for Nicole's approval.
- **Teacher review:** complete source observations, evidence state, eligibility, context, and cue candidates.
- **Learner release:** only explicitly released cues with neutral handling of blocked and not measurable evidence.
- **Parent view:** remains a separate later decision and never receives raw system output automatically.

### Ranking hypothesis

Cue candidates may later be ranked by:

1. Nicole's Teacher Focus;
2. relevance to the lesson goal, movement, and technique track;
3. unchanged evidence and DecisionGate eligibility;
4. realistic actionability;
5. repetition across comparable attempts;
6. eligibility for a DecisionGate-eligible and Nicole-approved comparison cue under the documented comparison prerequisites.

No ranking formula or automated release policy is approved.

### Dependencies

- stable source observation and Decision model;
- neutral display states;
- Teacher Review Event model;
- IDEA-001 context and presentation model;
- valid per-video timestamps and cue ranges;
- privacy, deletion, role, and minor-protection policy.

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
| 2026-08-10 | Learner profiles may change presentation, never the unchanged measurement and evidence basis or scientific eligibility. | Protect both pedagogy and epistemic integrity. |
| 2026-08-10 | No universal positive-to-correction ratio is claimed. | Feedback budgets are hypotheses that require real-world evaluation with Nicole. |
| 2026-08-11 | `PROPOSE_ONLY` ideas are stored in the canonical Draft PR without becoming approved product scope. | Separate durable documentation from product, implementation, validation, and merge decisions. |
| 2026-08-11 | Age alone never selects a profile; learning stage, technique track, movement, lesson goal, and Teacher Focus remain separate axes. | Avoid demographic stereotyping and hidden changes to measurement behavior. |
| 2026-08-11 | Nicole's complete teacher view is separate from the curated learner view. | Cue limits and presentation profiles must not hide teacher-relevant source information. |
| 2026-08-11 | Teacher Review never changes measurability, evidence, eligibility, or DecisionGate results; separate teacher content is labelled `teacher_authored`. | Preserve the source record while allowing pedagogical expertise to be added transparently. |
| 2026-08-11 | `not_in_current_learning_focus`, blocked, and not measurable are neutral; fixed color semantics are not canonical. | Prevent missing or deferred evidence from appearing correct or positive. |

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

- While Draft PR #1 remains open, it is the canonical Ideas Lab working medium; update only its existing head branch and do not create a competing branch or PR.
- Update only `docs/CONCEPT_IDEAS_BOOK.md` and explicitly approved files under `docs/ideas/`.
- Storing a `PROPOSE_ONLY` or `PROPOSED_CONCEPT` entry in the Draft PR is not implementation, NOW, validation, or merge approval.
- Never delete rejected ideas; preserve the rationale.
- Review the NEXT section when a NOW exit criterion is completed, not whenever a new idea appears.
- Move implementation detail into a dedicated specification only after an idea is accepted.
- Keep this document conceptual; do not turn it into a second backlog or a second Metric Registry.
- Never merge from the Ideas Lab, write directly to `main`, change code, or create implementation issues.
