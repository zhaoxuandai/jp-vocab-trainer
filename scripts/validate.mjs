#!/usr/bin/env node
/*
 * 校验单词背诵页面：
 *   node validate.mjs <页面.html>
 *
 * 检查项：
 *   1. 词表字段、重复词形、含汉字词同音冲突
 *   2. 中文干扰项覆盖与唯一性
 *   3. 汉字干扰项覆盖、读音冲突、结尾假名一致
 *   4. 三个模式的选项生成（多轮随机）
 *   5. 完整闯关流程模拟 + 中途刷新续玩
 */
import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2];
if (!file){
  console.error('用法: node validate.mjs <页面.html>');
  process.exit(2);
}

let errors = 0;
let warnings = 0;
function ok(msg){ console.log('  ✓ ' + msg); }
function fail(msg){ console.log('  ✗ ' + msg); errors++; }
function warn(msg){ console.log('  ! ' + msg); warnings++; }

const html = fs.readFileSync(file, 'utf8');
const strictAt = html.indexOf("'use strict';");
if (strictAt < 0){ console.error('找不到主脚本（缺少 use strict）'); process.exit(1); }
const script = html.slice(strictAt + "'use strict';".length).split('</script>')[0];

function slice(a, b){
  const i = script.indexOf(a), j = script.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('页面结构不完整，找不到片段: ' + a);
  return script.slice(i, j);
}

/* ---------- 1. 取数据与纯函数 ---------- */
const ctx = vm.createContext({ Math, JSON, console });
vm.runInContext(
  slice('const RAW = [', 'const MODE_DEFS') +
  slice('/* ============ 小工具', '/* ============ 造牌') +
  slice('/* ============ 造牌', '/* ============ 视图切换') +
  '\n;globalThis.__x = {WORDS, KANJI_WORDS, CONFUSE, KANJI_CONFUSE, optionKana, optionMeaning, optionKanji};',
  ctx
);
const { WORDS, KANJI_WORDS, CONFUSE, KANJI_CONFUSE, optionKana, optionMeaning, optionKanji } = ctx.__x;

const trail = s => { const m = String(s).match(/[ぁ-ゖァ-ヺー]+$/); return m ? m[0] : ''; };
const isKanji = s => /[一-鿿]/.test(s);

console.log('\n[1] 词表');
console.log('  词条总数:', WORDS.length, '| 含汉字:', KANJI_WORDS.length, '| 纯假名:', WORDS.length - KANJI_WORDS.length);
if (!WORDS.length) fail('词表为空');

const seenW = new Map();
const emptyField = [];
for (const w of WORDS){
  if (!w.w || !w.k || !w.p || !w.m) emptyField.push(w.w || '(空)');
  const key = w.w;
  if (seenW.has(key)) fail('重复词形: ' + key);
  seenW.set(key, true);
}
if (emptyField.length) fail('有空字段: ' + emptyField.join(', '));
else ok('字段完整，无空值');

const byKana = new Map();
for (const w of KANJI_WORDS){
  if (!byKana.has(w.k)) byKana.set(w.k, []);
  byKana.get(w.k).push(w.w);
}
const homophones = [...byKana.entries()].filter(([, arr]) => arr.length > 1);
if (homophones.length){
  fail('含汉字词存在同音，功能三会出现两个正确答案: ' +
    homophones.map(([k, a]) => k + '=' + a.join('/')).join('; '));
} else ok('含汉字词之间没有同音冲突');

/* ---------- 2. 中文干扰项 ---------- */
console.log('\n[2] 看日语选中文的干扰项');
let confuseMissing = [];
for (const w of WORDS){
  const d = CONFUSE[w.w] || [];
  const usable = new Set(d.filter(x => x !== w.m));
  if (usable.size < 3) confuseMissing.push(w.w + '(' + usable.size + ')');
}
if (confuseMissing.length) warn('干扰项不足 3 个，将走自动兜底: ' + confuseMissing.join(', '));
else ok('每个词都有至少 3 个可用中文干扰项');

