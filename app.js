const $=selector=>document.querySelector(selector);
const STORAGE_KEY='caddiecard-one-off-v1';
const LEGACY_STORAGE_KEY='scoring-app-one-off-v1';
const NO_SCORE=99;
const state={course:null,players:[],hole:0,scores:[]};

function renderCourseRows(pars=Array(18).fill(4),indexes=Array.from({length:18},(_,i)=>i+1)){
  $('#courseTable tbody').innerHTML=Array.from({length:18},(_,i)=>`<tr><td>${i+1}</td><td><input type="number" inputmode="numeric" min="3" max="6" value="${pars[i]??''}" data-par="${i}" aria-label="Par for hole ${i+1}"></td><td><input type="number" inputmode="numeric" min="1" max="18" value="${indexes[i]??''}" data-si="${i}" aria-label="Stroke index for hole ${i+1}"></td></tr>`).join('');
}

function showScreen(name){['course','players','score'].forEach(id=>$(`#${id}Screen`).classList.toggle('hidden',id!==name))}
function coursePar(){return state.course.pars.reduce((a,b)=>a+b,0)}
function courseHandicap(index){return Math.round(index*(state.course.slope/113)+(state.course.rating-coursePar()))}
function strokesOnHole(handicap,strokeIndex){if(handicap>=0)return Math.floor(handicap/18)+(strokeIndex<=handicap%18?1:0);const plus=Math.abs(handicap);return -(Math.floor(plus/18)+(strokeIndex<=plus%18?1:0))}
function pointsFor(gross,player,hole){if(gross==null)return null;if(gross===NO_SCORE)return 0;const net=gross-strokesOnHole(player.courseHandicap,state.course.indexes[hole]);return Math.max(0,2+(state.course.pars[hole]-net))}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}

let ocrLibraryPromise;
function loadOcrLibrary(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(ocrLibraryPromise)return ocrLibraryPromise;
  ocrLibraryPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js';
    script.crossOrigin='anonymous';
    script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error('OCR library unavailable'));
    script.onerror=()=>reject(new Error('OCR library failed to load'));
    document.head.appendChild(script);
  });
  return ocrLibraryPromise;
}

function scorecardRowsFromText(text){
  const rows=new Map();
  for(const line of text.split(/\r?\n/)){
    const values=(line.match(/\d+(?:\.\d+)?/g)||[]).map(Number);
    const hole=values[0];
    if(!Number.isInteger(hole)||hole<1||hole>18)continue;
    const possibleIndexes=values.slice(1).filter(value=>Number.isInteger(value)&&value>=1&&value<=18);
    const strokeIndex=possibleIndexes.at(-1);
    const par=values.slice(1,-1).reverse().find(value=>Number.isInteger(value)&&value>=3&&value<=6);
    if(par&&strokeIndex)rows.set(hole,{par,strokeIndex});
  }
  return rows;
}

function wordsFromBlocks(blocks=[]){
  return blocks.flatMap(block=>(block.paragraphs||[]).flatMap(paragraph=>(paragraph.lines||[]).flatMap(line=>line.words||[])));
}

