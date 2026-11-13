const el = id => document.getElementById(id)
const fmt = new Intl.NumberFormat('ru')
const colors = ['#006594','#8b3d83','#146f62','#a4471b','#4f5bb5']
const escape = value => String(value).replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]))
const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']

function plot(id, keys, lines, label, selected) {
  if (!keys.length || !lines.some(line => Object.keys(line.values).length)) {
    el(id).textContent = 'За этот период данных пока нет.'
    return
  }
  const maximum = Math.max(1, ...lines.flatMap(line => Object.values(line.values)))
  const step = Math.ceil(maximum / 4)
  const x = i => 70 + i * 840 / Math.max(1, keys.length - 1)
  const y = n => 255 - n / (step * 4) * 220
  const grid = Array.from({length:5}, (_, i) => {
    const yy = y(i * step)
    return `<line x1="70" x2="910" y1="${yy}" y2="${yy}" stroke="#dbe5eb"/><text x="64" y="${yy+4}" text-anchor="end">${fmt.format(i*step)}</text>`
  }).join('')
  const ticks = keys.map((key,i) => i % Math.ceil(keys.length / 12) === 0 ? `<text x="${x(i)}" y="280" text-anchor="middle">${label(key)}</text>` : '').join('')
  const paths = lines.map(line => {
    let connected = false
    const path = keys.map((key,i) => {
      const n = line.values[key]
      if (n == null) { connected = false; return '' }
      const point = `${connected?'L':'M'}${x(i)},${y(n)}`
      connected = true
      return point
    }).join(' ')
    const points = keys.map((key,i) => {
      const n = line.values[key]
      return n == null ? '' : `<circle cx="${x(i)}" cy="${y(n)}" r="${key===selected?7:4}" fill="${line.color}"><title>${escape(line.name)} · ${key} · ${fmt.format(n)}</title></circle>`
    }).join('')
    return `<path d="${path}" fill="none" stroke="${line.color}" stroke-width="3" ${line.dash?'stroke-dasharray="7 5"':''}/>${points}`
  }).join('')
  el(id).innerHTML = `<svg viewBox="0 0 940 295" role="img" aria-label="Частотность запросов" font-size="13" fill="#425f70">${grid}${ticks}${paths}</svg>`
}

async function start() {
  const response = await fetch('data.json', {cache:'no-cache'})
  if (!response.ok) return
  const {series, updated} = await response.json()
  const dates = [...new Set(series.flatMap(s => Object.keys(s.monthly)))].sort()
  const last = dates.at(-1)
  const year = Number(last.slice(0,4))
  const prior = year - 1
  el('status').textContent = 'Обновлено ' + new Date(updated).toLocaleString('ru', {timeZone:'Europe/Moscow'}) + ' по Москве. Последний месяц: ' + last.slice(0,7)
  el('prior').textContent = prior
  el('current').textContent = year
  el('years').textContent = `Пунктир — ${prior}, сплошная линия — ${year}.`
  el('filters').insertAdjacentHTML('beforeend', series.map((s,i) => `<label><input type="checkbox" checked style="accent-color:${colors[i]}">${escape(s.phrase)}</label>`).join(''))
  const monthKeys = months.map((_,i) => String(i+1).padStart(2,'0'))
  const selectYear = (values,y) => Object.fromEntries(Object.entries(values).filter(([d]) => d.startsWith(y+'-')).map(([d,n]) => [d.slice(5,7),n]))
  function monthly() {
    const yoy = el('mode').value === 'yoy'
    el('years').hidden = !yoy
    const inputs = el('filters').querySelectorAll('input')
    const lines = series.flatMap((s,i) => {
      if (!inputs[i].checked) return []
      const line = {name:s.phrase,color:colors[i],values:s.monthly}
      return yoy ? [prior,year].map(y=>({...line,name:s.phrase+' · '+y,values:selectYear(s.monthly,y),dash:y===prior})) : [line]
    })
    plot('graph', yoy?monthKeys:dates, lines, key=>yoy?months[+key-1]:months[+key.slice(5,7)-1]+' '+key.slice(2,4))
  }
  el('mode').onchange = monthly
  el('filters').onchange = monthly
  monthly()
  const monthPicker = el('compareMonths')
  const available = monthKeys.filter(key => series.some(s =>
    selectYear(s.monthly, prior)[key] != null && selectYear(s.monthly, year)[key] != null
  ))
  const fullMonths = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
  monthPicker.insertAdjacentHTML('beforeend', available.map(key =>
    `<label><input type="checkbox" value="${key}" checked>${fullMonths[Number(key)-1]}</label>`
  ).join(''))
  function compareMonths() {
    const selected = Array.from(monthPicker.querySelectorAll('input:checked'), input => input.value)
    el('compareCaption').textContent = selected.length ? 'Число запросов за выбранные месяцы' : 'Выберите хотя бы один месяц'
    el('rows').innerHTML = series.map(s => {
      const a = selectYear(s.monthly,prior), b = selectYear(s.monthly,year)
      const common = selected.filter(key=>a[key]!=null && b[key]!=null)
      const total = values => common.reduce((sum,key)=>sum+values[key],0)
      const before = total(a), after = total(b)
      const change = before ? new Intl.NumberFormat('ru',{style:'percent',signDisplay:'exceptZero',maximumFractionDigits:1}).format(after/before-1) : '—'
      return `<tr><th scope="row">${escape(s.phrase)}</th><td>${common.length?fmt.format(before):'—'}</td><td>${common.length?fmt.format(after):'—'}</td><td>${change}</td></tr>`
    }).join('')
  }
  monthPicker.onchange = compareMonths
  compareMonths()
  el('dailyPhrase').innerHTML = series.map((s,i)=>`<option value="${i}">${escape(s.phrase)}</option>`).join('')
  function daily(reset) {
    const i = Number(el('dailyPhrase').value)
    const s = series[i]
    const keys = Object.keys(s.daily).sort().slice(-30)
    if (reset) {
      el('dailyDate').innerHTML = keys.map(key=>`<option>${key}</option>`).join('')
      if (keys.length) el('dailyDate').value = keys.at(-1)
    }
    const day = el('dailyDate').value
    const priorDate = key => (Number(key.slice(0,4))-1)+key.slice(4)
    const previous = Object.fromEntries(keys.filter(key=>s.daily[priorDate(key)]!=null).map(key=>[key,s.daily[priorDate(key)]]))
    const current = Object.fromEntries(keys.map(key=>[key,s.daily[key]]))
    el('dailyValue').textContent = day ? `${day} · ${fmt.format(current[day])} запросов. Годом ранее: ${previous[day]==null?'нет данных':fmt.format(previous[day])}.` : ''
    plot('dailyGraph',keys,[{name:s.phrase+' · годом ранее',color:colors[i],values:previous,dash:true},{name:s.phrase,color:colors[i],values:current}], key=>key.slice(8)+'.'+key.slice(5,7),day)
  }
  el('dailyPhrase').onchange = ()=>daily(true)
  el('dailyDate').onchange = ()=>daily(false)
  daily(true)
}
start().catch(()=>{el('status').textContent = 'Данные отчёта пока недоступны.'})