/* ---------- 3. 汉字干扰项 ---------- */
console.log('\n[3] 看假名写汉字的干扰项');
let kanjiMissing = [], kanaBad = [], readBad = [], dupBad = [];
for (const w of KANJI_WORDS){
  const d = KANJI_CONFUSE[w.w] || [];
  if (d.length !== 3) kanjiMissing.push(w.w + '(' + d.length + ')');
  const seen = new Set([w.w]);
  for (const pair of d){
    const k = pair && pair[0], r = pair && pair[1];
    if (!k || !r){ kanjiMissing.push(w.w + '(空项)'); continue; }
    if (r !== '!' && r === w.k) readBad.push(w.w + ' -> ' + k + '[' + r + ']');
    if (seen.has(k)) dupBad.push(w.w + ' -> ' + k); else seen.add(k);
    if (!trail(k).endsWith(trail(w.w))){
      kanaBad.push(w.w + '(' + trail(w.w) + ') vs ' + k + '(' + trail(k) + ')');
    }
  }
}
if (kanjiMissing.length) fail('汉字干扰项不是 3 个: ' + kanjiMissing.join(', '));
else ok('每个含汉字词都有 3 个汉字干扰项');
if (readBad.length) fail('干扰项读音与正确答案相同: ' + readBad.join(', '));
else ok('没有同音干扰项（不会出现两个正确答案）');
if (dupBad.length) fail('干扰项汉字重复: ' + dupBad.join(', '));
else ok('同一题的汉字选项互不重复');
if (kanaBad.length) fail('结尾假名不一致: ' + kanaBad.join(', '));
else ok('汉字+假名混写词的结尾假名全部一致');

/* ---------- 4. 选项生成多轮随机 ---------- */
console.log('\n[4] 选项生成（每个词 20 次随机）');
let optBad = [];
for (let round = 0; round < 20; round++){
  for (const w of WORDS){
    const o = optionMeaning(w);
    if (o.length !== 4 || new Set(o).size !== 4 || !o.includes(w.m)) optBad.push('m1:' + w.w);
  }
  for (const w of KANJI_WORDS){
    const o = optionKana(w);
    if (o.length !== 4 || new Set(o).size !== 4 || !o.includes(w.k)) optBad.push('m2:' + w.w);
    const p = optionKanji(w);
    if (p.length !== 4 || new Set(p).size !== 4 || !p.includes(w.w)) optBad.push('m3:' + w.w);
  }
}
if (optBad.length) fail('选项异常: ' + [...new Set(optBad)].join(', '));
else ok('三个模式都能稳定生成 4 个互不重复且含正确答案的选项');

/* ---------- 5. 完整流程模拟 ---------- */
console.log('\n[5] 闯关流程模拟');

class El {
  constructor(id){
    this.id = id; this.textContent = ''; this._html = ''; this.style = {};
    this._className = ''; this.children = []; this._attrs = {}; this._listeners = {};
    this.disabled = false; this.onclick = null; this._cls = new Set();
    this.classList = {
      add: c => this._cls.add(c), remove: c => this._cls.delete(c),
      contains: c => this._cls.has(c)
    };
  }
  set className(v){ this._className = v; }
  get className(){ return this._className; }
  set innerHTML(v){
    this._html = v; this.children = [];
    const re = /<button([^>]*)>/g; let m;
    while ((m = re.exec(v))){
      const el = new El(); const attrs = m[1];
      const dre = /data-([a-z-]+)="([^"]*)"/g; let am;
      while ((am = dre.exec(attrs))) el._attrs['data-' + am[1]] = am[2];
      const cm = /class="([^"]*)"/.exec(attrs); el._className = cm ? cm[1] : '';
      this.children.push(el);
    }
  }
  get innerHTML(){ return this._html; }
  querySelectorAll(sel){
    if (sel.startsWith('.')){
      const cls = sel.slice(1);
      return this.children.filter(c => c._className.split(/\s+/).includes(cls));
    }
    if (sel.startsWith('[data-')){
      const k = sel.slice(1, -1);
      return this.children.filter(c => c._attrs[k]);
    }
    return [];
  }
  addEventListener(e, f){ this._listeners[e] = f; }
  getAttribute(k){ return k in this._attrs ? this._attrs[k] : null; }
  click(){ if (this._listeners.click) this._listeners.click(); }
}