function scorecardRowsFromWords(words){
  const numeric=words.map(word=>{
    const cleaned=word.text.trim().replace(/[|Il]/g,'1').replace(/[^\d.]/g,'');
    return {...word,value:/^\d+(?:\.\d+)?$/.test(cleaned)?Number(cleaned):NaN};
  }).filter(word=>Number.isFinite(word.value)&&word.bbox);
  if(!numeric.length)return new Map();
  const pageWidth=Math.max(...numeric.map(word=>word.bbox.x1));
  const candidates=numeric.filter(word=>Number.isInteger(word.value)&&word.value>=1&&word.value<=18);
  const columns=[];
  for(const word of candidates){
    const x=(word.bbox.x0+word.bbox.x1)/2;
    let column=columns.find(item=>Math.abs(item.x-x)<pageWidth*.025);
    if(!column){column={x,words:[]};columns.push(column)}
    column.words.push(word);column.x=column.words.reduce((sum,item)=>sum+(item.bbox.x0+item.bbox.x1)/2,0)/column.words.length;
  }
  const holeColumn=columns
    .filter(column=>new Set(column.words.map(word=>word.value)).size>=6)
    .sort((a,b)=>a.x-b.x)[0];
  if(!holeColumn)return new Map();
  const rows=new Map();
  for(const holeWord of holeColumn.words.sort((a,b)=>a.value-b.value)){
    const hole=holeWord.value;if(rows.has(hole))continue;
    const y=(holeWord.bbox.y0+holeWord.bbox.y1)/2;
    const height=Math.max(10,holeWord.bbox.y1-holeWord.bbox.y0);
    const row=numeric.filter(word=>{
      const wordY=(word.bbox.y0+word.bbox.y1)/2;
      return Math.abs(wordY-y)<=height*.8&&word.bbox.x0>holeWord.bbox.x1;
    }).sort((a,b)=>a.bbox.x0-b.bbox.x0);
    const strokePosition=[...row].reverse().findIndex(word=>Number.isInteger(word.value)&&word.value>=1&&word.value<=18);
    if(strokePosition<0)continue;
    const strokeWord=row[row.length-1-strokePosition];
    const par=[...row.filter(word=>word.bbox.x0<strokeWord.bbox.x0)].reverse().find(word=>Number.isInteger(word.value)&&word.value>=3&&word.value<=6);
    if(par)rows.set(hole,{par:par.value,strokeIndex:strokeWord.value});
  }
  return rows;
}

function prepareOcrImage(file){
  return new Promise((resolve,reject)=>{
    const image=new Image(),url=URL.createObjectURL(file);
    image.onload=()=>{
      const scale=Math.min(3,2400/image.naturalWidth);
      const canvas=document.createElement('canvas');
      canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
      const context=canvas.getContext('2d',{willReadFrequently:true});
      context.drawImage(image,0,0,canvas.width,canvas.height);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height);
      for(let i=0;i<pixels.data.length;i+=4){
        const gray=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2];
        const contrasted=Math.max(0,Math.min(255,(gray-128)*1.65+150));
        pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=contrasted;
      }
      context.putImageData(pixels,0,0);URL.revokeObjectURL(url);resolve(canvas);
    };
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Image could not be prepared'))};
    image.src=url;
  });
}

function cropCanvas(source,top,height){
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=Math.round(source.height*height);
  canvas.getContext('2d').drawImage(source,0,Math.round(source.height*top),source.width,canvas.height,0,0,canvas.width,canvas.height);
  return canvas;
}

function applyRecognizedText(text,blocks,previousRows=new Map()){
  const textRows=scorecardRowsFromText(text),positionedRows=scorecardRowsFromWords(wordsFromBlocks(blocks));
  const newRows=positionedRows.size>=textRows.size?positionedRows:textRows;
  const rows=new Map(previousRows);for(const [hole,row] of newRows)rows.set(hole,row);
  const recognized=[...rows.values()];
  const hasCompleteCard=rows.size===18&&new Set(recognized.map(row=>row.strokeIndex)).size===18;
  for(const [hole,row] of rows){
    document.querySelector(`[data-par="${hole-1}"]`).value=row.par;
    document.querySelector(`[data-si="${hole-1}"]`).value=row.strokeIndex;
  }
  const slopeMatch=text.match(/slope(?:\s+rating)?\D{0,12}(\d{2,3})/i);
  const ratingMatch=text.match(/(?:course\s+)?rating\D{0,12}(\d{2}(?:\.\d)?)/i);
  if(slopeMatch&&Number(slopeMatch[1])>=55&&Number(slopeMatch[1])<=155)$('#slopeRating').value=slopeMatch[1];
  if(ratingMatch&&Number(ratingMatch[1])>=40&&Number(ratingMatch[1])<=90)$('#courseRating').value=ratingMatch[1];
  return {rows,rowCount:rows.size,hasCompleteCard};
}

const COURSE_API='https://caddiecard-api.ders-c54.workers.dev';
const FAVOURITES_KEY='caddiecard-favourite-clubs-v1';
const LEGACY_FAVOURITES_KEY='scoring-app-favourite-clubs-v1';
let selectedClub=null,searchTimer=null,searchRequest=0;

