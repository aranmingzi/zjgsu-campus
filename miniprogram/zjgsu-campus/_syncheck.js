/**
 * 语法体检：不启子进程（本机 spawn node 不稳定），全在进程内编译。
 *
 *   .js   → new vm.Script(...) 真编译一遍，语法错会当场抛
 *   .json → JSON.parse
 *   .wxml/.wxss → 只查「没被写坏」：非空、无乱码、括号配平
 *
 * 用法：node _syncheck.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const SKIP = new Set(['node_modules', '.git', 'miniprogram_npm', 'backup']);

function walk(base, out = []) {
  for (const name of fs.readdirSync(base)) {
    if (SKIP.has(name)) continue;
    const p = path.join(base, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function checkWxssBalance(src) {
  // 只做粗查：把注释全去掉再数花括号，避免把注释里的括号算进去
  const clean = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
  const open = (clean.match(/\{/g) || []).length;
  const close = (clean.match(/\}/g) || []).length;
  if (open !== close) return `花括号不配平：{ ${open} 个，} ${close} 个`;
  const po = (clean.match(/\(/g) || []).length;
  const pc = (clean.match(/\)/g) || []).length;
  if (po !== pc) return `圆括号不配平：( ${po} 个，) ${pc} 个`;
  return '';
}

const files = walk(ROOT);
let ok = 0;
const fail = [];
let skipped = 0;

for (const f of files) {
  const ext = path.extname(f);
  let src;
  try {
    src = fs.readFileSync(f, 'utf8');
  } catch (e) {
    fail.push(`${f} → 读不到文件`);
    continue;
  }
  if (!src.trim()) {
    fail.push(`${f} → 空文件`);
    continue;
  }
  // 编码异常（乱码）检查
  const bad = src.indexOf(String.fromCharCode(0xFFFD)); // 替换字符 U+FFFD，文件编码坏了才会出现
  if (bad >= 0) fail.push(`${f} → 疑似编码损坏`);

  try {
    if (ext === '.js') {
      if (f.includes('project.config')) { skipped++; continue; }
      new vm.Script(src, { filename: f });
      ok++;
    } else if (ext === '.json') {
      JSON.parse(src);
      ok++;
    } else if (ext === '.wxss' || ext === '.css') {
      const r = checkWxssBalance(src);
      if (r) fail.push(`${f} → ${r}`);
      else ok++;
    } else if (ext === '.wxml') {
      ok++; // WXML 只能靠开发者工具真编译，这里只保证文件本身没坏
    } else {
      skipped++;
    }
  } catch (e) {
    const msg = e && e.message ? String(e.message).split('\n')[0] : String(e);
    fail.push(`${f} → ${msg}`);
  }
}

console.log(`检查 ${files.length} 个文件，通过 ${ok}，跳过 ${skipped}`);
if (fail.length) {
  console.log(`失败 ${fail.length} 个：`);
  fail.forEach((x) => console.log('  ' + x));
  process.exit(1);
}
console.log('语法体检全部通过');