function boot(store){
  const els = {};
  const get = id => els[id] || (els[id] = new El(id));
  const views = ['view-home', 'view-quiz', 'view-summary', 'view-victory', 'view-review'].map(get);
  let timers = [];
  const env = {
    document: { querySelectorAll: s => s === '.view' ? views : [], getElementById: get },
    window: { scrollTo(){} },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; }
    },
    confirm: () => true,
    setTimeout: f => { timers.push(f); return timers.length; },
    clearTimeout: () => { timers = []; },
    console, Math, JSON
  };
  env.flush = () => { while (timers.length){ timers.shift()(); } };
  env.els = els;
  vm.createContext(env);
  vm.runInContext(
    script + '\n;globalThis.__t = {state, WORDS, current: () => currentModeId, ' +
    'round: () => currentModeId ? state.modes[currentModeId].round : null, ' +
    'activeView: () => document.querySelectorAll(".view").find(v => v.classList.contains("active")).id, ' +
    'knownCount, inFinalReview};',
    env
  );
  return env;
}

function answer(env, correct){
  const t = env.__t, m = t.current(), r = t.round(), w = t.WORDS[r.ids[r.pos]];
  const right = m === 'm1' ? w.m : (m === 'm2' ? w.k : w.w);
  const opts = env.els['q-options'].children.filter(c => c.className.includes('opt'));
  const target = correct
    ? opts.find(o => o.getAttribute('data-val') === right)
    : opts.find(o => o.getAttribute('data-val') !== right);
  if (!target) throw new Error('找不到可点击选项: ' + w.w);
  target.click(); env.flush();
}

const modeNames = ['m1', 'm2', 'm3'];
const pools = [WORDS.length, KANJI_WORDS.length, KANJI_WORDS.length];

