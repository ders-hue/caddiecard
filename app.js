const $=selector=>document.querySelector(selector);
const STORAGE_KEY='scoring-app-one-off-v1';
const state={course:null,players:[],hole:0,scores:[]};

function renderCourseRows(pars=Array(18).fill(4),indexes=Array.from({length:18},(_,i)=>i+1)){
  $('#courseTable tbody').innerHTML=Array.from({length:18},(_,i)=>`<tr><td>${i+1}</td><td><input type="number" inputmode="numeric" min="3" max="6" value="${pars[i]??''}" data-par="${i}" aria-label="Par for hole ${i+1}"></td><td><input type="number" inputmode="numeric" min="1" max="18" value="${indexes[i]??''}" data-si="${i}" aria-label="Stroke index for hole ${i+1}"></td></tr>`).join('');
}

function showScreen(name){['course','players','score'].forEach(id=>$(`#${id}Screen`).classList.toggle('hidden',id!==name))}
function coursePar(){return state.course.pars.reduce((a,b)=>a+b,0)}
function courseHandicap(index){return Math.round(index*(state.course.slope/113)+(state.course.rating-coursePar()))}
function strokesOnHole(handicap,strokeIndex){if(handicap>=0)return Math.floor(handicap/18)+(strokeIndex<=handicap%18?1:0);const plus=Math.abs(handicap);return -(Math.floor(plus/18)+(strokeIndex<=plus%18?1:0))}
function pointsFor(gross,player,hole){if(!gross)return null;const net=gross-strokesOnHole(player.courseHandicap,state.course.indexes[hole]);return Math.max(0,2+(state.course.pars[hole]-net))}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}

renderCourseRows();
$('#takePhoto').addEventListener('click',()=>$('#scorecardPhoto').click());
$('#scorecardPhoto').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  const preview=$('#photoPreview');preview.src=URL.createObjectURL(file);preview.classList.remove('hidden');
  const status=$('#scanStatus');
  if(!('TextDetector' in window)){status.textContent='Photo captured. Automatic text recognition is not available in this browser, so check the details below against the photograph.';return}
  status.textContent='Looking for course details…';
  try{
    const bitmap=await createImageBitmap(file),blocks=await new TextDetector().detect(bitmap),numbers=blocks.flatMap(block=>(block.rawValue.match(/\b(?:[1-9]|1[0-8])\b/g)||[]).map(Number));
    status.textContent=numbers.length?'Text found. Please check every par and stroke index below before continuing.':'No reliable rows were found. Enter the course details below while viewing the photograph.';
  }catch{status.textContent='The photograph could not be read automatically. Enter the course details below while viewing it.'}
});

$('#confirmCourse').addEventListener('click',()=>{
  const name=$('#courseName').value.trim(),tee=$('#teeName').value.trim(),slope=Number($('#slopeRating').value),rating=Number($('#courseRating').value),pars=[...document.querySelectorAll('[data-par]')].map(i=>Number(i.value)),indexes=[...document.querySelectorAll('[data-si]')].map(i=>Number(i.value)),error=$('#courseError');
  if(!name||!tee){error.textContent='Enter the course name and selected tee.';return}
  if(!Number.isFinite(rating)||rating<40||rating>90||!Number.isInteger(slope)||slope<55||slope>155){error.textContent='Check the Course Rating and Slope Rating.';return}
  if(pars.some(v=>!Number.isInteger(v)||v<3||v>6)){error.textContent='Each hole needs a par from 3 to 6.';return}
  if([...indexes].sort((a,b)=>a-b).some((v,i)=>v!==i+1)){error.textContent='Stroke indexes must use every number from 1 to 18 exactly once.';return}
  state.course={name,tee,slope,rating,pars,indexes};error.textContent='';renderPlayers();showScreen('players');save();
});