function favourites(){
  try{const saved=JSON.parse(localStorage.getItem(FAVOURITES_KEY)||localStorage.getItem(LEGACY_FAVOURITES_KEY));if(saved&&!localStorage.getItem(FAVOURITES_KEY))saveFavourites(saved);return saved||[]}catch{return []}
}
function saveFavourites(clubs){localStorage.setItem(FAVOURITES_KEY,JSON.stringify(clubs))}
function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
async function golfApi(path){
  const response=await fetch(`${COURSE_API}${path}`);
  if(!response.ok)throw new Error(response.status===429?'The course service request limit has been reached.':'Course information could not be loaded.');
  const payload=await response.json();return payload.data??payload;
}
function clubButton(club){
  const place=[club.city,club.county,club.postcode].filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index).join(' · ');
  return `<button class="club-choice" data-club-id="${escapeHtml(club.id)}"><span><strong>${escapeHtml(club.name)}</strong><small>${escapeHtml(place)}</small></span><span class="choice-arrow">›</span></button>`;
}
function renderFavourites(){
  const clubs=favourites(),section=$('#favouritesSection');section.classList.toggle('hidden',!clubs.length);
  $('#favouriteClubs').innerHTML=clubs.map(clubButton).join('');
}
function renderSearchResults(clubs){
  $('#searchSection').classList.remove('hidden');
  $('#clubResults').innerHTML=clubs.length?clubs.map(clubButton).join(''):'<p class="status">No matching golf clubs were found.</p>';
}
async function searchClubs(query){
  const request=++searchRequest;$('#clubStatus').textContent='Searching…';
  try{
    const payload=await golfApi(`/clubs?search=${encodeURIComponent(query)}`);if(request!==searchRequest)return;
    const clubs=Array.isArray(payload)?payload:(payload.clubs||[]);renderSearchResults(clubs);$('#clubStatus').textContent=`${clubs.length} club${clubs.length===1?'':'s'} found.`;
  }catch(error){if(request===searchRequest)$('#clubStatus').textContent=error.message}
}
function updateFavouriteButton(){
  const active=selectedClub&&favourites().some(club=>club.id===selectedClub.id),button=$('#toggleFavourite');
  button.classList.toggle('active',Boolean(active));button.textContent=active?'★':'☆';button.setAttribute('aria-label',active?'Remove club from favourites':'Add club to favourites');
}
function normaliseCourses(payload){return Array.isArray(payload)?payload:(payload.courses?payload.courses:[payload])}
async function selectClub(id){
  const known=[...favourites()];document.querySelectorAll(`[data-club-id="${CSS.escape(id)}"]`).forEach(button=>{const strong=button.querySelector('strong');if(strong)known.push({id,name:strong.textContent})});
  selectedClub=known.find(club=>club.id===id)||{id,name:'Selected golf club'};
  $('#selectedClubName').textContent=selectedClub.name;$('#teeSection').classList.remove('hidden');$('#teeChoices').innerHTML='<p class="status">Loading courses and tees…</p>';updateFavouriteButton();
  $('#teeSection').scrollIntoView({behavior:'smooth',block:'start'});
  try{
    const summary=normaliseCourses(await golfApi(`/clubs/${encodeURIComponent(id)}/courses`));
    const courses=await Promise.all(summary.filter(course=>course?.id).map(course=>golfApi(`/courses/${encodeURIComponent(course.id)}`)));
    renderTeeChoices(courses);
  }catch(error){$('#teeChoices').innerHTML=`<p class="validation">${escapeHtml(error.message)}</p>`}
}
function teeColour(colour){
  const safe={white:'#fff',yellow:'#f3d638',red:'#d94b43',blue:'#4c7edb',black:'#222',green:'#4d9b57',orange:'#ef963c',purple:'#8c5db5'};
  return safe[String(colour||'').toLowerCase()]||'#ddd';
}
function renderTeeChoices(courses){
  const groups=courses.map(course=>{
    const tees=(course.tee_sets||[]).filter(tee=>tee.holes?.length===18);
    return `<section class="course-group"><h3>${escapeHtml(course.name||selectedClub.name)}</h3>${tees.map(tee=>`<button class="tee-choice" data-course-id="${escapeHtml(course.id)}" data-tee-id="${escapeHtml(tee.id)}"><span><strong>${escapeHtml(tee.name)} tees</strong><small>${escapeHtml(tee.gender||'')} · Par ${tee.par} · Rating ${tee.course_rating} · Slope ${tee.slope_rating}</small></span><span class="tee-colour" style="--tee-colour:${teeColour(tee.colour)}"></span></button>`).join('')||'<p class="status">No complete tee data is available for this course.</p>'}</section>`;
  }).join('');
  $('#teeChoices').innerHTML=groups||'<p class="validation">No complete tee data is available for this club.</p>';
  $('#teeChoices')._courses=courses;
}
function selectTee(courseId,teeId){
  const course=($('#teeChoices')._courses||[]).find(item=>item.id===courseId),tee=course?.tee_sets?.find(item=>item.id===teeId);if(!course||!tee)return;
  $('#courseName').value=selectedClub.name;$('#teeName').value=course.name&&course.name!==selectedClub.name?`${course.name} · ${tee.name}`:tee.name;
  $('#slopeRating').value=tee.slope_rating;$('#courseRating').value=tee.course_rating;
  for(const hole of tee.holes){
    const index=hole.hole_number-1,par=document.querySelector(`[data-par="${index}"]`),stroke=document.querySelector(`[data-si="${index}"]`);
    if(par)par.value=hole.par;if(stroke)stroke.value=hole.stroke_index;
  }
  $('#courseError').textContent='';document.querySelector('.form-card').scrollIntoView({behavior:'smooth',block:'start'});
}