try {
  // 5.1 全对直达通关
  let store = {}, env = boot(store), t = env.__t;
  env.els['cards'].querySelectorAll('[data-start]')[0].click();
  if (t.activeView() !== 'view-quiz') fail('点击开始后没有切到答题界面');
  if (!t.round() || t.round().ids.length !== pools[0]) fail('功能一第一轮题数不正确');
  for (let i = 0; i < pools[0]; i++) answer(env, true);
  if (t.activeView() !== 'view-summary') fail('第一轮结束没有进入小结');
  env.els['sum-next'].onclick(); env.flush();
  if (!t.round() || t.round().phase !== 'final') fail('全对后没有进入全词终测');
  for (let i = 0; i < pools[0]; i++) answer(env, true);
  env.els['sum-next'].onclick(); env.flush();
  if (t.activeView() !== 'view-victory' || !t.state.modes.m1.done) fail('终测全对后没有通关');
  else ok('全对流程：答题 → 小结 → 最终复习 → 通关');

  // 5.2 全错后下一轮包含全部错词
  store = {}; env = boot(store); t = env.__t;
  env.els['cards'].querySelectorAll('[data-start]')[1].click();
  for (let i = 0; i < pools[1]; i++) answer(env, false);
  const wrongIds = new Set(t.round().ids);
  env.els['sum-next'].onclick(); env.flush();
  const nextIds = new Set(t.round().ids);
  let allIn = true;
  for (const id of wrongIds) if (!nextIds.has(id)) allIn = false;
  if (!allIn || t.round().ids.length < pools[1]) fail('答错的词没有全部进入下一轮');
  else ok('答错的词全部进入下一轮，并混入已掌握词复习');

  // 5.3 中途刷新续玩
  store = {}; env = boot(store); t = env.__t;
  env.els['cards'].querySelectorAll('[data-start]')[2].click();
  const probe = Math.min(3, pools[2] - 1);
  for (let i = 0; i < probe; i++) answer(env, true);
  const saved = JSON.parse(JSON.stringify(store));
  const env2 = boot(saved), t2 = env2.__t;
  env2.els['cards'].querySelectorAll('[data-start]')[2].click();
  if (t2.activeView() !== 'view-quiz' || t2.round().pos !== probe) fail('刷新后没有从原位置继续');
  else ok('中途刷新后从第 ' + (probe + 1) + ' 题继续');

  // 5.4 三个模式互不影响
  const stateNow = t2.state;
  if (stateNow.modes.m1.round === null && stateNow.modes.m2.round === null &&
      stateNow.modes.m3.round !== null) ok('三个模式的进度互相独立');
  else fail('三个模式进度没有正确隔离');

  // 5.5 错题计数与错题回顾
  store = {}; env = boot(store); t = env.__t;
  env.els['cards'].querySelectorAll('[data-start]')[0].click();
  const firstId = t.round().ids[0];
  answer(env, false);
  if (t.state.modes.m1.wrong[firstId] !== 1) fail('答错后错题计数没有 +1');
  else ok('答错后错题计数 +1');

  env.els['open-review'].click();
  if (t.activeView() !== 'view-review') fail('错题回顾入口没有打开独立页面');
  else {
    const body = env.els['review-body'].innerHTML;
    const rows = (body.match(/<tr>/g) || []).length;
    if (rows !== WORDS.length) fail('错题回顾没有列出全部词（' + rows + '/' + WORDS.length + '）');
    else if (!body.includes(WORDS[firstId].w)) fail('错题回顾没有列出答错的词');
    else ok('错题回顾列出全部 ' + WORDS.length + ' 个词，并包含答错的词');
  }

  const saved2 = JSON.parse(JSON.stringify(store));
  const env3 = boot(saved2), t3 = env3.__t;
  if (t3.state.modes.m1.wrong[firstId] === 1) ok('刷新后错题计数保留');
  else fail('刷新后错题计数丢失');

  // 5.6 旧存档迁移
  const keyMatch = script.match(/const STORE_KEY = '([^']+)'/);
  if (keyMatch){
    const old = {version:1, modes:{}};
    ['m1', 'm2', 'm3'].forEach(k => {
      old.modes[k] = {status:{0:1, 1:2}, round:null, done:false, roundNo:0};
    });
    const storeOld = {}; storeOld[keyMatch[1]] = JSON.stringify(old);
    const envOld = boot(storeOld);
    const m1 = envOld.__t.state.modes.m1;
    if (!m1.wrong) fail('旧存档迁移后没有错题计数对象');
    else if (m1.status[0] !== 1 || m1.streak[0] !== 1 || m1.status[1] !== 0 || m1.streak[1] !== 0)
      fail('旧已掌握词的迁移不正确');
    else ok('旧存档迁移：已掌握词按“已对 1 次”处理');

    const oldDone = {version:1, modes:{}};
    ['m1', 'm2', 'm3'].forEach(k => {
      oldDone.modes[k] = {status:{}, round:null, done:(k === 'm2'), roundNo:3};
    });
    const storeDone = {}; storeDone[keyMatch[1]] = JSON.stringify(oldDone);
    const envDone = boot(storeDone);
    const m2 = envDone.__t.state.modes.m2;
    if (!m2.done || m2.streak[0] !== 2 || m2.status[0] !== 1) fail('旧通关记录迁移不正确');
    else ok('旧通关记录保持通关');
  }

  // 5.7 连续答对两次退出 + 最终复习
  store = {}; env = boot(store); t = env.__t;
  env.els['cards'].querySelectorAll('[data-start]')[0].click();
  for (let i = 0; i < pools[0]; i++) answer(env, true);
  if (t.knownCount('m1') !== pools[0]) fail('进度没有按“答对过一次”计算');
  else ok('答对一次后进度按 100% 计算');

  env.els['sum-next'].onclick(); env.flush();
  if (!t.round() || t.round().phase !== 'final' || t.round().ids.length !== pools[0])
    fail('进度 100% 后没有进入最终复习');
  else ok('进度 100% 后进入最终复习');

  const finalIds = t.round().ids.slice();
  const retiredId = finalIds[0];
  const wrongId = finalIds[1];
  for (let i = 0; i < finalIds.length; i++) answer(env, i !== 1);
  env.els['sum-next'].onclick(); env.flush();
  if (!t.round() || t.round().phase !== 'final' ||
      t.round().ids.length !== 1 || t.round().ids[0] !== wrongId)
    fail('连续答对两次的词没有退出，或最终复习集合不正确');
  else ok('连续答对两次的词退出，答错的词留在最终复习');
  if (t.round().ids.includes(retiredId)) fail('已退出的词又出现了');
  else ok('已退出的词不再出现');

  answer(env, true);
  env.els['sum-next'].onclick(); env.flush();
  answer(env, true);
  env.els['sum-next'].onclick(); env.flush();
  if (!t.state.modes.m1.done) fail('最终复习完成后没有通关');
  else ok('最终复习完成后通关');
} catch (e){
  fail('流程模拟异常: ' + e.message);
}

/* ---------- 汇总 ---------- */
console.log('\n==============================');
if (errors === 0) console.log('PASS：全部检查通过' + (warnings ? '（' + warnings + ' 条提示）' : ''));
else console.log('FAIL：' + errors + ' 项错误，' + warnings + ' 条提示');
process.exit(errors ? 1 : 0);
