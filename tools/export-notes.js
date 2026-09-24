#!/usr/bin/env node
/* 从课件的 <aside class="notes"> 导出“逐页讲稿”Markdown，讲稿只维护在课件里一处。
   用法：node tools/export-notes.js episodes/ep01/index.html docs/第1集/逐页讲稿.md "第 1 集《大自然的密码》" */
'use strict';
const fs = require('fs');

const [src, out, title] = process.argv.slice(2);
if (!src || !out) {
  console.error('用法：node tools/export-notes.js <课件 index.html> <输出 .md> [标题]');
  process.exit(1);
}
const html = fs.readFileSync(src, 'utf8');

// 章节名与计划时间来自 DECK_CONFIG
const chapters = [];
const cfg = html.match(/chapters:\s*\[([\s\S]*?)\]\s*\}/);
if (cfg) {
  const re = /name:\s*'([^']*)',\s*min:\s*(\d+)/g;
  let m;
  while ((m = re.exec(cfg[1]))) chapters.push({ name: m[1], min: +m[2] });
}

function toMd(s) {
  return s
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/?(b|strong)>/g, '**')
    .replace(/<p>/g, '').replace(/<\/p>/g, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .split('\n').map(l => l.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const sections = html.split(/<section\b/).slice(1);
let md = `# ${title || '逐页讲稿'} · 逐页讲稿\n\n`;
md += `> 本文件由 \`tools/export-notes.js\` 从课件自动导出，请勿手工修改；改讲稿请直接改课件里的 \`<aside class="notes">\`。\n`;
md += `> 上课时也可以在课件里按 \`P\` 打开讲者视图，或按 \`N\` 在屏幕下方显示讲稿。\n\n`;
if (chapters.length) {
  let t = 0;
  md += '| 章节 | 计划时间 |\n|---|---|\n';
  chapters.forEach(c => { md += `| ${c.name} | 第 ${t}–${t + c.min} 分钟 |\n`; t += c.min; });
  md += '\n';
}
let lastCh = -1;
sections.forEach((sec, i) => {
  const ch = +((sec.match(/data-ch="(\d+)"/) || [])[1] || 0);
  const t = (sec.match(/data-title="([^"]*)"/) || [])[1] || `第 ${i + 1} 页`;
  const optional = /data-optional="1"/.test(sec);
  const notes = (sec.match(/<aside class="notes">([\s\S]*?)<\/aside>/) || [])[1] || '';
  if (ch !== lastCh && chapters[ch]) { md += `\n---\n\n## ${chapters[ch].name}\n\n`; lastCh = ch; }
  md += `### 第 ${i + 1} 页 · ${t}${optional ? '（可跳过）' : ''}\n\n${toMd(notes) || '（无讲稿）'}\n\n`;
});
fs.writeFileSync(out, md);
console.log(`已导出 ${sections.length} 页讲稿 → ${out}`);