renderCourseRows();
renderFavourites();
$('#clubSearch').addEventListener('input',event=>{clearTimeout(searchTimer);const query=event.target.value.trim();if(query.length<2){$('#clubStatus').textContent='Enter at least two characters.';$('#searchSection').classList.add('hidden');return}searchTimer=setTimeout(()=>searchClubs(query),350)});
$('#clubSearch').addEventListener('search',event=>{if(!event.target.value){$('#searchSection').classList.add('hidden');$('#clubStatus').textContent='Enter at least two characters.'}});
document.querySelector('.club-picker').addEventListener('click',event=>{const club=event.target.closest('[data-club-id]'),tee=event.target.closest('[data-tee-id]');if(club)selectClub(club.dataset.clubId);else if(tee)selectTee(tee.dataset.courseId,tee.dataset.teeId)});
$('#toggleFavourite').addEventListener('click',()=>{if(!selectedClub)return;const clubs=favourites(),index=clubs.findIndex(club=>club.id===selectedClub.id);if(index>=0)clubs.splice(index,1);else clubs.unshift({id:selectedClub.id,name:selectedClub.name});saveFavourites(clubs);renderFavourites();updateFavouriteButton()});

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

let selectedPlayer=0,swipeStartX=0,swipeStartY=0,suppressPlayerClickUntil=0;
function holeComplete(hole=state.hole){return state.scores.every(scores=>scores[hole]!=null)}
function completedHoleCount(){return Array.from({length:18},(_,hole)=>holeComplete(hole)).filter(Boolean).length}
function firstIncompleteHole(){const hole=Array.from({length:18},(_,i)=>i).find(i=>!holeComplete(i));return hole??17}
function renderScore(){
  const h=state.hole,complete=completedHoleCount();$('#holeCounter').textContent=`HOLE ${h+1} OF 18`;$('#holeTitle').textContent=`Hole ${h+1}`;$('#holeDetails').textContent=`Par ${state.course.pars[h]} · Stroke index ${state.course.indexes[h]}`;$('#completedHoles').textContent=`${complete}/18`;$('#scoreProgress').style.width=`${complete/18*100}%`;
  $('#scorePlayers').innerHTML=state.players.map((player,i)=>{const gross=state.scores[i][h],strokes=strokesOnHole(player.courseHandicap,state.course.indexes[h]),points=pointsFor(gross,player,h),total=state.scores[i].reduce((sum,score,hole)=>sum+(pointsFor(score,player,hole)||0),0);return `<button class="score-player ${gross!=null?'complete':''} ${i===selectedPlayer?'selected':''}" data-player="${i}"><span><span class="score-player-name">${escapeHtml(player.name)}</span><span class="score-player-detail">CH ${player.courseHandicap} · ${strokes>0?`${strokes} stroke${strokes===1?'':'s'}`:strokes<0?`gives ${Math.abs(strokes)}`:'no stroke'} · Total ${total} pts</span></span><span class="score-gross"><strong>${gross===NO_SCORE?'NS':gross??'—'}</strong><small>Gross</small></span><span class="score-points"><strong>${points??'—'}</strong><small>Points</small></span></button>`}).join('');
  const limit=firstIncompleteHole();$('#holeDots').innerHTML=Array.from({length:18},(_,i)=>`<button class="hole-dot ${i===h?'active':''} ${holeComplete(i)?'scored':''} ${i>limit?'blocked':''}" data-hole="${i}" aria-disabled="${i>limit}">${i+1}</button>`).join('');
}
const scoreEntryDialog=$('#scoreEntryDialog');
function updateRecordedScore(){const score=state.scores[selectedPlayer]?.[state.hole];document.querySelectorAll('#scoreKeypad button').forEach(key=>{const recorded=score===NO_SCORE?key.hasAttribute('data-no-score'):key.dataset.score===String(score);key.classList.toggle('recorded',recorded);key.setAttribute('aria-pressed',String(recorded))})}
function openScoreEntry(){const player=state.players[selectedPlayer];$('#keypadPlayer').textContent=player.name;$('#scoreEntryHole').textContent=`HOLE ${state.hole+1} · PAR ${state.course.pars[state.hole]}`;updateRecordedScore();scoreEntryDialog.showModal()}
function closeScoreEntry(){if(scoreEntryDialog.open)scoreEntryDialog.close()}
function setGrossScore(gross){state.scores[selectedPlayer][state.hole]=gross;save();closeScoreEntry();const missing=state.scores.findIndex(scores=>scores[state.hole]==null);if(missing>=0)selectedPlayer=missing;renderScore();$('#scoreError').textContent=''}
$('#scorePlayers').addEventListener('click',event=>{if(Date.now()<suppressPlayerClickUntil)return;const player=event.target.closest('[data-player]');if(!player)return;selectedPlayer=Number(player.dataset.player);renderScore();openScoreEntry()});
$('#scoreKeypad').addEventListener('click',event=>{const key=event.target.closest('button');if(!key)return;if(key.dataset.score)setGrossScore(Number(key.dataset.score));else if(key.hasAttribute('data-no-score'))setGrossScore(NO_SCORE)});
$('#closeScoreEntry').addEventListener('click',closeScoreEntry);scoreEntryDialog.addEventListener('cancel',event=>{event.preventDefault();closeScoreEntry()});
function blockedAdvance(){if(holeComplete())return false;$('#scoreError').textContent='Enter a score for every player before moving to the next hole.';return true}
function moveHole(change){if(change>0&&blockedAdvance())return;if(change>0&&state.hole===17){$('#finishDialog').showModal();return}state.hole=Math.max(0,Math.min(17,state.hole+change));selectedPlayer=Math.max(0,state.scores.findIndex(scores=>scores[state.hole]==null));$('#scoreError').textContent='';renderScore();save()}
$('#holeDots').addEventListener('click',event=>{const button=event.target.closest('[data-hole]');if(!button)return;const target=Number(button.dataset.hole);if(target>firstIncompleteHole()){blockedAdvance();return}state.hole=target;selectedPlayer=Math.max(0,state.scores.findIndex(scores=>scores[state.hole]==null));$('#scoreError').textContent='';renderScore();save()});
$('#scoreScreen').addEventListener('touchstart',event=>{const touch=event.touches[0];swipeStartX=touch.clientX;swipeStartY=touch.clientY},{passive:true});
$('#scoreScreen').addEventListener('touchend',event=>{const touch=event.changedTouches[0],dx=touch.clientX-swipeStartX,dy=touch.clientY-swipeStartY;if(Math.abs(dx)<55||Math.abs(dx)<Math.abs(dy)*1.3)return;suppressPlayerClickUntil=Date.now()+500;if(dx<0)moveHole(1);else if(state.hole>0)moveHole(-1)},{passive:true});
$('#cancelFinish').addEventListener('click',()=>$('#finishDialog').close());
function clearRound(){localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(LEGACY_STORAGE_KEY);location.reload()}
$('#confirmFinish').addEventListener('click',clearRound);
$('#resetApp').addEventListener('click',()=>{if(confirm('Clear this one-off round and start again?'))clearRound()});

try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||localStorage.getItem(LEGACY_STORAGE_KEY));if(saved?.course){Object.assign(state,saved);save();if(state.scores?.length){renderScore();showScreen('score')}else{renderPlayers();showScreen('players')}}else addPlayer()}catch{addPlayer()}
