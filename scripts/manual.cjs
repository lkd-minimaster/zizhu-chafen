'use strict';

/**
 * 生成图文说明书：把截图内联进 HTML，输出到 dist/，
 * 方便单独发一个文件，也方便用浏览器“打印成 PDF”。
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const docs = path.join(ROOT, 'docs');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const BUILT = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date()).replaceAll('/', '.');

let html = fs.readFileSync(path.join(ROOT, 'assets/manual.html'), 'utf8');

html = html.replace(/src="docs\/([^"]+\.png)"/g, (_, name) => {
  const file = path.join(docs, name);
  if (!fs.existsSync(file)) throw new Error('说明书缺图：' + file);
  const data = fs.readFileSync(file).toString('base64');
  return `src="data:image/png;base64,${data}"`;
});

html = html
  .replaceAll('__VERSION__', pkg.version)
  .replaceAll('__BUILT__', BUILT);

fs.mkdirSync(DIST, { recursive: true });
const out = path.join(DIST, '1-先看这里-安装图解.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`说明书已生成：${path.relative(ROOT, out)}（${(html.length / 1024).toFixed(0)} KB，图片已内联）`);
