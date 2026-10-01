const STORAGE = 'lottery_predictor_history_v2';
const BASE_URL = './history.csv';
let baseHistory = [];
let history = [];

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = lines.shift().split(',').map(s => s.trim());
  return lines.map(line => {
    const a = line.split(',');
    const row = {};
    header.forEach((h, i) => row[h] = (a[i] ?? '').trim());
    const digits = [1,2,3,4,5,6,7].map(i => Number(row['d' + i]));
    return { issue: row.issue, date: row.date, digits };
  }).filter(r => /^\d{7}$/.test(r.issue) && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.digits.length === 7 && r.digits.every(d => Number.isInteger(d) && d >= 0 && d <= 9));
}

async function loadData() {
  const status = document.getElementById('statusPill');
  status.textContent = '正在加载';
  try {
    const response = await fetch(BASE_URL + '?v=2', { cache: 'no-store' });
    if (!response.ok) throw new Error('history.csv 加载失败');
    const text = await response.text();
    baseHistory = parseCSV(text);
    const saved = localStorage.getItem(STORAGE);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        history = Array.isArray(parsed) && parsed.length ? parsed : [...baseHistory];
      } catch {
        history = [...baseHistory];
      }
    } else {
      history = [...baseHistory];
    }
    history = history.filter(r => r && Array.isArray(r.digits) && r.digits.length === 7);
    updateSummary();
    renderMetrics();
    predict(false);
    status.textContent = `模型已更新 · ${nextIssue()}`;
  } catch (err) {
    status.textContent = '数据加载失败';
    document.getElementById('dataSummary').textContent = '无法加载历史数据，请刷新页面';
    document.getElementById('mainMeta').textContent = err.message || '请检查网络连接';
  }
}

function save() {
  localStorage.setItem(STORAGE, JSON.stringify(history));
  updateSummary();
}

function reset() {
  history = [...baseHistory];
  save();
  predict(true);
}

function normalize(arr) {
  const s = arr.reduce((a,b) => a+b, 0);
  return s ? arr.map(v => v/s) : arr.map(() => 1/arr.length);
}

function distAll(data, pos) {
  const c = Array(10).fill(1);
  data.forEach(r => c[r.digits[pos]]++);
  return normalize(c);
}

function distDecay(data, pos, halfLife) {
  const c = Array(10).fill(1), L = data.length;
  data.forEach((r, i) => {
    const age = L - 1 - i;
    const w = Math.pow(0.5, age / halfLife);
    c[r.digits[pos]] += w;
  });
  return normalize(c);
}

function blend(data, pos) {
  const a = distDecay(data, pos, 40);
  const b = distDecay(data, pos, 20);
  const c = distAll(data, pos);
  return normalize(a.map((v, i) => 0.3337594730159434*v + 0.33326038074242903*b[i] + 0.33298014624162764*c[i]));
}

function scoreNumbers(probs, n = 10) {
  const out = [];
  function rec(i, s, p) {
    if (i === 7) { out.push({ num: s, score: p }); return; }
    const top = [...Array(10).keys()].sort((x,y) => probs[i][y] - probs[i][x]).slice(0, 5);
    top.forEach(d => rec(i + 1, s + d, p * probs[i][d]));
  }
  rec(0, '', 1);
  out.sort((a,b) => b.score - a.score);
  return out.slice(0, n);
}

function fmtPct(x) { return (x * 100).toFixed(1) + '%'; }
function nextIssue() {
  if (!history.length) return '--';
  return String(Number(history[history.length - 1].issue) + 1).padStart(7, '0');
}

function setBusy(button, busy, text) {
  if (!button) return;
  button.disabled = busy;
  if (text) button.textContent = text;
}

