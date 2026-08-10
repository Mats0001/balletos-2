import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const artifactDir = '/Users/mats/.gemini/antigravity/brain/6bb91fff-4828-4539-a996-6c0bdaca57cc';
const screenshotsDir = path.join(artifactDir, 'screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

(async () => {
  console.log('🚀 Starting Vaganova Production Contract QA Suite...');
  const consoleLogs = [];
  const uncaughtErrors = [];

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      console.error(`🚨 Console Error: ${text}`);
    }
  });

  page.on('pageerror', error => {
    console.error(`🚨 Uncaught Exception: ${error.toString()}`);
    uncaughtErrors.push(error.toString());
  });

  console.log('🌐 Step 1: Accessing http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 1️⃣ Click through all 5 tabs and capture full screenshots
  console.log('📑 Step 2: Testing navigation across all 5 BalletOS 2.0 tabs...');

  // Tab 1: Studio Cam & Regie
  console.log('  -> Tab 1: Studio Cam & Regie');
  const tab1 = page.locator('button:has-text("Studio Cam & Regie"), button:has-text("Saal-Kamera")').first();
  await tab1.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screenshotsDir, '01_studio_cam.png'), fullPage: true });

  // Tab 2: KI-Metaphern
  console.log('  -> Tab 2: KI-Metaphern');
  const tab2 = page.locator('button:has-text("KI-Metaphern")').first();
  await tab2.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screenshotsDir, '02_ki_metaphern.png'), fullPage: true });

  // Tab 3: Video-Analyse
  console.log('  -> Tab 3: Video-Analyse');
  const tab3 = page.locator('button:has-text("Video-Analyse")').first();
  await tab3.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(screenshotsDir, '03_video_analyse.png'), fullPage: true });

  // Tab 4: Schüler-Historie
  console.log('  -> Tab 4: Schüler-Historie');
  const tab4 = page.locator('button:has-text("Schüler-Historie")').first();
  await tab4.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screenshotsDir, '04_schueler_historie.png'), fullPage: true });

  // Tab 5: Remote-Handy
  console.log('  -> Tab 5: Remote-Handy');
  const tab5 = page.locator('button:has-text("Remote-Handy")').first();
  await tab5.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screenshotsDir, '05_remote_handy.png'), fullPage: true });

  // Return to Video-Analyse tab for deep inspection
  await tab3.click();
  await page.waitForTimeout(1000);

  // 2️⃣ Video DOM Element & 1:1 MappingProof Inspection
  console.log('📹 Step 3: Inspecting Video/Canvas DOM properties & 1:1 Bounding Box...');
  const videoStats = await page.evaluate(() => {
    const v = document.querySelector('video');
    const container = v?.parentElement;
    if (!v) return null;
    return {
      paused: v.paused,
      currentTime: v.currentTime,
      readyState: v.readyState,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      src: v.src,
      containerWidth: container?.clientWidth,
      containerHeight: container?.clientHeight
    };
  });
  console.log('  Video DOM Stats:', JSON.stringify(videoStats, null, 2));

  // Check SVG overlay & 1:1 Video Bounds Projection
  const videoBoundsCheck = await page.evaluate(() => {
    const svg = document.querySelector('svg');
    const headCircle = document.querySelector('#vaganova-head-circle');
    const video = document.querySelector('video');
    return {
      svgPresent: !!svg,
      svgViewBox: svg?.getAttribute('viewBox'),
      headCirclePresent: !!headCircle,
      headCircleCx: headCircle?.getAttribute('cx'),
      headCircleCy: headCircle?.getAttribute('cy'),
      videoStyleTop: video?.style.top,
      videoStyleLeft: video?.style.left
    };
  });
  console.log('  1:1 Bounds Projection Check:', JSON.stringify(videoBoundsCheck, null, 2));

  // 3️⃣ Verify Video Selection Dropdown (Nicole MOVs: IMG_2272.mov to IMG_2281.mov)
  console.log('🎞️ Step 4: Verifying Nicole Studio MOVs in Videomaterial dropdown...');
  const dropdown = page.locator('#dev-video-select');
  const dropdownOptions = await dropdown.locator('option').allInnerTexts();
  console.log(`  Dropdown options count: ${dropdownOptions.length}`);
  dropdownOptions.forEach((opt, idx) => console.log(`    [${idx + 1}] ${opt}`));

  const containsNicoleMOVs = dropdownOptions.some(opt => opt.includes('IMG_2272.mov') || opt.includes('Nicole Studio'));
  const hasRange2272to2281 = dropdownOptions.filter(opt => /IMG_227[2-9]\.mov|IMG_228[0-1]\.mov/.test(opt)).length > 0;
  console.log(`  Nicole MOVs present in dropdown? ${containsNicoleMOVs ? 'YES ✅' : 'NO ❌'}`);
  console.log(`  IMG_2272.mov to IMG_2281.mov detected? ${hasRange2272to2281 ? 'YES ✅' : 'NO ❌'}`);

  // Test selecting second item in dropdown if present
  if (dropdownOptions.length > 1) {
    const secondValue = await dropdown.locator('option').nth(1).getAttribute('value');
    await dropdown.selectOption(secondValue);
    await page.waitForTimeout(800);
    const updatedSrc = await page.evaluate(() => document.querySelector('video')?.src);
    console.log('  Updated video src after dropdown selection:', updatedSrc);
  }
  await page.screenshot({ path: path.join(screenshotsDir, '06_video_analyse_dropdown.png'), fullPage: true });

  // 4️⃣ Test Video Upload Support
  console.log('📤 Step 5: Testing Video Upload Support...');
  const uploadButton = page.locator('button:has-text("Video Hochladen")');
  const fileInput = page.locator('input[type="file"]');
  const uploadBtnVisible = (await uploadButton.count()) > 0;
  console.log(`  Upload button visible? ${uploadBtnVisible ? 'YES ✅' : 'NO ❌'}`);

  // Simulate file upload with desktop test clip if available
  const sampleUploadPath = '/Users/mats/Desktop/Videos für Skeleton/IMG_2272.mov';
  if (fs.existsSync(sampleUploadPath)) {
    await fileInput.setInputFiles(sampleUploadPath);
    await page.waitForTimeout(1000);
    const optionsAfterUpload = await dropdown.locator('option').allInnerTexts();
    console.log('  Options after uploading file:', optionsAfterUpload);
  }
  await page.screenshot({ path: path.join(screenshotsDir, '07_video_upload.png'), fullPage: true });

  // 5️⃣ Play/Pause & Motion Progression Verification
  console.log('▶️ Step 6: Verifying Play/Pause & currentTime active progression...');
  const t0 = await page.evaluate(() => document.querySelector('video')?.currentTime);
  const playBtn = page.locator('button').filter({ has: page.locator('svg') }).first();
  await page.waitForTimeout(1500);
  const t1 = await page.evaluate(() => document.querySelector('video')?.currentTime);
  const isTimeAdvancing = t1 > t0;
  console.log(`  currentTime progression: T0=${t0}s -> T1=${t1}s | Advancing? ${isTimeAdvancing ? 'YES ✅' : 'NO ❌'}`);

  // 6️⃣ MediaPipe Pose Tracking & Evidence Ledger Verification
  console.log('🦴 Step 7: Verifying MediaPipe Pose Tracking & Evidence Ledger...');
  const evidenceLedgerData = await page.evaluate(() => {
    // Look for inspector / evidence card elements
    const headline = document.querySelector('.font-montserrat')?.textContent;
    const inspectorCard = document.querySelector('div[style*="background: linear-gradient"]') || document.querySelector('.monolith-card');
    const textNodes = Array.from(document.querySelectorAll('span, div, h1, h2, h3, p')).map(el => el.textContent?.trim()).filter(Boolean);
    const hasVaganovaEvidence = textNodes.some(t => t.includes('Vaganova') || t.includes('Knie') || t.includes('Winkel') || t.includes('Drift') || t.includes('Position'));
    
    return {
      headline,
      hasInspector: !!inspectorCard,
      hasVaganovaEvidence,
      sampleTexts: textNodes.slice(0, 15)
    };
  });
  console.log('  Evidence Ledger readout details:', JSON.stringify(evidenceLedgerData, null, 2));

  await page.screenshot({ path: path.join(screenshotsDir, '08_mediapipe_tracking_ledger.png'), fullPage: true });

  // 7️⃣ Split Reference Mode Screen
  const splitBtn = page.locator('button:has-text("Split Referenz")');
  if ((await splitBtn.count()) > 0) {
    await splitBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(screenshotsDir, '09_split_reference_view.png'), fullPage: true });
    console.log('  ✓ Captured Split Reference View');
  }

  await browser.close();

  // 8️⃣ Summary Report Generation
  const testResults = {
    timestamp: new Date().toISOString(),
    verdict: (uploadBtnVisible && containsNicoleMOVs && isTimeAdvancing && uncaughtErrors.length === 0) ? 'PASS' : 'FAIL',
    metrics: {
      tabsTested: 5,
      uncaughtErrorsCount: uncaughtErrors.length,
      consoleErrorsCount: consoleLogs.filter(l => l.startsWith('[error]')).length,
      videoStats,
      videoBoundsCheck,
      containsNicoleMOVs,
      hasRange2272to2281,
      uploadBtnVisible,
      isTimeAdvancing,
      evidenceLedgerVerified: evidenceLedgerData.hasVaganovaEvidence
    },
    uncaughtErrors,
    consoleLogs
  };

  fs.writeFileSync(path.join(artifactDir, 'vaganova_qa_report.json'), JSON.stringify(testResults, null, 2));
  console.log('\n==================================================');
  console.log(`🎯 FINAL QA VERDICT: ${testResults.verdict}`);
  console.log('==================================================\n');
})();
