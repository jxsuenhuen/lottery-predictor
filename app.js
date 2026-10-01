const STORAGE = 'lottery_predictor_history_v4';
const PRED_STORAGE = 'lottery_predictor_predictions_v4';
const BASE_URL = './history.csv';
let baseHistory = [];
let history = [];
let predictions = [];
let currentPrediction = null;

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
function nowLabel() { return new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}); }

async function loadData() {
  setStatus('正在加载');
  try {
    const response = await fetch(BASE_URL + '?v=4&t=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('history.csv 加载失败');
    baseHistory = parseCSV(await response.text());
    const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    const savedPred = JSON.parse(localStorage.getItem(PRED_STORAGE) || '[]');
    history = Array.isArray(saved) && saved.length ? saved : [...baseHistory];
    predictions = Array.isArray(savedPred) ? savedPred : [];
    cleanupPredictions();
    updateSummary();
    renderPredictionHistory();
    renderMetrics();
    predict(false);
  } catch (err) {
    setStatus('数据加载失败');
    document.getElementById('dataSummary').textContent = '无法加载历史数据，请刷新页面';
    document.getElementById('mainMeta').textContent = err.message || '请检查网络连接';
  }
}

function saveHistory() { localStorage.setItem(STORAGE, JSON.stringify(history)); updateSummary(); }
function savePredictions() { localStorage.setItem(PRED_STORAGE, JSON.stringify(predictions)); }
function cleanupPredictions() {
  const actual = new Map(history.map(r => [r.issue, r]));
  predictions = predictions.map(p => {
    const a = actual.get(p.issue);
    if (!a) return p;
    const hits = a.digits.reduce((n, d, i) => n + (d === p.main[i] ? 1 : 0), 0);
    const exact = a.digits.every((d,i) => d === p.main[i]);
    return {...p, actual: a.digits.join(''), hits, exact, settled: true, actualDate: a.date};
  });
  savePredictions();
}

function reset() {
  history = [...baseHistory];
  predictions = [];
  saveHistory();
  savePredictions();
  predict(true);
  renderPredictionHistory();
  renderMetrics();
  showMessage('已恢复初始151期，并清空本机预测记录。');
}

function setStatus(text) { document.getElementById('statusPill').textContent = text; }
function setBusy(button, busy, text) { button.disabled = busy; if (text) button.textContent = text; }
function showMessage(text) { document.getElementById('saveMessage').textContent = text; }

function predict(showFeedback = true) {
  const btn = document.getElementById('predictBtn');
  if (!history.length) { document.getElementById('mainNumber').textContent = '暂无数据'; return; }
  setBusy(btn, true, '计算中…');
  setStatus('正在计算');
  if (showFeedback) document.getElementById('mainMeta').textContent = '正在根据当前历史数据重新计算…';
  setTimeout(() => {
    const probs = Array.from({length:7}, (_, p) => blend(history, p));
    const top = scoreNumbers(probs, 10);
    const main = top[0];
    currentPrediction = { issue: nextIssue(), createdAt: new Date().toISOString(), main: main.num, top10: top.map(x => ({num:x.num,score:x.score})), probs };
    document.getElementById('mainNumber').textContent = main.num;
    document.getElementById('mainMeta').textContent = `预测期号 ${currentPrediction.issue} · 已生成 ${nowLabel()} · 仅按当前统计模型评分`;
    document.getElementById('top10').innerHTML = top.map((x,i) => `<div class="top-item"><div class="rank">${i+1}</div><div class="number">${x.num}</div><div class="score">相对评分 ${fmtPct(x.score)}</div></div>`).join('');
    renderProbabilities(probs);
    setStatus(`模型已更新 · ${currentPrediction.issue}`);
    setBusy(btn, false, '重新预测并记录');
    if (showFeedback) recordPrediction(currentPrediction);
    renderMetrics();
  }, 80);
}

function recordPrediction(pred) {
  const existing = predictions.findIndex(p => p.issue === pred.issue);
  const actual = history.find(r => r.issue === pred.issue);
  const entry = {...pred, settled:false};
  if (actual) {
    entry.actual = actual.digits.join('');
    entry.hits = actual.digits.reduce((n,d,i)=>n+(d===pred.main[i]?1:0),0);
    entry.exact = entry.hits === 7;
    entry.settled = true;
    entry.actualDate = actual.date;
  }
  if (existing >= 0) predictions[existing] = entry; else predictions.push(entry);
  predictions.sort((a,b)=>Number(a.issue)-Number(b.issue));
  savePredictions();
  renderPredictionHistory();
}

function renderProbabilities(probs) {
  document.getElementById('probabilities').innerHTML = probs.map((p,i)=>{
    const best = p.indexOf(Math.max(...p));
    const digits = p.map((v,d)=>`<div class="dig"><div class="dig-label">${d}</div><div class="bar"><div class="fill" style="height:${Math.max(2, v*100)}%"></div></div><div class="dig-value">${fmtPct(v)}</div></div>`).join('');
    return `<div class="prob-row"><div class="prob-head"><div class="prob-pos">第 ${i+1} 位</div><div class="prob-best">最高：<strong>${best}</strong> · ${fmtPct(p[best])}</div></div><div class="digits">${digits}</div></div>`;
  }).join('');
}

function renderMetrics() {
  const settled = predictions.filter(p => p.settled && Number.isInteger(p.hits));
  const avg = settled.length ? settled.reduce((s,p)=>s+p.hits,0)/settled.length : 0;
  const exact = settled.filter(p=>p.hits===7).length;
  document.getElementById('metrics').innerHTML = `
    <div class="metric"><div class="v">${predictions.length}</div><div class="l">已记录预测</div></div>
    <div class="metric"><div class="v">${settled.length}</div><div class="l">已结算预测</div></div>
    <div class="metric"><div class="v">${settled.length ? avg.toFixed(2) : '--'}</div><div class="l">平均命中位数</div></div>
    <div class="metric"><div class="v">${settled.length ? exact : '--'}</div><div class="l">7位全中次数</div></div>`;

  const counts = Array(8).fill(0);
  settled.forEach(p => counts[p.hits]++);
  document.getElementById('hitDistribution').innerHTML = counts.map((c,h)=>`<div class="dist-item"><div class="v">${c}</div><div class="l">${h}位命中</div></div>`).join('');
}

function renderPredictionHistory() {
  const settled = predictions.filter(p=>p.settled).slice().reverse().slice(0,10);
  const pending = predictions.filter(p=>!p.settled).slice().reverse().slice(0,3);
  let html = '';
  if (pending.length) html += pending.map(p=>`<div class="recent-item"><div><div class="recent-main">${p.issue} · ${p.main}</div><div class="recent-meta">待开奖 · ${new Date(p.createdAt).toLocaleDateString()}</div></div><div class="recent-score">待结算<small>主候选</small></div></div>`).join('');
  html += settled.map(p=>`<div class="recent-item"><div><div class="recent-main">${p.issue} · 预测 ${p.main}</div><div class="recent-meta">实际 ${p.actual} · ${p.actualDate || ''}</div></div><div class="recent-score">${p.hits}/7<small>${p.exact ? '7位全中' : '位置命中'}</small></div></div>`).join('');
  document.getElementById('recentSettled').innerHTML = html || '<div class="hint">还没有已结算预测。点击一次“预测下一期”，下一期开奖后录入即可看到真实命中表现。</div>';
}

function updateSummary() {
  const first=history[0], last=history[history.length-1];
  document.getElementById('dataSummary').textContent = first&&last ? `${history.length} 期 · ${first.date} 至 ${last.date}` : '暂无数据';
}

function setupInputs() {
  const box=document.getElementById('numberInputs'); box.innerHTML='';
  for(let i=0;i<7;i++){
    const inp=document.createElement('input'); inp.inputMode='numeric'; inp.autocomplete='off'; inp.maxLength=1; inp.id='digit'+i; inp.placeholder=String(i+1);
    inp.addEventListener('input',()=>{inp.value=inp.value.replace(/\D/g,'').slice(-1); if(inp.value&&i<6)document.getElementById('digit'+(i+1)).focus();});
    box.appendChild(inp);
  }
}

function addResult() {
  const issue=document.getElementById('issueInput').value.trim();
  const date=document.getElementById('dateInput').value;
  const digits=[0,1,2,3,4,5,6].map(i=>document.getElementById('digit'+i).value);
  if(!/^\d{7}$/.test(issue)){showMessage('请输入7位期号。');return;}
  if(!date){showMessage('请选择开奖日期。');return;}
  if(digits.some(d=>d==='')){showMessage('请完整输入7位开奖号码。');return;}
  if(history.some(r=>r.issue===issue)){showMessage('这个期号已经存在。');return;}
  history.push({issue,date,digits:digits.map(Number)}); history.sort((a,b)=>Number(a.issue)-Number(b.issue));
  saveHistory(); cleanupPredictions(); showMessage(`已保存 ${issue}：${digits.join('')}。对应预测已自动结算（如之前有记录）。`); predict(true); renderMetrics();
  document.getElementById('issueInput').value=''; document.getElementById('dateInput').value='';
  for(let i=0;i<7;i++)document.getElementById('digit'+i).value='';
}

function downloadText(filename,text,mime='text/plain;charset=utf-8'){
  const blob=new Blob([text],{type:mime}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportHistory(){
  const lines=['issue,date,d1,d2,d3,d4,d5,d6,d7',...history.map(r=>[r.issue,r.date,...r.digits].join(','))];
  downloadText('lottery_history.csv','\uFEFF'+lines.join('\n'),'text/csv;charset=utf-8');
}
function exportPredictions(){
  const lines=['issue,created_at,main,top1,top2,top3,top4,top5,top6,top7,top8,top9,top10,actual,hits,exact,settled'];
  predictions.forEach(p=>{const top=(p.top10||[]).map(x=>x.num); lines.push([p.issue,p.createdAt,p.main,...top,p.actual||'',p.hits??'',p.exact??'',p.settled].join(','));});
  downloadText('lottery_predictions.csv','\uFEFF'+lines.join('\n'),'text/csv;charset=utf-8');
}

function bindEvents(){
  document.getElementById('predictBtn').addEventListener('click',()=>predict(true));
  document.getElementById('saveBtn').addEventListener('click',addResult);
  document.getElementById('exportHistoryBtn').addEventListener('click',exportHistory);
  document.getElementById('exportPredBtn').addEventListener('click',exportPredictions);
  document.getElementById('resetBtn').addEventListener('click',()=>{if(window.confirm('确定恢复到最初151期数据，并清空预测记录吗？'))reset();});
}

document.addEventListener('DOMContentLoaded',()=>{
  setupInputs(); bindEvents();
  if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=4').catch(()=>{}));
  loadData();
});
