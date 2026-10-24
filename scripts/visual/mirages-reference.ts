import { join, resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';

// Read a user-supplied Mirages 7.10.6 package; no theme assets are redistributed.
const theme = process.env.MIRAGES_THEME_DIR;
if (!theme) throw new Error('Set MIRAGES_THEME_DIR to the local Mirages 7.10.6 directory.');
const port = Number(process.env.MIRAGES_REFERENCE_PORT || 15320);
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const css = await Bun.file(join(theme, 'css/7.10.6/mirages.min.css')).text();
const fontMarkup = (await Bun.file(join(theme, 'component/head_font.php')).text())
  .replace(/<\?php echo STATIC_PATH \?>/g, '/assets/').replace(/<\?php[\s\S]*?\?>/g, '');
const headfix = await Bun.file(join(theme, 'component/headfix_pages.php')).text();
const listStyle = headfix.split('    @media(max-width: 767px)')[1].split('<?php endif;?>')[0];
const commonStyle = `body,button,input,select,textarea{font-family:'Mirages Custom',Merriweather,'Open Sans','PingFang SC','Hiragino Sans GB','Microsoft Yahei',Helvetica,Arial,sans-serif}`;
const notFoundSource = await Bun.file(join(theme, '404.php')).text();
const notFoundMarkup = notFoundSource.slice(notFoundSource.indexOf('<div class="content404-wrapper">'), notFoundSource.lastIndexOf('<?php $this->need'))
  .replace(/<\?php _me\('([^']*)'\)\s*;?\?>/g, '$1')
  .replace(/<\?php Mirages::\$options->rootUrl\(\)\?>/g, '/')
  .replace(/<\?php[\s\S]*?\?>/g, '');
const fixture = await Bun.file(new URL('./mirages-fixture.json', import.meta.url)).json();
const names: Record<string, string> = {home: fixture.name, category:'技术笔记', post:fixture.postTitle, page:'独立页面', archives:'时间线', tags:'标签', tag:'迁移', search:'搜索：迁移', links:'友链', music:'音乐', 'not-found':'页面没有找到'};

function html(kind: string, mode: string, mobile: boolean) {
  const list = ['home','category','tag','search'].includes(kind);
  const hasCover = kind === 'post';
  const title = names[kind] || '独立页面';
  const description = kind === 'home' ? fixture.description : kind === 'category' ? '记录开发、写作与日常探索。' : kind === 'post' ? 'admin • 2026 年 10 月 25 日 • 阅读: 1 • 技术笔记' : '';
  const card = `<article><a href="?kind=post"><div class="post-card" style="background-image:url('${fixture.cover}');background-size:cover;background-position:center"><div class="post-card-mask"><div class="post-card-container"><h2 class="post-card-title">${esc(fixture.postTitle)}</h2><div class="post-card-info">2026 年 10 月 25 日 • 技术笔记</div></div></div></div></a></article>`;
  let main = list ? `<div id="${kind==='home'?'index':'archive'}" role="main">${card}</div>`
    : `<div id="post" role="main"><article class="post${kind==='post'?'':' page'}"><div class="post-content">${fixture.html}</div></article></div>`;
  if (kind === 'archives' || kind === 'tags') main = `<div id="archives"><div id="archives-tags"><h3>标签云</h3><a class="itags" href="?kind=tag">迁移</a></div>${kind==='tags'?'':`<div id="archives-content"><div class="archive-title"><div class="archives"><h3>2026 年 10 月</h3><div class="brick"><a href="?kind=post"><span class="time">10-25</span> ${esc(fixture.postTitle)}</a></div></div></div></div>`}</div>`;
  if (kind === 'not-found') main = notFoundMarkup;
  let document = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Mirages 7.10.6 reference</title>${fontMarkup}<link rel="stylesheet" href="/original.css"><style>${commonStyle}${list ? "@media(max-width: 767px)"+listStyle : ""}*,*::before,*::after{transition:none!important;animation:none!important}</style></head><body class="card ${mobile?'mobile phone android':'desktop macOS macOS-ge-10-11'} chrome not-safari wrap-code open use-navbar theme-${mode==='dark'?'dark':'white'}"><div id="wrap"><header><a id="toggle-nav" class="btn btn-primary" href="#"><span>MENU</span></a><nav id="navbar" class="navbar navbar-expand-md navbar-color navbar-md fixed-top no-user-select"><div class="container-fluid"><a class="navbar-brand text-brand" href="/">${esc(fixture.name)}</a><div class="collapse navbar-collapse" id="navbarCollapse"><ul class="navbar-nav mr-auto"><li class="nav-item"><a class="nav-link" href="/">首页</a></li><li class="nav-item"><a class="nav-link" href="?kind=category">技术笔记</a></li><li class="nav-item"><a class="nav-link" href="?kind=page">关于</a></li></ul><ul class="navbar-nav side-toolbar-list"><li class="navbar-search-container"><a id="navbar-search" href="?kind=search"><i class="fa fa-search"></i></a></li></ul></div></div></nav></header><div id="body"><header id="masthead" class="align-center align-middle ${hasCover?'':'no-banner-image'}" style="height:${mobile?'338px':'445px'}"><div class="blog-background" style="${hasCover?`background-image:url('${fixture.cover}');background-size:cover;background-position:center`: ""}"></div><div class="inner" style="background-color:rgba(0,0,0,.25)"><div class="container"><h1 class="blog-title">${esc(title)}</h1>${description?`<h2 class="blog-description">${esc(description)}</h2>`:''}</div></div></header><div class="container"><div class="row">${main}</div></div></div></div><footer id="footer"><div class="container"><p>© 2026 Powered by Rin</p></div></footer></body></html>`;
  if (kind === 'not-found') document = document.replace(/<header id="masthead"[\s\S]*?<\/header>/, '').replace('wrap-code open', 'wrap-code open no-banner');
  return document;
}

Bun.serve({hostname:'127.0.0.1', port, async fetch(req) {
  const url=new URL(req.url);
  if (url.pathname === '/original.css') return new Response(css,{headers:{'Content-Type':'text/css'}});
  if (url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/webfonts/')) {
    const asset=resolve(theme,'css/7.10.6'+url.pathname);
    if (!asset.startsWith(theme+'/css/7.10.6/')) return new Response('',{status:404});
    return new Response(Bun.file(asset));
  }
  if (url.pathname.startsWith('/assets/')) {
    const relative=decodeURIComponent(url.pathname.slice('/assets/'.length));
    const file=resolve(theme,relative);
    if (!file.startsWith(theme+'/') || !['.woff','.woff2','.ttf','.svg','.png','.jpg'].includes(extname(file))) return new Response('',{status:404});
    return new Response(Bun.file(file));
  }
  return new Response(html(url.searchParams.get('kind')||'home',url.searchParams.get('mode')||'light',url.searchParams.get('device')==='mobile'),{headers:{'Content-Type':'text/html;charset=utf-8'}});
}});
console.log(JSON.stringify({reference:'Mirages 7.10.6 CSS and PHP template structure; synthetic content; no PHP runtime',cssSha256:createHash('sha256').update(css).digest('hex'),url:`http://127.0.0.1:${port}`}));
