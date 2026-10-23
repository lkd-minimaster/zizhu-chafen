'use strict';

/**
 * 构建脚本：把 src/core.js + src/app.js 合成一个自包含的 IIFE，
 * 再生成书签地址、安装页、收藏夹导入文件和说明书。
 * 不依赖任何 npm 包。
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const BUILT = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date()).replaceAll('/', '.');

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function source(relative) {
  return read(relative)
    .replace(/^'use strict';\s*/, '')
    .replace(/^if \(typeof module [^\n]*$/gm, '')
    .trim();
}

const core = source('src/core.js');
const app = source('src/app.js');

const bundle = `(function(){"use strict";
/* 自助查分 v${VERSION} · 逸仙智课临时卷面分 · 纯前端同源查询 */
${core}
${app}
startScoreReader(createCore(),{version:${JSON.stringify(VERSION)}});
})();`;

const bookmarklet = 'javascript:' + encodeURIComponent('void ' + bundle);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function fill(template) {
  return template
    .replaceAll('__BOOKMARK__', escapeHtml(bookmarklet))
    .replaceAll('__VERSION__', VERSION)
    .replaceAll('__BUILT__', BUILT);
}

fs.mkdirSync(DIST, { recursive: true });

fs.writeFileSync(path.join(DIST, '自助查分.js'),
  `/*! 自助查分 v${VERSION} | 逸仙智课临时卷面分 | 构建于 ${BUILT} | 纯前端、同源查询、不保存数据 */\n${bundle}\n`, 'utf8');

// 清掉旧版文件名，避免文件夹里同时存在两套
for (const legacy of ['安装书签.html', '导入收藏夹.html', '书签地址.txt', '开始使用.txt', '新手图文说明书.html', '新手图文说明书.pdf']) {
  try { fs.rmSync(path.join(DIST, legacy), { force: true }); } catch {}
}

fs.writeFileSync(path.join(DIST, '2-安装书签.html'), fill(read('assets/install.html')), 'utf8');

fs.writeFileSync(path.join(DIST, '3-拖不动时-导入收藏夹.html'), `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>自助查分</TITLE>
<H1>自助查分</H1>
<DL><p>
    <DT><A HREF="${escapeHtml(bookmarklet)}" ADD_DATE="${Math.floor(Date.now() / 1000)}">自助查分</A>
</DL><p>
`, 'utf8');

fs.writeFileSync(path.join(DIST, '4-手动安装-书签地址.txt'), bookmarklet, 'utf8');

fs.writeFileSync(path.join(DIST, '使用说明.html'), fill(read('assets/guide.html')), 'utf8');

const kb = (bookmarklet.length / 1024).toFixed(1);
console.log(`Built v${VERSION} · 书签地址 ${bookmarklet.length} 字符（${kb} KB）· 脚本 ${(bundle.length / 1024).toFixed(1)} KB`);
if (bookmarklet.length > 200000) {
  console.error('警告：书签地址过长，部分浏览器可能截断。');
  process.exitCode = 1;
}
