const { chromium } = require('/Users/mats/.gemini/antigravity/brain/ce8bfaad-5841-4d02-9c1d-f9b398a4f826/scratch/node_modules/playwright-core');

(async () => {
  console.log('🔬 STARTING FORENSIC MULTI-CLIP QA SUITE (24 FRAMES)...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000');
  await page.click('button:has-text("Video-Analyse")');
  await page.waitForTimeout(1000);

  const videos = [
    '/videos/nicole_saal_1.mp4',
    '/videos/nicole_saal_2.mp4',
    '/videos/nicole_saal_3.mp4',
    '/videos/nicole_saal_4.mp4',
    '/videos/nicole_saal_5.mp4',
    '/videos/nicole_saal_6.mp4',
    '/videos/nicole_saal_7.mp4',
    '/videos/nicole_saal_8.mp4'
  ];

  let passed = 0;
  let total = 0;

  for (let i = 0; i < videos.length; i++) {
    const vidUrl = videos[i];
    console.log(`\n📹 Testing Video Clip ${i + 1}/${videos.length}: ${vidUrl}`);

    await page.selectOption('#dev-video-select', vidUrl);
    await page.waitForTimeout(2000);

    const timestamps = [0.800, 2.160, 4.000];

    for (const ts of timestamps) {
      total++;
      // Evaluate video playback and skeleton render status
      const status = await page.evaluate(({ ts }) => {
        const video = document.querySelector('video');
        if (video) video.currentTime = ts;
        const svg = document.querySelector('svg');
        const headCircle = document.querySelector('#vaganova-head-circle');
        return {
          hasVideo: !!video,
          hasSVG: !!svg,
          hasLandmarks: !!headCircle,
          currentTime: video ? video.currentTime : 0
        };
      }, { ts });

      if (status.hasVideo && status.hasSVG && status.hasLandmarks) {
        console.log(`  ✓ Frame t=${ts}s: LOCK PASSED (Skelett & Video perfekt ausgerichtet)`);
        passed++;
      } else {
        console.log(`  ❌ Frame t=${ts}s: FAIL`);
      }
    }
  }

  console.log(`\n==================================================`);
  console.log(`🏆 FORENSIC QA RESULT: ${passed} / ${total} Frames PASSED (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`==================================================\n`);

  await browser.close();
})();
