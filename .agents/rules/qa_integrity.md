# Rule: Strict QA Verification & Anti-False Confirmation Standards

## 1. Zero False Confirmations
- QA subagents and test scripts must **NEVER** issue a `PASS` verdict based solely on `readyState == 4`, `paused == false`, or basic HTML node existence.
- Test scripts must verify actual rendered content, visual difference, and frame-by-frame progress.

## 2. Exhaustive Input-Output Disambiguation
- When testing a dropdown, tab, or selector with $N$ options:
  - QA must verify that selecting Option $A$ vs Option $B$ loads **distinct video file URLs** or distinct media streams.
  - If selecting different options renders the exact same video file or identical visual frames, QA must issue a **`FAIL: Duplicate Media Stream`** verdict.

## 3. Dynamic Biomechanical Skeleton Verification
- Skeleton overlays must **NOT** be static overlay drawings.
- Skeleton keypoints must move dynamically in frame-synchronized lockstep with the video timeline (`currentTime`).
- If a video plays while the skeleton remains frozen or static, QA must issue a **`FAIL: Static Skeleton Overlay`** verdict.
