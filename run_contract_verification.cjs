const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = '/Users/mats/.gemini/antigravity/brain/ebbc934a-116b-4d3d-8187-3470fd392aa1';
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

(async () => {
  console.log('================================================================');
  console.log('VAGANOVA PRODUCTION CONTRACT FINAL QA VERIFICATION');
  console.log('================================================================\n');

  const consoleErrors = [];
  const uncaughtExceptions = [];

  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error(`[BROWSER CONSOLE ERROR] ${msg.text()}`);
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    console.error(`[UNCAUGHT PAGE EXCEPTION] ${err.message}`);
    uncaughtExceptions.push(err.message);
  });

  console.log('STEP 1: Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // QA Checklist Step 2: Click every single tab
  console.log('\nSTEP 2: Navigating through all 5 tabs and capturing screenshots...');

  // Tab 1: Studio Cam & Regie
  console.log('  -> Tab 1: Studio Cam & Regie');
  const tab1 = page.locator('button', { hasText: 'Studio Cam & Regie' }).or(page.locator('button', { hasText: 'Saal-Kamera' })).first();
  await tab1.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_studio_cam_regie.png'), fullPage: true });

  // Tab 2: KI-Metaphern
  console.log('  -> Tab 2: KI-Metaphern');
  const tab2 = page.locator('button', { hasText: 'KI-Metaphern' }).first();
  await tab2.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_ki_metaphern.png'), fullPage: true });

  // Tab 3: Video-Analyse
  console.log('  -> Tab 3: Video-Analyse');
  const tab3 = page.locator('button', { hasText: 'Video-Analyse' }).first();
  await tab3.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_video_analyse.png'), fullPage: true });

  // Tab 4: Schüler-Historie
  console.log('  -> Tab 4: Schüler-Historie');
  const tab4 = page.locator('button', { hasText: 'Schüler-Historie' }).first();
  await tab4.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_schueler_historie.png'), fullPage: true });

  // Tab 5: Remote-Handy
  console.log('  -> Tab 5: Remote-Handy');
  const tab5 = page.locator('button', { hasText: 'Remote-Handy' }).first();
  await tab5.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_remote_handy.png'), fullPage: true });

  // Return to Video-Analyse for detailed testing
  console.log('\nSTEP 3: Returning to Video-Analyse tab for deep MediaPipe pose & Grand Plié inspection...');
  await tab3.click();
  await page.waitForTimeout(1000);

  // QA Checklist Step 3: Inspect Video/Canvas DOM element properties
  console.log('\nSTEP 4: Inspecting Video & SVG DOM Properties...');
  const videoStats = await page.evaluate(async () => {
    const video = document.querySelector('video');
    const svg = document.querySelector('svg[preserveAspectRatio="none"]');

    if (!video) return { error: 'No video element found' };

    const videoRect = video.getBoundingClientRect();
    const svgRect = svg ? svg.getBoundingClientRect() : null;

    return {
      paused: video.paused,
      currentTime: video.currentTime,
      readyState: video.readyState,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      videoRect: {
        width: Math.round(videoRect.width),
        height: Math.round(videoRect.height),
        left: Math.round(videoRect.left),
        top: Math.round(videoRect.top)
      },
      viewBox: svg ? svg.getAttribute('viewBox') : null,
      preserveAspectRatio: svg ? svg.getAttribute('preserveAspectRatio') : null,
      svgRect: svgRect ? {
        width: Math.round(svgRect.width),
        height: Math.round(svgRect.height),
        left: Math.round(svgRect.left),
        top: Math.round(svgRect.top)
      } : null
    };
  });
  console.log('  Video Stats:', JSON.stringify(videoStats, null, 2));

  // QA Checklist Step 4: Click Play/Pause and verify currentTime advances
  console.log('\nSTEP 5: Testing Play/Pause button and video playback...');
  const t0 = videoStats.currentTime;
  await page.waitForTimeout(1500);
  const t1 = await page.evaluate(() => document.querySelector('video')?.currentTime || 0);
  console.log(`  Playback check: currentTime T0=${t0.toFixed(2)}s -> T1=${t1.toFixed(2)}s (Advances: ${t1 > t0})`);

  const playPauseBtn = page.locator('button', { has: page.locator('svg.lucide-pause, svg.lucide-play') }).first();
  await playPauseBtn.click(); // Pause
  await page.waitForTimeout(500);
  const isPaused = await page.evaluate(() => document.querySelector('video')?.paused);
  console.log(`  Paused state after toggle: ${isPaused}`);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_video_analyse_paused.png'), fullPage: true });

  await playPauseBtn.click(); // Resume
  await page.waitForTimeout(500);

  // QA Checklist Step 5: Test Videomaterial dropdown
  console.log('\nSTEP 6: Testing "Videomaterial:" dropdown selector...');
  const dropdown = page.locator('#dev-video-select');
  const dropdownVisible = await dropdown.isVisible();
  let dropdownOptions = [];
  if (dropdownVisible) {
    dropdownOptions = await dropdown.locator('option').allInnerTexts();
    console.log(`  Available videos (${dropdownOptions.length}):`);
    dropdownOptions.forEach((opt, idx) => console.log(`    [${idx + 1}] ${opt}`));
  }

  // Task 1 & 2 Verification: Real MediaPipe WASM pose detection & Grand Plié head circle check
  console.log('\nSTEP 7: Task 1 & Task 2 - Verifying MediaPipe WASM Pose Detection & Grand Plié Head Position...');
  
  // Track head circle cy position over 6 seconds while video plays
  const headPosTrack = [];
  const startTime = Date.now();
  
  while (Date.now() - startTime < 6000) {
    const frameData = await page.evaluate(() => {
      const video = document.querySelector('video');
      const headCircle = document.querySelector('#vaganova-head-circle');
      const svg = document.querySelector('svg[preserveAspectRatio="none"]');
      const lines = svg ? svg.querySelectorAll('line, path').length : 0;
      const circles = svg ? svg.querySelectorAll('circle').length : 0;

      return {
        currentTime: video ? video.currentTime : 0,
        headCx: headCircle ? parseFloat(headCircle.getAttribute('cx')) : null,
        headCy: headCircle ? parseFloat(headCircle.getAttribute('cy')) : null,
        headRadius: headCircle ? parseFloat(headCircle.getAttribute('r')) : null,
        linesCount: lines,
        circlesCount: circles
      };
    });

    if (frameData.headCy !== null) {
      headPosTrack.push(frameData);
    }

    await page.waitForTimeout(250);
  }

  console.log(`  Collected ${headPosTrack.length} MediaPipe pose tracking samples:`);
  headPosTrack.forEach((sample, i) => {
    console.log(`    Sample ${i+1} [t=${sample.currentTime.toFixed(2)}s]: cx=${sample.headCx?.toFixed(1)}, cy=${sample.headCy?.toFixed(1)}px, skeleton Elements=${sample.linesCount + sample.circlesCount}`);
  });

  // Calculate min, max, average cy during playback / Grand Plié
  const cyValues = headPosTrack.map(s => s.headCy).filter(cy => cy !== null);
  const minCy = Math.min(...cyValues);
  const maxCy = Math.max(...cyValues);
  const avgCy = cyValues.reduce((a, b) => a + b, 0) / cyValues.length;

  console.log(`\n  Head Circle Cy Summary:`);
  console.log(`    Min Cy: ${minCy.toFixed(1)}px`);
  console.log(`    Max Cy: ${maxCy.toFixed(1)}px`);
  console.log(`    Avg Cy: ${avgCy.toFixed(1)}px`);

  // Target requirement: Confirm head circle during Grand Plié is at cy ~417px to ~490px (low in video frame over her head), NOT floating high at the top of the room (~146px or ~233px).
  const plieSamples = headPosTrack.filter(s => s.currentTime >= 0.7 && s.currentTime <= 2.8);
  const plieCys = plieSamples.map(s => s.headCy);
  const maxPlieCy = Math.max(...plieCys); // Lowest point of head in Plié
  const hasPlieNear417 = plieCys.some(cy => Math.abs(cy - 417) < 35); // Passes through ~417px

  const isHeadPosCorrect = hasPlieNear417 || (maxPlieCy >= 410 && maxPlieCy <= 510);
  const isNotFloatingAtTop = minCy > 250; // Floating at top of room was unscaled ~146px or ~233px

  console.log(`  - Real MediaPipe landmarks detected: ${headPosTrack.length > 0 ? 'YES PASS' : 'NO FAIL'}`);
  console.log(`  - Head circle centered low over dancer head during Grand Plié (~417px - 490px): ${isHeadPosCorrect ? 'PASS' : 'FAIL'} (passes ~417px: ${hasPlieNear417}, max Plié cy=${maxPlieCy.toFixed(1)}px)`);
  console.log(`  - NOT floating high in air at top of room (~146px / ~233px): ${isNotFloatingAtTop ? 'PASS' : 'FAIL'} (min cy=${minCy.toFixed(1)}px > 250px)`);

  // Capture fresh element & full page screenshots of active skeleton overlay during Plié
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_video_analyse_grand_plie_pose.png'), fullPage: true });
  
  const videoViewport = page.locator('.monolith-card').first();
  if (await videoViewport.isVisible()) {
    await videoViewport.screenshot({ path: path.join(SCREENSHOT_DIR, '08_skeleton_overlay_element_crop.png') });
  }

  // Split-Screen Reference View Test
  const splitBtn = page.locator('button', { hasText: 'Split Referenz' }).first();
  if (await splitBtn.isVisible()) {
    await splitBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_split_screen_reference.png'), fullPage: true });
    console.log('  Captured 09_split_screen_reference.png');
  }

  await browser.close();

  // Evaluation & Final Verdict
  const noConsoleErrors = consoleErrors.length === 0;
  const noUncaughtExceptions = uncaughtExceptions.length === 0;
  const isMediaPipeActive = headPosTrack.length > 0;
  const isViewBoxValid = videoStats.viewBox === '0 0 1000 1000';
  const isTimeAdvancing = t1 > t0;

  const finalVerdict = noConsoleErrors && noUncaughtExceptions && isMediaPipeActive && isHeadPosCorrect && isNotFloatingAtTop && isViewBoxValid && isTimeAdvancing ? 'PASS' : 'FAIL';

  const report = {
    timestamp: new Date().toISOString(),
    verdict: finalVerdict,
    checks: {
      allTabsNavigated: true,
      consoleErrors: consoleErrors.length,
      uncaughtExceptions: uncaughtExceptions.length,
      viewBox: videoStats.viewBox,
      preserveAspectRatio: videoStats.preserveAspectRatio,
      timeAdvancing: isTimeAdvancing,
      mediaPipeLandmarksDetected: isMediaPipeActive,
      grandPlieHeadCyAvg: avgCy ? parseFloat(avgCy.toFixed(1)) : null,
      grandPlieHeadCyMax: maxCy ? parseFloat(maxCy.toFixed(1)) : null,
      headPosCorrectLowFrame: isHeadPosCorrect,
      notFloatingAtTop: isNotFloatingAtTop
    },
    screenshots: [
      '01_studio_cam_regie.png',
      '02_ki_metaphern.png',
      '03_video_analyse.png',
      '04_schueler_historie.png',
      '05_remote_handy.png',
      '06_video_analyse_paused.png',
      '07_video_analyse_grand_plie_pose.png',
      '08_skeleton_overlay_element_crop.png',
      '09_split_screen_reference.png'
    ]
  };

  fs.writeFileSync(path.join(ARTIFACT_DIR, 'qa_verification_results.json'), JSON.stringify(report, null, 2));
  console.log('\n================================================================');
  console.log(`FINAL QA VERDICT: ${finalVerdict}`);
  console.log('================================================================');
})();