function addPlayer(player={name:'',index:''}){if(state.players.length>=4)return;state.players.push({...player,courseHandicap:null});renderPlayers()}
function renderPlayers(){
  $('#selectedCourse').textContent=`${state.course.name} · ${state.course.tee} tees · Par ${coursePar()} · Slope ${state.course.slope}`;
  $('#playerRows').innerHTML=state.players.map((player,i)=>`<article class="player-row"><span class="player-number">${i+1}</span><label>Name<input value="${player.name}" data-player-name="${i}" maxlength="40" autocomplete="off"></label><label>WHS Index<input type="number" inputmode="decimal" min="-10" max="54" step="0.1" value="${player.index}" data-player-index="${i}"></label><button class="remove-player" data-remove-player="${i}" aria-label="Remove player">×</button><p class="handicap-result" data-handicap-result="${i}">${player.courseHandicap==null?'Enter a Handicap Index':`Course Handicap: ${player.courseHandicap}`}</p></article>`).join('');
  $('#addPlayer').disabled=state.players.length>=4;
}
$('#addPlayer').addEventListener('click',()=>addPlayer());
$('#playerRows').addEventListener('input',event=>{const i=Number(event.target.dataset.playerName??event.target.dataset.playerIndex);if(!Number.isInteger(i))return;if(event.target.matches('[data-player-name]'))state.players[i].name=event.target.value;else{state.players[i].index=event.target.value;const value=Number(event.target.value);state.players[i].courseHandicap=event.target.value!==''&&value>=-10&&value<=54?courseHandicap(value):null;const result=document.querySelector(`[data-handicap-result="${i}"]`);if(result)result.textContent=state.players[i].courseHandicap==null?'Enter a Handicap Index':`Course Handicap: ${state.players[i].courseHandicap}`}});
$('#playerRows').addEventListener('click',event=>{const button=event.target.closest('[data-remove-player]');if(!button)return;state.players.splice(Number(button.dataset.removePlayer),1);renderPlayers()});
$('#backToCourse').addEventListener('click',()=>showScreen('course'));
$('#startRound').addEventListener('click',()=>{const error=$('#playerError');if(!state.players.length){error.textContent='Add at least one player.';return}if(state.players.some(p=>!p.name.trim()||p.courseHandicap==null)){error.textContent='Enter a name and valid WHS Handicap Index for every player.';return}state.players.forEach(p=>p.name=p.name.trim());state.scores=state.players.map(()=>Array(18).fill(null));state.hole=0;error.textContent='';renderScore();showScreen('score');save()});

function renderScore(){
  const h=state.hole;$('#holeCounter').textContent=`HOLE ${h+1} OF 18`;$('#holeTitle').textContent=`Hole ${h+1}`;$('#holeDetails').textContent=`Par ${state.course.pars[h]} · Stroke index ${state.course.indexes[h]}`;
  $('#scorePlayers').innerHTML=state.players.map((p,i)=>{const gross=state.scores[i][h],strokes=strokesOnHole(p.courseHandicap,state.course.indexes[h]),points=pointsFor(gross,p,h);return `<article class="score-player"><div class="score-player-head"><div><h2>${p.name}</h2><span class="score-player-meta">CH ${p.courseHandicap} · ${strokes>0?`${strokes} stroke${strokes===1?'':'s'}`:strokes<0?`gives ${Math.abs(strokes)} stroke${strokes===-1?'':'s'}`:'no stroke'}</span></div><span class="score-player-meta">Total ${state.scores[i].reduce((sum,score,hole)=>sum+(pointsFor(score,p,hole)||0),0)} pts</span></div><div class="score-controls"><button data-change="-1" data-player="${i}">−</button><div class="gross-value"><strong>${gross??'–'}</strong><small>Gross score</small></div><button data-change="1" data-player="${i}">+</button></div><div class="points">${points==null?'Enter score':`${points} Stableford point${points===1?'':'s'}`}</div></article>`}).join('');
  $('#previousHole').disabled=h===0;$('#nextHole').textContent=h===17?'Review round':'Next →';
  $('#holeDots').innerHTML=Array.from({length:18},(_,i)=>`<button class="hole-dot ${i===h?'active':''} ${state.scores.every(scores=>scores[i]!=null)?'scored':''}" data-hole="${i}">${i+1}</button>`).join('');
}
$('#scorePlayers').addEventListener('click',event=>{const button=event.target.closest('[data-change]');if(!button)return;const p=Number(button.dataset.player),change=Number(button.dataset.change),current=state.scores[p][state.hole];state.scores[p][state.hole]=Math.max(1,(current??(change>0?0:2))+change);renderScore();save()});
$('#previousHole').addEventListener('click',()=>{if(state.hole>0){state.hole--;renderScore();save()}});
$('#nextHole').addEventListener('click',()=>{if(state.hole<17){state.hole++;renderScore();save()}else $('#finishDialog').showModal()});
$('#holeDots').addEventListener('click',event=>{const button=event.target.closest('[data-hole]');if(!button)return;state.hole=Number(button.dataset.hole);renderScore();save()});
$('#finishRound').addEventListener('click',()=>$('#finishDialog').showModal());
$('#cancelFinish').addEventListener('click',()=>$('#finishDialog').close());
function clearRound(){localStorage.removeItem(STORAGE_KEY);location.reload()}
$('#confirmFinish').addEventListener('click',clearRound);
$('#resetApp').addEventListener('click',()=>{if(confirm('Clear this one-off round and start again?'))clearRound()});

try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(saved?.course){Object.assign(state,saved);if(state.scores?.length){renderScore();showScreen('score')}else{renderPlayers();showScreen('players')}}else addPlayer()}catch{addPlayer()}
