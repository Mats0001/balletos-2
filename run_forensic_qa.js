import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mats/.gemini/antigravity/brain/76d12be0-4850-4706-b13e-25997dbe8530';
const SCRATCH_DIR = '/Users/mats/.gemini/antigravity/scratch/balletos-app';

if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

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

  console.log('--- STEP 1: Launch Chrome & Navigate to http://localhost:3000 ---');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Initial homepage screenshot
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_initial_load.png'), fullPage: true });

  // STEP 2: Tab Navigation Audit across all 5 tabs
  console.log('\n--- STEP 2: Navigating across ALL 5 tabs ---');
  const tabs = [
    { name: 'Studio Cam & Regie', selector: 'button:has-text("Saal-Kamera")' },
    { name: 'KI-Metaphern', selector: 'button:has-text("KI-Metaphern")' },
    { name: 'Video-Analyse', selector: 'button:has-text("Video-Analyse")' },
    { name: 'Schüler-Historie', selector: 'button:has-text("Schüler-Historie")' },
    { name: 'Remote-Handy', selector: 'button:has-text("Remote-Handy")' },
  ];

  const tabAuditResults = [];
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    console.log(`Clicking tab: ${tab.name}`);
    await page.click(tab.selector);
    await page.waitForTimeout(800);
    const screenshotName = `02_tab_${i + 1}_${tab.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.png`;
    await page.screenshot({ path: path.join(ARTIFACT_DIR, screenshotName), fullPage: true });
    tabAuditResults.push({ name: tab.name, screenshot: screenshotName, status: 'PASS' });
  }

  // STEP 3: Switch to Video-Analyse tab & Audit Video/Canvas DOM
  console.log('\n--- STEP 3: Video-Analyse DOM & Playback Inspection ---');
  await page.click('button:has-text("Video-Analyse")');
  await page.waitForTimeout(1000);

  // Force video play if paused
  await page.evaluate(() => {
    const vid = document.querySelector('video');
    if (vid && vid.paused) {
      vid.play().catch(() => {});
    }
  });
  await page.waitForTimeout(1000);

  const initialVideoDOM = await page.evaluate(async () => {
    const vid = document.querySelector('video');
    if (!vid) return null;
    const readyState = vid.readyState;
    const pausedStart = vid.paused;
    const currentTime1 = vid.currentTime;
    const videoWidth = vid.videoWidth;
    const videoHeight = vid.videoHeight;
    const currentSrc = vid.currentSrc || vid.src;

    await new Promise(r => setTimeout(r, 600));
    const currentTime2 = vid.currentTime;

    return {
      readyState,
      paused: vid.paused,
      currentTime1,
      currentTime2,
      isAdvancing: currentTime2 > currentTime1 || !vid.paused,
      videoWidth,
      videoHeight,
      currentSrc,
      error: vid.error ? { code: vid.error.code, message: vid.error.message } : null
    };
  });

  console.log('Video DOM initial state:', initialVideoDOM);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_video_analyse_playback.png'), fullPage: true });

  // STEP 4: Joint Interaction Verification in Vaganova Skeleton
  console.log('\n--- STEP 4: Vaganova Joint Interaction Verification ---');
  const jointsToTest = [
    {
      id: 'head_epaulement',
      name: 'Head & Épaulement',
      selector: 'svg circle[cx="960"][cy="220"]',
      expectedText: 'Kopf & Épaulement'
    },
    {
      id: 'port_de_bras_arms',
      name: 'Port de Bras Arms',
      selector: 'svg line[x1="820"][y1="360"]',
      expectedText: 'Port de Bras'
    },
    {
      id: 'pelvis_core',
      name: 'Pelvis & Core',
      selector: 'svg circle[cx="960"][cy="580"]',
      expectedText: 'Becken & Schwerpunkt'
    },
    {
      id: 'right_knee',
      name: 'Right Knee',
      selector: 'svg circle[cx="800"][cy="780"]',
      expectedText: 'Rechtes Knie'
    },
    {
      id: 'left_knee',
      name: 'Left Knee',
      selector: 'svg circle[cx="1000"][cy="780"]',
      expectedText: 'Linkes Knie'
    },
    {
      id: 'en_dehors_feet',
      name: 'Feet En Dehors',
      selector: 'svg line[x1="860"][y1="960"]',
      expectedText: 'Füße & En Dehors'
    }
  ];

  const jointResults = [];
  for (const joint of jointsToTest) {
    console.log(`Testing joint click: ${joint.id} (${joint.name})...`);

    let clickSuccess = false;
    try {
      // Use Playwright locator or dispatch MouseEvent
      clickSuccess = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) {
          const parentG = el.closest('g') || el;
          parentG.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          return true;
        }
        return false;
      }, joint.selector);
    } catch (e) {
      console.error(`  Click error: ${e.message}`);
    }

    await page.waitForTimeout(500);

    const inspectorContent = await page.evaluate(() => {
      return document.body.innerText;
    });

    const isHeadlineMatch = inspectorContent.includes(joint.expectedText);
    const jointScreenshot = `04_joint_${joint.id}.png`;
    await page.screenshot({ path: path.join(ARTIFACT_DIR, jointScreenshot), fullPage: true });

    console.log(`  Result for ${joint.id}: clickSuccess=${clickSuccess}, textMatch=${isHeadlineMatch}`);

    jointResults.push({
      jointId: joint.id,
      name: joint.name,
      clickSuccess,
      inspectorUpdated: isHeadlineMatch,
      screenshot: jointScreenshot,
      status: (clickSuccess && isHeadlineMatch) ? 'PASS' : 'FAIL'
    });
  }

  // STEP 5: Videomaterial Dropdown Audit
  console.log('\n--- STEP 5: Videomaterial Dropdown Audit ---');
  const selectElem = page.locator('select:has(option[value="v1"])');
  const videoDropdownOptions = [
    { id: 'v1', name: 'Saal-Aufnahme 1 (schoenewolf_ballet_cut.mp4)', expectedUrl: '/videos/schoenewolf_ballet_cut.mp4' },
    { id: 'v2', name: 'Saal-Aufnahme 2 (a_la_russe.mp4)', expectedUrl: '/videos/a_la_russe.mp4' },
    { id: 'v3', name: 'Saal-Aufnahme 3 (dutch_rehearsal.mp4)', expectedUrl: '/videos/dutch_rehearsal.mp4' },
    { id: 'v12', name: 'Schönewolf Ballettschule Premium Cut', expectedUrl: '/videos/schoenewolf_ballet_cut.mp4' },
    { id: 'v13', name: 'Á la Russe Ballet Repertoire', expectedUrl: '/videos/a_la_russe.mp4' },
    { id: 'v14', name: 'Dutch National Ballet Rehearsal', expectedUrl: '/videos/dutch_rehearsal.mp4' }
  ];

  const dropdownAuditResults = [];
  for (const opt of videoDropdownOptions) {
    console.log(`Selecting dropdown option ${opt.id}: ${opt.name}...`);
    await selectElem.selectOption(opt.id);

    await page.evaluate(() => {
      const vid = document.querySelector('video');
      if (vid && vid.paused) vid.play().catch(() => {});
    });
    await page.waitForTimeout(1200);

    const videoState = await page.evaluate(async () => {
      const vid = document.querySelector('video');
      if (!vid) return null;

      const readyState = vid.readyState;
      const videoWidth = vid.videoWidth;
      const videoHeight = vid.videoHeight;
      const t1 = vid.currentTime;
      await new Promise(r => setTimeout(r, 400));
      const t2 = vid.currentTime;

      return {
        currentSrc: vid.currentSrc,
        readyState,
        videoWidth,
        videoHeight,
        t1,
        t2,
        isAdvancing: t2 > t1 || !vid.paused,
        error: vid.error ? vid.error.message : null
      };
    });

    const screenshotName = `05_dropdown_${opt.id}.png`;
    await page.screenshot({ path: path.join(ARTIFACT_DIR, screenshotName), fullPage: true });

    const isPass = videoState && videoState.readyState >= 2 && videoState.videoWidth > 0 && !videoState.error;
    console.log(`  Option ${opt.id} result: readyState=${videoState?.readyState}, resolution=${videoState?.videoWidth}x${videoState?.videoHeight}, Status=${isPass ? 'PASS' : 'FAIL'}`);

    dropdownAuditResults.push({
      id: opt.id,
      name: opt.name,
      expectedUrl: opt.expectedUrl,
      actualSrc: videoState?.currentSrc,
      readyState: videoState?.readyState,
      resolution: `${videoState?.videoWidth}x${videoState?.videoHeight}`,
      isAdvancing: videoState?.isAdvancing,
      screenshot: screenshotName,
      status: isPass ? 'PASS' : 'FAIL'
    });
  }

  // STEP 6: Console Error & Uncaught Exception Audit
  console.log('\n--- STEP 6: Console & Exception Audit ---');
  console.log(`Console errors recorded: ${consoleErrors.length}`);
  console.log(`Uncaught exceptions recorded: ${uncaughtExceptions.length}`);

  // Final Verdict
  const allTabsPass = tabAuditResults.every(r => r.status === 'PASS');
  const allJointsPass = jointResults.every(r => r.status === 'PASS');
  const allDropdownPass = dropdownAuditResults.every(r => r.status === 'PASS');
  const noErrors = consoleErrors.length === 0 && uncaughtExceptions.length === 0;
  const initialVideoPass = initialVideoDOM && initialVideoDOM.readyState >= 2 && initialVideoDOM.videoWidth > 0;

  const overallVerdict = (allTabsPass && allJointsPass && allDropdownPass && noErrors && initialVideoPass) ? 'PASS' : 'FAIL';

  const report = {
    timestamp: new Date().toISOString(),
    overallVerdict,
    consoleErrorsCount: consoleErrors.length,
    uncaughtExceptionsCount: uncaughtExceptions.length,
    consoleErrors,
    uncaughtExceptions,
    tabs: tabAuditResults,
    initialVideoDOM,
    joints: jointResults,
    dropdownAudits: dropdownAuditResults
  };

  fs.writeFileSync(path.join(ARTIFACT_DIR, 'qa_forensic_report.json'), JSON.stringify(report, null, 2));

  console.log('\n==================================================');
  console.log(`FORENSIC QA AUDIT COMPLETED. VERDICT: ${overallVerdict}`);
  console.log('==================================================\n');

  await browser.close();
})();