function predict(showFeedback = true) {
  const btn = document.getElementById('predictBtn');
  const main = document.getElementById('mainNumber');
  if (!history.length) {
    main.textContent = '暂无数据';
    return;
  }
  setBusy(btn, true, '计算中…');
  document.getElementById('statusPill').textContent = '正在计算';
  if (showFeedback) document.getElementById('mainMeta').textContent = '正在根据当前历史数据重新计算…';

  // Yield to the UI so iPhone visibly responds to the tap.
  setTimeout(() => {
    const probs = Array.from({ length: 7 }, (_, p) => blend(history, p));
    const top = scoreNumbers(probs, 10);
    main.textContent = top[0].num;
    document.getElementById('mainMeta').textContent = `基于 ${history.length} 期数据 · 计算时间 ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
    document.getElementById('top10').innerHTML = top.map((x, i) => `<div class="top-item"><div class="rank">${i + 1}</div><div class="number">${x.num}</div><div class="score">相对评分 ${fmtPct(x.score)}</div></div>`).join('');
    document.getElementById('positionGrid').innerHTML = probs.map((p, i) => {
      const d = p.indexOf(Math.max(...p));
      return `<div class="position"><div class="pname">第 ${i + 1} 位</div><div class="digit">${d}</div><div class="prob">${fmtPct(p[d])}</div></div>`;
    }).join('');
    document.getElementById('statusPill').textContent = `模型已更新 · ${nextIssue()}`;
    renderMetrics();
    setBusy(btn, false, '重新预测');
  }, 120);
}

function renderMetrics() {
  const baseline = 0.10;
  document.getElementById('metrics').innerHTML = `
    <div class="metric"><div class="v">${history.length}</div><div class="l">历史期数</div></div>
    <div class="metric"><div class="v">${fmtPct(baseline)}</div><div class="l">随机单位置基准</div></div>
    <div class="metric"><div class="v">V2</div><div class="l">当前模型</div></div>`;
}

function updateSummary() {
  const first = history[0], last = history[history.length - 1];
  document.getElementById('dataSummary').textContent = first && last ? `${history.length} 期 · ${first.date} 至 ${last.date}` : '暂无数据';
}

function setupInputs() {
  const box = document.getElementById('numberInputs');
  box.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const inp = document.createElement('input');
    inp.inputMode = 'numeric';
    inp.autocomplete = 'off';
    inp.maxLength = 1;
    inp.id = 'digit' + i;
    inp.placeholder = String(i + 1);
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '').slice(-1);
      if (inp.value && i < 6) document.getElementById('digit' + (i + 1)).focus();
    });
    box.appendChild(inp);
  }
}

function addResult() {
  const issue = document.getElementById('issueInput').value.trim();
  const date = document.getElementById('dateInput').value;
  const digits = [0,1,2,3,4,5,6].map(i => document.getElementById('digit' + i).value);
  const msg = document.getElementById('saveMessage');
  if (!/^\d{7}$/.test(issue)) { msg.textContent = '请输入7位期号。'; return; }
  if (!date) { msg.textContent = '请选择开奖日期。'; return; }
  if (digits.some(d => d === '')) { msg.textContent = '请完整输入7位开奖号码。'; return; }
  if (history.some(r => r.issue === issue)) { msg.textContent = '这个期号已经存在。'; return; }
  history.push({ issue, date, digits: digits.map(Number) });
  history.sort((a,b) => Number(a.issue) - Number(b.issue));
  save();
  predict(true);
  msg.textContent = `已保存 ${issue}：${digits.join('')}，模型已重新计算。`;
}

function exportCSV() {
  const lines = ['issue,date,d1,d2,d3,d4,d5,d6,d7', ...history.map(r => [r.issue, r.date, ...r.digits].join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lottery_history.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bindEvents() {
  document.getElementById('predictBtn').addEventListener('click', () => predict(true));
  document.getElementById('saveBtn').addEventListener('click', addResult);
  document.getElementById('exportBtn').addEventListener('click', exportCSV);
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (window.confirm('确定恢复到最初151期数据吗？')) reset();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupInputs();
  bindEvents();
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=2').catch(() => {}));
  }
  loadData();
});
