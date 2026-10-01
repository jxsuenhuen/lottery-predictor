const STORAGE = 'lottery_predictor_history_v1';
let baseHistory = [];
let history = [];

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split(',');
  return lines.map(line => {
    const a = line.split(',');
    const row = {};
    header.forEach((h,i)=>row[h]=a[i]);
    return { issue: row.issue, date: row.date, digits: [1,2,3,4,5,6,7].map(i=>Number(row['d'+i])) };
  }).filter(r=>r.digits.every(Number.isInteger));
}

async function loadData(){
  const text = await fetch('./history.csv').then(r=>r.text());
  baseHistory = parseCSV(text);
  const saved = localStorage.getItem(STORAGE);
  if (saved) { try { history = JSON.parse(saved); } catch { history = [...baseHistory]; } }
  else history = [...baseHistory];
  updateSummary();
  predict();
}

function save(){ localStorage.setItem(STORAGE, JSON.stringify(history)); updateSummary(); }
function reset(){ history = [...baseHistory]; save(); predict(); }

function normalize(arr){ const s = arr.reduce((a,b)=>a+b,0); return s?arr.map(v=>v/s):arr.map(()=>1/arr.length); }
function distAll(data,pos){ const c=Array(10).fill(1); data.forEach(r=>c[r.digits[pos]]++); return normalize(c); }
function distWindow(data,pos,n){ return distAll(data.slice(Math.max(0,data.length-n)),pos); }
function distDecay(data,pos,halfLife){
  const c=Array(10).fill(1), L=data.length;
  data.forEach((r,i)=>{ const age=L-1-i; const w=Math.pow(0.5, age/halfLife); c[r.digits[pos]] += w; });
  return normalize(c);
}
function blend(data,pos){
  const a=distDecay(data,pos,40), b=distDecay(data,pos,20), c=distAll(data,pos);
  return normalize(a.map((v,i)=>0.3337594730159434*v + 0.33326038074242903*b[i] + 0.33298014624162764*c[i]));
}
function scoreNumbers(probs, n=10){
  const out=[];
  function rec(i,s,p){
    if(i===7){ out.push({num:s,score:p}); return; }
    const top = [...Array(10).keys()].sort((x,y)=>probs[i][y]-probs[i][x]).slice(0,4);
    top.forEach(d=>rec(i+1,s+d,String(p*probs[i][d])));
  }
  rec(0,'',1);
  out.sort((a,b)=>b.score-a.score);
  return out.slice(0,n);
}
function fmtPct(x){return (x*100).toFixed(1)+'%';}

function predict(){
  if(history.length===0)return;
  const probs = Array.from({length:7},(_,p)=>blend(history,p));
  const top = scoreNumbers(probs,10);
  document.getElementById('mainNumber').textContent=top[0].num;
  document.getElementById('mainMeta').textContent=`基于 ${history.length} 期数据；当前为统计候选，不是保证中奖概率`;
  document.getElementById('top10').innerHTML = top.map((x,i)=>`<div class="top-item"><div class="rank">${i+1}</div><div class="number">${x.num}</div><div class="score">相对评分 ${fmtPct(x.score)}</div></div>`).join('');
  document.getElementById('positionGrid').innerHTML = probs.map((p,i)=>{let d=p.indexOf(Math.max(...p)); return `<div class="position"><div class="pname">第 ${i+1} 位</div><div class="digit">${d}</div><div class="prob">${fmtPct(p[d])}</div></div>`;}).join('');
  const last = history[history.length-1];
  const nextIssue = String(Number(last.issue)+1);
  document.getElementById('statusPill').textContent=`模型已更新 · ${nextIssue}`;
  renderMetrics();
}

function renderMetrics(){
  const baseline=0.10;
  document.getElementById('metrics').innerHTML = `
    <div class="metric"><div class="v">${history.length}</div><div class="l">历史期数</div></div>
    <div class="metric"><div class="v">${fmtPct(baseline)}</div><div class="l">随机单位置基准</div></div>
    <div class="metric"><div class="v">V2</div><div class="l">当前模型</div></div>`;
}

function updateSummary(){
  const first=history[0], last=history[history.length-1];
  document.getElementById('dataSummary').textContent = first && last ? `${history.length} 期 · ${first.date} 至 ${last.date}` : '暂无数据';
}

function setupInputs(){
  const box=document.getElementById('numberInputs');
  box.innerHTML='';
  for(let i=0;i<7;i++){ const inp=document.createElement('input'); inp.inputMode='numeric'; inp.maxLength=1; inp.id='digit'+i; inp.placeholder=String(i+1); inp.addEventListener('input',()=>{ inp.value=inp.value.replace(/\D/g,'').slice(-1); if(inp.value && i<6) document.getElementById('digit'+(i+1)).focus();}); box.appendChild(inp); }
}

function addResult(){
  const issue=document.getElementById('issueInput').value.trim();
  const date=document.getElementById('dateInput').value;
  const digits=[0,1,2,3,4,5,6].map(i=>document.getElementById('digit'+i).value);
  const msg=document.getElementById('saveMessage');
  if(!/^\d{7}$/.test(issue)){msg.textContent='请输入7位期号。';return;}
  if(!date){msg.textContent='请选择开奖日期。';return;}
  if(digits.some(d=>d==='')){msg.textContent='请完整输入7位开奖号码。';return;}
  if(history.some(r=>r.issue===issue)){msg.textContent='这个期号已经存在。';return;}
  history.push({issue,date,digits:digits.map(Number)});
  history.sort((a,b)=>Number(a.issue)-Number(b.issue));
  save(); predict();
  msg.textContent=`已保存 ${issue}：${digits.join('')}，模型已重新计算。`;
}

function exportCSV(){
  const lines=['issue,date,d1,d2,d3,d4,d5,d6,d7',...history.map(r=>[r.issue,r.date,...r.digits].join(','))];
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='lottery_history.csv'; a.click(); URL.revokeObjectURL(url);
}

document.getElementById('predictBtn').addEventListener('click',predict);
document.getElementById('saveBtn').addEventListener('click',addResult);
document.getElementById('exportBtn').addEventListener('click',exportCSV);
document.getElementById('resetBtn').addEventListener('click',()=>{ if(confirm('确定恢复到最初151期数据吗？')) reset(); });
setupInputs();
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{})); }
loadData();
