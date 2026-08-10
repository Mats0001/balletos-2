import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mats/.gemini/antigravity/brain/47f6ed25-3a4c-40d1-a44d-2f926c3dc32c';
const SCRATCH_DIR = '/Users/mats/.gemini/antigravity/scratch/balletos-app';

(async () => {
  const consoleErrors = [];
  const uncaughtExceptions = [];

  const browser = await chromium.launch({
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error(`[Console Error] ${msg.text()}`);
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    console.error(`[Uncaught Exception] ${err.message}`);
    uncaughtExceptions.push(err.message);
  });

  console.log('Navigating to http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 1. Tab Walkthrough
  const tabs = [
    { name: 'Studio Cam & Regie', selector: 'button:has-text("Saal-Kamera")' },
    { name: 'KI-Metaphern', selector: 'button:has-text("KI-Metaphern")' },
    { name: 'Video-Analyse', selector: 'button:has-text("Video-Analyse")' },
    { name: 'Schüler-Historie', selector: 'button:has-text("Schüler-Historie")' },
    { name: 'Remote-Handy', selector: 'button:has-text("Remote-Handy")' },
  ];

  console.log('--- Phase 1: Tab Navigation Audit ---');
  const tabResults = [];
  for (const tab of tabs) {
    console.log(`Clicking tab: ${tab.name}`);
    await page.click(tab.selector);
    await page.waitForTimeout(800);
    tabResults.push({ name: tab.name, status: 'OK' });
  }

  // 2. Video-Analyse Tab Exhaustive 14-Video Audit
  console.log('\n--- Phase 2: Exhaustive 14-Video Audit in Video-Analyse ---');
  await page.click('button:has-text("Video-Analyse")');
  await page.waitForTimeout(1000);

  const videoOptions = [
    { id: 'v1', label: '🎬 Saal-Aufnahme 1 (IMG_2274.mov)' },
    { id: 'v2', label: '🎬 Saal-Aufnahme 2 (IMG_2275.mov)' },
    { id: 'v3', label: '🎬 Saal-Aufnahme 3 (IMG_2276.mov)' },
    { id: 'v4', label: '🎬 Saal-Aufnahme 4 (IMG_2277.mov)' },
    { id: 'v5', label: '🎬 Saal-Aufnahme 5 (IMG_2279.mov)' },
    { id: 'v6', label: '🎬 Saal-Aufnahme 6 (IMG_2280.mov)' },
    { id: 'v7', label: '🎬 Saal-Aufnahme 7 (IMG_2281.mov)' },
    { id: 'v8', label: '🎥 Studio Output 1 (video-output-2E99...mov)' },
    { id: 'v9', label: '🎥 Studio Output 2 (video-output-A774...mov)' },
    { id: 'v10', label: '🎥 Studio Output 3 (video-output-B095...mov)' },
    { id: 'v11', label: '🎥 Studio Output 4 (video-output-BCF9...mov)' },
    { id: 'v12', label: '🩰 Schönewolf Ballettschule Premium Cut' },
    { id: 'v13', label: '🩰 Á la Russe Ballet Repertoire' },
    { id: 'v14', label: '🩰 Dutch National Ballet Rehearsal' }
  ];

  // Precise locator for Videomaterial dropdown (to avoid selecting Navbar student select)
  const selectElem = page.locator('select:has(option[value="v1"])');
  const videoAuditResults = [];

  for (const v of videoOptions) {
    console.log(`\nTesting video option ${v.id}: ${v.label} ...`);

    // Select dropdown item
    await selectElem.selectOption(v.id);

    // Force play if needed & wait 1.5 seconds
    await page.evaluate(() => {
      const vid = document.querySelector('video');
      if (vid && vid.paused) {
        vid.play().catch(() => {});
      }
    });

    await page.waitForTimeout(1500);

    // Evaluate DOM video element state
    const domState = await page.evaluate(async () => {
      const vid = document.querySelector('video');
      if (!vid) return null;

      const readyState = vid.readyState;
      const currentTimeStart = vid.currentTime;
      const pausedStart = vid.paused;
      const videoWidth = vid.videoWidth;
      const videoHeight = vid.videoHeight;
      const error = vid.error ? { code: vid.error.code, message: vid.error.message } : null;

      // Small delay to check if currentTime advances
      await new Promise(r => setTimeout(r, 500));
      const currentTimeEnd = vid.currentTime;
      const pausedEnd = vid.paused;

      return {
        readyState,
        currentTimeStart,
        currentTimeEnd,
        isAdvancing: currentTimeEnd > currentTimeStart || (!pausedEnd && currentTimeStart >= 0),
        paused: pausedEnd,
        videoWidth,
        videoHeight,
        error,
        currentSrc: vid.currentSrc || vid.src
      };
    });

    // Test Play/Pause toggle
    const stateBeforeToggle = await page.evaluate(() => {
      const vid = document.querySelector('video');
      return vid ? vid.paused : null;
    });

    await page.evaluate(() => {
      const vid = document.querySelector('video');
      if (vid) {
        if (vid.paused) vid.play().catch(() => {});
        else vid.pause();
      }
    });
    await page.waitForTimeout(300);

    const stateAfterToggle = await page.evaluate(() => {
      const vid = document.querySelector('video');
      return vid ? vid.paused : null;
    });

    // Resume play state
    await page.evaluate(() => {
      const vid = document.querySelector('video');
      if (vid && vid.paused) vid.play().catch(() => {});
    });
    await page.waitForTimeout(300);

    const playPauseSuccess = (stateBeforeToggle !== stateAfterToggle);

    // Save screenshots to both artifact dir and scratch dir as required
    const filename = `screenshot_${v.id}.png`;
    const artifactPath = path.join(ARTIFACT_DIR, filename);
    const scratchPath = path.join(SCRATCH_DIR, filename);

    await page.screenshot({ path: artifactPath, fullPage: true });
    fs.copyFileSync(artifactPath, scratchPath);

    console.log(`Saved screenshot: ${filename}`);
    console.log(`DOM State for ${v.id}:`, domState);

    const isPass = domState && 
                   domState.readyState >= 2 && 
                   domState.videoWidth > 0 && 
                   domState.videoHeight > 0 && 
                   !domState.error;

    videoAuditResults.push({
      id: v.id,
      label: v.label,
      domState,
      playPauseSuccess,
      screenshot: filename,
      status: isPass ? 'PASS' : 'FAIL'
    });
  }

  // Summary Evaluation
  const totalVideos = videoAuditResults.length;
  const passedVideos = videoAuditResults.filter(r => r.status === 'PASS').length;
  const failedVideos = totalVideos - passedVideos;

  const isOverallPass = failedVideos === 0 && consoleErrors.length === 0 && uncaughtExceptions.length === 0;

  const qaReport = {
    timestamp: new Date().toISOString(),
    overallVerdict: isOverallPass ? 'PASS' : 'FAIL',
    consoleErrorsCount: consoleErrors.length,
    uncaughtExceptionsCount: uncaughtExceptions.length,
    consoleErrors,
    uncaughtExceptions,
    tabsTested: tabResults,
    videosSummary: {
      total: totalVideos,
      passed: passedVideos,
      failed: failedVideos
    },
    videos: videoAuditResults
  };

  console.log('\n==================================================');
  console.log('EXHAUSTIVE QA AUDIT COMPLETE');
  console.log(`Overall Verdict: ${qaReport.overallVerdict}`);
  console.log(`Console Errors: ${qaReport.consoleErrorsCount}`);
  console.log(`Uncaught Exceptions: ${qaReport.uncaughtExceptionsCount}`);
  console.log(`Passed Videos: ${passedVideos}/${totalVideos}`);
  console.log('==================================================\n');

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'qa_audit_report.json'),
    JSON.stringify(qaReport, null, 2)
  );

  await browser.close();
})();
