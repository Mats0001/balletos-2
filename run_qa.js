import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const screenshotsDir = '/Users/mats/.gemini/antigravity/brain/7aabd0a2-0b4d-4e3e-9e39-1a12c512b33e/screenshots';
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

(async () => {
  const consoleLogs = [];
  const uncaughtErrors = [];

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', error => {
    uncaughtErrors.push(error.toString());
  });

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 1. Studio Cam & Regie (Saal-Kamera)
  console.log('Testing Tab 1: Saal-Kamera / Studio Cam & Regie...');
  await page.screenshot({ path: path.join(screenshotsDir, '01_studio_cam.png'), fullPage: true });

  // 2. KI-Metaphern
  console.log('Testing Tab 2: KI-Metaphern...');
  await page.click('button:has-text("KI-Metaphern")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screenshotsDir, '02_ki_metaphern.png'), fullPage: true });

  // 3. Video-Analyse
  console.log('Testing Tab 3: Video-Analyse...');
  await page.click('button:has-text("Video-Analyse")');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotsDir, '03_video_analyse.png'), fullPage: true });

  // Inspect Video Element Properties
  const videoStatsBefore = await page.evaluate(() => {
    const v = document.querySelector('video');
    if (!v) return null;
    return {
      paused: v.paused,
      currentTime: v.currentTime,
      readyState: v.readyState,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      src: v.src
    };
  });
  console.log('Video stats before action:', JSON.stringify(videoStatsBefore, null, 2));

  // Inspect Skeleton DOM
  const skeletonInfo = await page.evaluate(() => {
    const svg = document.querySelector('svg');
    const headCircle = document.querySelector('#vaganova-head-circle');
    const hudElements = Array.from(document.querySelectorAll('div')).filter(d => d.textContent.includes('VALGUS') || d.textContent.includes('EN DEHOURS'));
    return {
      hasSvg: !!svg,
      hasHeadCircle: !!headCircle,
      hudCount: hudElements.length,
      hudTexts: hudElements.map(e => e.textContent.trim())
    };
  });
  console.log('Skeleton DOM info:', JSON.stringify(skeletonInfo, null, 2));

  // Test Play/Pause
  console.log('Testing Play/Pause toggle...');
  const playButton = await page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: '' }).nth(3); // or finding by SVG / button action
  // Alternatively click the video timeline play/pause button
  const time1 = await page.evaluate(() => document.querySelector('video')?.currentTime);
  await page.waitForTimeout(1000);
  const time2 = await page.evaluate(() => document.querySelector('video')?.currentTime);
  console.log(`Video currentTime progression check: T1=${time1}, T2=${time2}`);

  // Test Video Select Dropdown
  console.log('Testing Video Selector Dropdown...');
  const dropdown = page.locator('#dev-video-select');
  const options = await dropdown.locator('option').allInnerTexts();
  console.log(`Available video options count: ${options.length}`);
  if (options.length > 1) {
    const secondOptionVal = await dropdown.locator('option').nth(1).getAttribute('value');
    await dropdown.selectOption(secondOptionVal);
    await page.waitForTimeout(1000);
    const newSrc = await page.evaluate(() => document.querySelector('video')?.src);
    console.log('New video src after selection:', newSrc);
  }
  await page.screenshot({ path: path.join(screenshotsDir, '06_video_analyse_select_video.png'), fullPage: true });

  // 4. Schüler-Historie
  console.log('Testing Tab 4: Schüler-Historie...');
  await page.click('button:has-text("Schüler-Historie")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screenshotsDir, '04_schueler_historie.png'), fullPage: true });

  // 5. Remote-Handy
  console.log('Testing Tab 5: Remote-Handy...');
  await page.click('button:has-text("Remote-Handy")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screenshotsDir, '05_remote_handy.png'), fullPage: true });

  await page.click('button:has-text("Video-Analyse")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(screenshotsDir, '07_video_analyse_skeleton_detail.png'), fullPage: true });

  await browser.close();

  const reportData = {
    consoleLogs,
    uncaughtErrors,
    videoStatsBefore,
    skeletonInfo,
    optionsCount: options.length,
    t1: time1,
    t2: time2
  };

  fs.writeFileSync(
    path.join(screenshotsDir, '../qa_results.json'),
    JSON.stringify(reportData, null, 2)
  );

  console.log('QA script executed successfully!');
})();
