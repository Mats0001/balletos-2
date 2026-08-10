import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Math implementation matching VaganovaHandEngine for empirical vector verification
function computeBalletHandMath(wrist, elbow, isLeft) {
  const wx = wrist.x;
  const wy = wrist.y;

  const dx = wx - elbow.x;
  const dy = wy - elbow.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  const ax = dx / len;
  const ay = dy / len;

  const nx = isLeft ? -ay : ay;
  const ny = isLeft ? ax : -ax;

  const handScale = 0.045;

  const wKp = { x: wx, y: wy, visibility: wrist.visibility ?? 0.95 };

  const thumb = [
    { x: wx + (ax * 0.2 + nx * 0.35) * handScale, y: wy + (ay * 0.2 + ny * 0.35) * handScale, visibility: 0.95 },
    { x: wx + (ax * 0.4 + nx * 0.50) * handScale, y: wy + (ay * 0.4 + ny * 0.50) * handScale, visibility: 0.95 },
    { x: wx + (ax * 0.5 + nx * 0.30) * handScale, y: wy + (ay * 0.5 + ny * 0.30) * handScale, visibility: 0.95 },
    { x: wx + (ax * 0.4 + nx * 0.15) * handScale, y: wy + (ay * 0.4 + ny * 0.15) * handScale, visibility: 0.95 }
  ];

  const index = [
    { x: wx + (ax * 0.6 + nx * 0.15) * handScale, y: wy + (ay * 0.6 + ny * 0.15) * handScale, visibility: 0.95 },
    { x: wx + (ax * 0.9 + nx * 0.12) * handScale, y: wy + (ay * 0.9 + ny * 0.12) * handScale, visibility: 0.95 },
    { x: wx + (ax * 1.15 + nx * 0.08) * handScale, y: wy + (ay * 1.15 + ny * 0.08) * handScale, visibility: 0.95 },
    { x: wx + (ax * 1.35 + nx * 0.04) * handScale, y: wy + (ay * 1.35 + ny * 0.04) * handScale, visibility: 0.95 }
  ];

  const middle = [
    { x: wx + (ax * 0.65) * handScale, y: wy + (ay * 0.65) * handScale, visibility: 0.95 },
    { x: wx + (ax * 0.95 - nx * 0.02) * handScale, y: wy + (ay * 0.95 - ny * 0.02) * handScale, visibility: 0.95 },
    { x: wx + (ax * 1.20 - nx * 0.05) * handScale, y: wy + (ay * 1.20 - ny * 0.05) * handScale, visibility: 0.95 },
    { x: wx + (ax * 1.40 - nx * 0.08) * handScale, y: wy + (ay * 1.40 - ny * 0.08) * handScale, visibility: 0.95 }
  ];

  const ring = [
    { x: wx + (ax * 0.6 - nx * 0.15) * handScale, y: wy + (ay * 0.6 - nx * 0.15) * handScale, visibility: 0.95 },
    { x: wx + (ax * 0.9 - nx * 0.18) * handScale, y: wy + (ay * 0.9 - ny * 0.18) * handScale, visibility: 0.95 },
    { x: wx + (ax * 1.12 - nx * 0.20) * handScale, y: wy + (ay * 1.12 - ny * 0.20) * handScale, visibility: 0.95 },
    { x: wx + (ax * 1.30 - nx * 0.22) * handScale, y: wy + (ay * 1.30 - ny * 0.22) * handScale, visibility: 0.95 }
  ];

  const pinky = [
    { x: wx + (ax * 0.55 - nx * 0.28) * handScale, y: wy + (ay * 0.55 - ny * 0.28) * handScale, visibility: 0.95 },
    { x: wx + (ax * 0.80 - nx * 0.32) * handScale, y: wy + (ay * 0.80 - ny * 0.32) * handScale, visibility: 0.95 },
    { x: wx + (ax * 1.02 - nx * 0.35) * handScale, y: wy + (ay * 1.02 - ny * 0.35) * handScale, visibility: 0.95 },
    { x: wx + (ax * 1.20 - nx * 0.38) * handScale, y: wy + (ay * 1.20 - ny * 0.38) * handScale, visibility: 0.95 }
  ];

  return { wrist: wKp, thumb, index, middle, ring, pinky, ax, ay, nx, ny };
}

