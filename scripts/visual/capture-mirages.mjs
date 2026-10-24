// Run through ego-browser nodejs with a caller-owned TaskSpace.
export async function captureMirages({ task, root, rinOrigin, referenceOrigin }) {
  const fs = await import('node:fs/promises');
  const pages = [
    ...['home','category','post','page','archives','tags','tag','search','not-found'].map(name=>['reference-complete', name, `${referenceOrigin}/?kind=${name}`]),
    ...[['home','/'],['category','/category/tech'],['post','/feed/1'],['page','/page/about'],['archives','/timeline'],['tags','/hashtags'],['tag','/hashtag/迁移'],['search','/search/迁移'],['not-found','/rin-visual-check-missing'],['links','/page/demo-links'],['music','/page/demo-music'],['wide','/page/demo-wide'],['portfolio','/page/demo-portfolio'],['gallery','/page/demo-gallery'],['page-timeline','/page/demo-timeline'],['resume','/page/demo-resume'],['docs','/page/demo-docs'],['friends','/friends'],['moments','/moments']].map(([name,path])=>['rin-complete',name,path]),
  ];
  const records = [];

  const desktopUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const mobileUA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  for (const [site, name, address] of pages) {
    const original = site === 'reference-complete';
    const page = task.page(original ? 'p1' : 'p2');
    await fs.mkdir(`${root}/${site}`, { recursive: true });
    for (const [device, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
      await page.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: device === 'mobile' });
      await page.cdp('Emulation.setUserAgentOverride', { userAgent: device === 'mobile' ? mobileUA : desktopUA });
      const url = original ? address : `${rinOrigin}${address}`;
      await page.goto(original ? `${url}&device=${device}` : url, { waitUntil: 'domcontentloaded', timeout: 12000 });
      await page.waitForFunction((original) => original ? Boolean(document.querySelector('#body')) : Boolean(document.querySelector('.mirages-content main, .mirages-content .ani-show')), original, { timeout: 12000 });
      await page.evaluate(async () => {
        await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]);
        const style = document.createElement('style');
        style.textContent = 'html > :not(head):not(body),#kiss-translator-fab,#kiss-translator-box,#kiss-touch-status,plasmo-csui,button[aria-label="翻译"]{display:none!important}*,*::before,*::after{transition:none!important}';
        document.head.append(style);
      });
      for (const mode of ['light', 'dark']) {
        await page.cdp('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-color-scheme', value: mode }] });
        await page.evaluate(({ original, mode }) => {
          if (original) {
            document.body.classList.remove('theme-white', 'theme-dark', 'dark-mode', 'os-dark-mode');
            document.body.classList.add(mode === 'dark' ? 'theme-dark' : 'theme-white');
            if (window.LocalConst) { window.LocalConst.USE_MIRAGES_DARK = mode === 'dark'; window.LocalConst.PREFERS_DARK_MODE = mode === 'dark'; }
          } else {
            document.querySelector(`button[aria-label="Toggle ${mode} mode"]`)?.click();
            document.documentElement.dataset.colorMode = mode;
            window.dispatchEvent(new Event('colorSchemeChange'));
          }
        }, { original, mode });
        await page.evaluate(async () => { for (const a of document.getAnimations()) { try { a.finish(); } catch {} } await new Promise(r => requestAnimationFrame(()=>requestAnimationFrame(r))); });
        const metrics = await page.evaluate((original) => {
          const selectors = original ? ['#navbar', '#masthead', '.blog-title', '#index', '#archive', '#post', '.post-card', '.post-content', '.post-content h2', '.post-content p', '#comments', '#footer'] : ['.mirages-root .z-40', '.mirages-root h1', '.mirages-content', '.mirages-content main', '.mirages-content article', '.mirages-content h2', '.mirages-content p', '.mirages-footer'];
          return { title: document.title, viewport: innerWidth, height: innerHeight, fullHeight: Math.max(document.documentElement.scrollHeight, innerHeight), scrollWidth: document.documentElement.scrollWidth, bodyClass: document.body.className, sections: selectors.flatMap(selector => {
            const e = document.querySelector(selector); if (!e) return [];
            const r = e.getBoundingClientRect(), s = getComputedStyle(e);
            return [{ selector, x: r.x, y: r.y, width: r.width, height: r.height, font: s.fontFamily, fontSize: s.fontSize, lineHeight: s.lineHeight, color: s.color, background: s.backgroundColor, padding: s.padding }];
          }) };
        }, original);
        const file = `${site}/${name}-${device}-${mode}`;
        const pdf = await page.cdp('Page.printToPDF', { printBackground: true, displayHeaderFooter: false, paperWidth: width / 96, paperHeight: metrics.fullHeight / 96, marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, pageRanges: '1' }, { timeout: 12000 });
        await fs.writeFile(`${root}/${file}.pdf`, Buffer.from(pdf.data, 'base64'));
        records.push({ site, name, url, device, mode, file, ...metrics });
        await fs.writeFile(`${root}/complete-metrics.json`, JSON.stringify(records, null, 2));
        console.log(`${site} ${name} ${device} ${mode}: captured`);
      }
    }
  }

  return records;
}