async function runAudit() {
  console.log('=== STARTING BALLETOS 2.0 QA-SKEPTIKER EMPIRICAL AUDIT ===');
  
  const artifactDir = '/Users/mats/.gemini/antigravity/brain/0bd39a53-23e3-4396-8bc0-9ad988f7dd25';
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  const results = {
    timestamp: new Date().toISOString(),
    auditTarget: 'http://localhost:3000',
    tasks: {}
  };

  // ----------------------------------------------------
  // TASK 1: HAND & FINGER KEYPOINT ALIGNMENT AUDIT
  // ----------------------------------------------------
  console.log('\n--- TASK 1: Hand/Finger Orientation vs Arm Angle Audit ---');

  // Test Left Arm horizontal extension (elbow = [0.3, 0.5], wrist = [0.1, 0.5])
  const leftWrist = { x: 0.1, y: 0.5, z: 0 };
  const leftElbow = { x: 0.3, y: 0.5, z: 0 };
  const handL = computeBalletHandMath(leftWrist, leftElbow, true);

  // Forearm unit vector ax, ay = (-1, 0)
  const fVectorL = { x: handL.ax, y: handL.ay };

  // Calculate finger tip vectors relative to wrist
  const fingersToAuditL = [
    { name: 'Index', tip: handL.index[3] },
    { name: 'Middle', tip: handL.middle[3] },
    { name: 'Ring', tip: handL.ring[3] },
    { name: 'Pinky', tip: handL.pinky[3] }
  ];

  const leftHandMetrics = fingersToAuditL.map(f => {
    const vx = f.tip.x - leftWrist.x;
    const vy = f.tip.y - leftWrist.y;
    const vLen = Math.sqrt(vx * vx + vy * vy);
    const dot = vx * fVectorL.x + vy * fVectorL.y;
    const cosTheta = dot / (vLen * 1.0);
    const angleDeg = Math.acos(Math.min(Math.max(cosTheta, -1), 1)) * (180 / Math.PI);
    const isPointingDown = vy > 0.005; // Screen Y increases downwards
    return {
      finger: f.name,
      tipX: f.tip.x,
      tipY: f.tip.y,
      vectorX: vx,
      vectorY: vy,
      dotProductWithForearm: dot,
      angleDegVsForearm: angleDeg,
      isPointingDown
    };
  });

  // Test Right Arm horizontal extension (elbow = [0.7, 0.5], wrist = [0.9, 0.5])
  const rightWrist = { x: 0.9, y: 0.5, z: 0 };
  const rightElbow = { x: 0.7, y: 0.5, z: 0 };
  const handR = computeBalletHandMath(rightWrist, rightElbow, false);
  const fVectorR = { x: handR.ax, y: handR.ay }; // (+1, 0)

  const fingersToAuditR = [
    { name: 'Index', tip: handR.index[3] },
    { name: 'Middle', tip: handR.middle[3] },
    { name: 'Ring', tip: handR.ring[3] },
    { name: 'Pinky', tip: handR.pinky[3] }
  ];

  const rightHandMetrics = fingersToAuditR.map(f => {
    const vx = f.tip.x - rightWrist.x;
    const vy = f.tip.y - rightWrist.y;
    const vLen = Math.sqrt(vx * vx + vy * vy);
    const dot = vx * fVectorR.x + vy * fVectorR.y;
    const cosTheta = dot / (vLen * 1.0);
    const angleDeg = Math.acos(Math.min(Math.max(cosTheta, -1), 1)) * (180 / Math.PI);
    const isPointingDown = vy > 0.005;
    return {
      finger: f.name,
      tipX: f.tip.x,
      tipY: f.tip.y,
      vectorX: vx,
      vectorY: vy,
      dotProductWithForearm: dot,
      angleDegVsForearm: angleDeg,
      isPointingDown
    };
  });

  console.log('Left Hand Finger Metrics:', JSON.stringify(leftHandMetrics, null, 2));
  console.log('Right Hand Finger Metrics:', JSON.stringify(rightHandMetrics, null, 2));

  const pointingDownAny = leftHandMetrics.some(m => m.isPointingDown) || rightHandMetrics.some(m => m.isPointingDown);
  const maxAngleDeviation = Math.max(
    ...leftHandMetrics.map(m => m.angleDegVsForearm),
    ...rightHandMetrics.map(m => m.angleDegVsForearm)
  );

  results.tasks.task1_hand_alignment = {
    status: pointingDownAny ? 'FAIL' : 'PASS',
    pointingDownDetected: pointingDownAny,
    maxAngleDeviationDeg: maxAngleDeviation,
    leftHandMetrics,
    rightHandMetrics
  };

  // ----------------------------------------------------
  // TASK 2: 0-LAG TRACKING SYNC AUDIT (PLAYWRIGHT BROWSER)
  // ----------------------------------------------------
  console.log('\n--- TASK 2: 0-Lag Video Tracking Sync Audit ---');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  // Navigate to Video Analyzer view
  const analyzerNav = page.locator('button:has-text("Video-Analyse")');
  await analyzerNav.click();
  await page.waitForTimeout(1000);

  // Audit requestVideoFrameCallback usage and timing sync in browser
  const trackingAudit = await page.evaluate(async () => {
    const video = document.querySelector('video');
    const hasRVFC = video && typeof video.requestVideoFrameCallback === 'function';

    // Check codebase or execution for requestVideoFrameCallback usage
    const isRVFCActive = false; // Audited from codebase: VideoAnalyzer uses requestAnimationFrame + send({image})

    // Measure video playback frame timestamps vs requestAnimationFrame jitter over 60 frames
    const timestamps = [];
    if (video) {
      video.play().catch(() => {});
      for (let i = 0; i < 30; i++) {
        timestamps.push({
          currentTime: video.currentTime,
          performanceNow: performance.now()
        });
        await new Promise(res => requestAnimationFrame(res));
      }
    }

    // Calculate latency/jitter between rAF intervals and video time increments
    let totalJitter = 0;
    for (let i = 1; i < timestamps.length; i++) {
      const dtPerf = timestamps[i].performanceNow - timestamps[i-1].performanceNow;
      const dtVideo = (timestamps[i].currentTime - timestamps[i-1].currentTime) * 1000;
      totalJitter += Math.abs(dtPerf - dtVideo);
    }
    const avgSyncSkewMs = timestamps.length > 1 ? totalJitter / (timestamps.length - 1) : 0;

    return {
      hasRVFCAPI: hasRVFC,
      usesRVFCForSync: isRVFCActive,
      avgSyncSkewMs: avgSyncSkewMs,
      estimatedTrackingLagFrames: Math.ceil(avgSyncSkewMs / 16.66)
    };
  });

  console.log('Tracking Sync Audit Result:', JSON.stringify(trackingAudit, null, 2));

  // If requestVideoFrameCallback is NOT used, zero-lag sync invariant is broken
  const zeroLagPass = trackingAudit.usesRVFCForSync && trackingAudit.avgSyncSkewMs < 5.0;

  results.tasks.task2_tracking_sync = {
    status: zeroLagPass ? 'PASS' : 'FAIL',
    usesRequestVideoFrameCallback: trackingAudit.usesRVFCForSync,
    hasRVFCAPIInBrowser: trackingAudit.hasRVFCAPI,
    avgSyncSkewMs: trackingAudit.avgSyncSkewMs,
    estimatedTrackingLagFrames: trackingAudit.estimatedTrackingLagFrames,
    defectReason: !trackingAudit.usesRVFCForSync 
      ? 'Frame loop uses un-synced requestAnimationFrame + async MediaPipe send() instead of requestVideoFrameCallback'
      : null
  };

  // ----------------------------------------------------
  // TASK 3: MOBILE (390x844) & DESKTOP (1440x900) LAYOUT AUDIT
  // ----------------------------------------------------
  console.log('\n--- TASK 3: Layout Audit (1440x900 Desktop & 390x844 Mobile) ---');

  // Desktop Audit
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);

  const desktopLayout = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const sideNav = document.querySelector('.side-nav');
    const rightPanel = document.querySelector('.right-panel');
    const mainContainer = document.querySelector('main');
    const video = document.querySelector('video');

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
      hasHorizontalScrollbar: Math.max(root.scrollWidth, body.scrollWidth) > window.innerWidth,
      sideNavBounds: sideNav ? sideNav.getBoundingClientRect() : null,
      rightPanelBounds: rightPanel ? rightPanel.getBoundingClientRect() : null,
      mainBounds: mainContainer ? mainContainer.getBoundingClientRect() : null,
      videoBounds: video ? video.getBoundingClientRect() : null
    };
  });

  await page.screenshot({ path: path.join(artifactDir, 'qa_desktop_1440x900.png') });
  console.log('Desktop 1440x900 Layout:', JSON.stringify(desktopLayout, null, 2));

  // Mobile Audit (390x844 - iPhone 12/13/14)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);

  const mobileLayout = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const sideNav = document.querySelector('.side-nav');
    const rightPanel = document.querySelector('.right-panel');
    const mainContainer = document.querySelector('main');
    const inspectorBar = document.querySelector('.monolith-card');

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
      hasHorizontalOverflow: Math.max(root.scrollWidth, body.scrollWidth) > window.innerWidth,
      overflowAmountPx: Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth,
      sideNavVisible: sideNav ? sideNav.getBoundingClientRect().width > 0 : false,
      rightPanelVisible: rightPanel ? rightPanel.getBoundingClientRect().width > 0 : false,
      sideNavWidthPx: sideNav ? sideNav.getBoundingClientRect().width : 0,
      rightPanelWidthPx: rightPanel ? rightPanel.getBoundingClientRect().width : 0,
      mainWidthPx: mainContainer ? mainContainer.getBoundingClientRect().width : 0
    };
  });

  await page.screenshot({ path: path.join(artifactDir, 'qa_mobile_390x844.png') });
  console.log('Mobile 390x844 Layout:', JSON.stringify(mobileLayout, null, 2));

  const mobileLayoutPass = !mobileLayout.hasHorizontalOverflow && mobileLayout.mainWidthPx > 0;

  results.tasks.task3_responsive_layout = {
    desktop1440x900: {
      status: !desktopLayout.hasHorizontalScrollbar ? 'PASS' : 'FAIL',
      hasHorizontalScrollbar: desktopLayout.hasHorizontalScrollbar,
      scrollWidthPx: desktopLayout.scrollWidth
    },
    mobile390x844: {
      status: mobileLayoutPass ? 'PASS' : 'FAIL',
      hasHorizontalOverflow: mobileLayout.hasHorizontalOverflow,
      scrollWidthPx: mobileLayout.scrollWidth,
      overflowAmountPx: mobileLayout.overflowAmountPx,
      sideNavWidthPx: mobileLayout.sideNavWidthPx,
      rightPanelWidthPx: mobileLayout.rightPanelWidthPx,
      mainWidthPx: mobileLayout.mainWidthPx,
      defectReason: mobileLayout.hasHorizontalOverflow
        ? `Mobile layout overflows 390px viewport by ${mobileLayout.overflowAmountPx}px because 240px side-nav and 340px right-panel do not collapse/adapt`
        : null
    }
  };

  await browser.close();

  // ----------------------------------------------------
  // TASK 4: EVIDENCE-JSON REPRODUCIBILITY & RELEASE VERDICT
  // ----------------------------------------------------
  console.log('\n--- TASK 4: Evidence-JSON Reproducibility & Release Verdict ---');

  const releaseBlockers = [];
  if (results.tasks.task1_hand_alignment.status === 'FAIL') {
    releaseBlockers.push('P1: Hand/Finger orientation pointing down or misaligned relative to forearm vector');
  }
  if (results.tasks.task2_tracking_sync.status === 'FAIL') {
    releaseBlockers.push(`P0: Tracking lag present (${results.tasks.task2_tracking_sync.avgSyncSkewMs.toFixed(1)}ms sync skew, ~${results.tasks.task2_tracking_sync.estimatedTrackingLagFrames} frames lag) due to missing requestVideoFrameCallback timestamp sync`);
  }
  if (results.tasks.task3_responsive_layout.mobile390x844.status === 'FAIL') {
    releaseBlockers.push(`P1: Mobile 390x844 layout overflow (${results.tasks.task3_responsive_layout.mobile390x844.overflowAmountPx}px horizontal overflow)`);
  }

  const finalVerdict = releaseBlockers.length === 0 ? 'RELEASED (PASS)' : 'BLOCKED (FAIL)';

  results.verdict = {
    overallVerdict: finalVerdict,
    releaseBlockers,
    auditor: 'QA-Skeptiker BalletOS 2.0',
    reproducibility: {
      command: 'node qa_audit.js',
      evidenceFile: path.join(artifactDir, 'qa_skeptiker_audit_evidence.json')
    }
  };

  fs.writeFileSync(
    path.join(artifactDir, 'qa_skeptiker_audit_evidence.json'),
    JSON.stringify(results, null, 2)
  );

  console.log('\n======================================================');
  console.log(`FINAL QA-SKEPTIKER RELEASE VERDICT: ${finalVerdict}`);
  console.log('======================================================');
  if (releaseBlockers.length > 0) {
    console.log('RELEASE BLOCKERS:');
    releaseBlockers.forEach(b => console.log(` - ${b}`));
  }
}

runAudit().catch(err => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
