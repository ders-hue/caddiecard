const $=selector=>document.querySelector(selector);
if('scrollRestoration' in history)history.scrollRestoration='manual';
const STORAGE_KEY='caddiecard-one-off-v1';
const LEGACY_STORAGE_KEY='scoring-app-one-off-v1';
const SETTINGS_KEY='caddiecard-settings-v1';
const PLAYER_MEMORY_KEY='caddiecard-player-memory-v1';
const NO_SCORE=99;
const state={course:null,format:null,handicapMode:'recommended',players:[],hole:0,scores:[]};
const FORMAT_CONFIG={stableford:{name:'Stableford',players:4},fourball:{name:'4BBB',players:4},matchplay:{name:'Matchplay',players:2},fourtwenty:{name:'4-2-0',players:3}};

function renderCourseRows(pars=Array(18).fill(4),indexes=Array.from({length:18},(_,i)=>i+1)){
  $('#courseTable tbody').innerHTML=Array.from({length:18},(_,i)=>`<tr><td>${i+1}</td><td><input type="number" inputmode="numeric" min="3" max="6" value="${pars[i]??''}" data-par="${i}" aria-label="Par for hole ${i+1}"></td><td><input type="number" inputmode="numeric" min="1" max="18" value="${indexes[i]??''}" data-si="${i}" aria-label="Stroke index for hole ${i+1}"></td></tr>`).join('');
}

function showScreen(name){['course','tee','format','players','score'].forEach(id=>$(`#${id}Screen`).classList.toggle('hidden',id!==name));window.scrollTo({top:0,behavior:'auto'})}
function coursePar(){return state.course.pars.reduce((a,b)=>a+b,0)}
function courseHandicap(index){return Math.round(index*(state.course.slope/113)+(state.course.rating-coursePar()))}
function strokesOnHole(handicap,strokeIndex){if(handicap>=0)return Math.floor(handicap/18)+(strokeIndex<=handicap%18?1:0);const plus=Math.abs(handicap);return -(Math.floor(plus/18)+(strokeIndex<=plus%18?1:0))}
function pointsFor(gross,player,hole,handicap=player.courseHandicap){if(gross==null)return null;if(gross===NO_SCORE)return 0;const net=gross-strokesOnHole(handicap,state.course.indexes[hole]);return Math.max(0,2+(state.course.pars[hole]-net))}
function playerCount(){return FORMAT_CONFIG[state.format]?.players||4}
function playingHandicaps(){
  const courseHandicaps=state.players.map(player=>Number(player.courseHandicap)||0);
  if(state.format==='stableford'||state.format==='fourtwenty'||state.handicapMode==='full')return courseHandicaps;
  const lowest=Math.min(...courseHandicaps),allowance=state.format==='fourball'?0.9:1;
  return courseHandicaps.map(handicap=>Math.round((handicap-lowest)*allowance));
}
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
const GOLF_CACHE_KEY='caddiecard-golf-api-cache-v1';
const FAVOURITES_KEY='caddiecard-favourite-clubs-v1';
const LEGACY_FAVOURITES_KEY='scoring-app-favourite-clubs-v1';
const HOME_CLUB_KEY='caddiecard-home-club-v1';
let selectedClub=null,searchTimer=null,searchRequest=0,clubSelectionRequest=0;

function favourites(){
  try{const saved=JSON.parse(localStorage.getItem(FAVOURITES_KEY)||localStorage.getItem(LEGACY_FAVOURITES_KEY));if(saved&&!localStorage.getItem(FAVOURITES_KEY))saveFavourites(saved);return saved||[]}catch{return []}
}
function saveFavourites(clubs){localStorage.setItem(FAVOURITES_KEY,JSON.stringify(clubs))}
function homeClub(){try{return JSON.parse(localStorage.getItem(HOME_CLUB_KEY))}catch{return null}}
function saveHomeClub(club){if(club)localStorage.setItem(HOME_CLUB_KEY,JSON.stringify(club));else localStorage.removeItem(HOME_CLUB_KEY)}
function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
const golfApiCache=new Map(),golfApiPending=new Map();
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
function storedGolfApi(path){try{const cache=JSON.parse(localStorage.getItem(GOLF_CACHE_KEY))||{},entry=cache[path];if(!entry||entry.expires<Date.now())return null;return entry.payload}catch{return null}}
function storeGolfApi(path,payload){try{const cache=JSON.parse(localStorage.getItem(GOLF_CACHE_KEY))||{},ttl=path.startsWith('/courses/')?7*864e5:path.includes('/courses')?864e5:15*60e3;cache[path]={payload,expires:Date.now()+ttl};localStorage.setItem(GOLF_CACHE_KEY,JSON.stringify(cache))}catch{}}
async function requestGolfApi(path){
  for(let attempt=0;attempt<3;attempt++){
    const separator=path.includes('?')?'&':'?';
    const response=await fetch(`${COURSE_API}${path}${separator}_retry=${attempt}-${Date.now()}`,{cache:'no-store'});
    if(response.ok){const payload=await response.json();return payload.data??payload}
    if(response.status!==429)throw new Error('Course information could not be loaded.');
    if(attempt<2)await wait(750*(attempt+1));
  }
  throw new Error('The course service is busy. Please try again in a moment.');
}
function golfApi(path){
  if(golfApiCache.has(path))return Promise.resolve(golfApiCache.get(path));
  const stored=storedGolfApi(path);if(stored!=null){golfApiCache.set(path,stored);return Promise.resolve(stored)}
  if(golfApiPending.has(path))return golfApiPending.get(path);
  const request=requestGolfApi(path).then(payload=>{golfApiCache.set(path,payload);storeGolfApi(path,payload);return payload}).finally(()=>golfApiPending.delete(path));
  golfApiPending.set(path,request);return request;
}
function clubButton(club){
  const place=[club.city,club.county,club.postcode].filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index).join(' · ');
  return `<button class="club-choice" data-club-id="${escapeHtml(club.id)}"><span><strong>${escapeHtml(club.name)}</strong><small>${escapeHtml(place)}</small></span><svg class="choice-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>`;
}
function renderFavourites(){
  const home=homeClub(),clubs=favourites().sort((a,b)=>(b.id===home?.id)-(a.id===home?.id)),section=$('#favouritesSection'),searching=$('#clubSearch').value.trim().length>=2;section.classList.toggle('hidden',!clubs.length||searching);
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
function renderTeeLoading(){
  $('#teeChoices').innerHTML='<div class="tee-loading" role="status"><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="17"/><path d="M22 5a17 17 0 0 1 17 17"/></svg><div><strong>Finding tees and scorecards…</strong><small>This usually takes a moment.</small></div></div><div class="tee-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>';
}
function showClubDiscovery(){
  clubSelectionRequest++;selectedClub=null;showScreen('course');$('#clubSearch').value='';$('#searchSection').classList.add('hidden');$('#clubStatus').textContent='Type at least two characters.';renderFavourites();$('#clubSearch').focus();
}
function updateFavouriteButton(){
  const active=selectedClub&&favourites().some(club=>club.id===selectedClub.id),button=$('#toggleFavourite');
  button.classList.toggle('active',Boolean(active));button.setAttribute('aria-label',active?'Remove club from favourites':'Add club to favourites');
}
function updateHomeButton(){
  const active=selectedClub&&homeClub()?.id===selectedClub.id,button=$('#toggleHome');
  button.classList.toggle('active',Boolean(active));button.setAttribute('aria-label',active?'Remove as home club':'Set as home club');
}
function normaliseCourses(payload){return Array.isArray(payload)?payload:(payload.courses?payload.courses:[payload])}
async function selectClub(id,displayedName){
  const request=++clubSelectionRequest,known=[...favourites()];
  selectedClub={id,name:displayedName?.trim()||known.find(club=>club.id===id)?.name||'Selected golf club'};
  $('#selectedClubName').textContent=selectedClub.name;renderTeeLoading();updateFavouriteButton();updateHomeButton();showScreen('tee');window.scrollTo({top:0,behavior:'smooth'});
  try{
    const summary=normaliseCourses(await golfApi(`/clubs/${encodeURIComponent(id)}/courses`));if(request!==clubSelectionRequest)return;
    const courses=await Promise.all(summary.filter(course=>course?.id).map(course=>golfApi(`/courses/${encodeURIComponent(course.id)}`)));
    if(request===clubSelectionRequest)renderTeeChoices(courses);
  }catch(error){if(request===clubSelectionRequest)$('#teeChoices').innerHTML=`<p class="validation">${escapeHtml(error.message)}</p>`}
}
function teeColour(colour){
  const safe={white:'#fff',yellow:'#f3d638',red:'#d94b43',blue:'#4c7edb',black:'#222',green:'#4d9b57',orange:'#ef963c',purple:'#8c5db5'};
  return safe[String(colour||'').toLowerCase()]||'#ddd';
}
function teeMeta(tee){return [tee.gender,`Par ${tee.par}`,`Rating ${tee.course_rating}`,`Slope ${tee.slope_rating}`].filter(Boolean).join(' · ')}
function renderTeeChoices(courses){
  const groups=courses.map(course=>{
    const tees=(course.tee_sets||[]).filter(tee=>tee.holes?.length===18&&tee.name?.trim());
    return `<section class="course-group"><h3>${escapeHtml(course.name||selectedClub.name)}</h3>${tees.map(tee=>`<button class="tee-choice" data-course-id="${escapeHtml(course.id)}" data-tee-id="${escapeHtml(tee.id)}"><span><strong>${escapeHtml(tee.name.trim())} tees</strong><small>${escapeHtml(teeMeta(tee))}</small></span><span class="tee-colour" style="--tee-colour:${teeColour(tee.colour)}"></span></button>`).join('')||'<p class="status">No complete tee data is available for this course.</p>'}</section>`;
  }).join('');
  $('#teeChoices').innerHTML=groups||'<p class="validation">No complete tee data is available for this club.</p>';
  $('#teeChoices')._courses=courses;
}
function selectTee(courseId,teeId){
  const course=($('#teeChoices')._courses||[]).find(item=>item.id===courseId),tee=course?.tee_sets?.find(item=>item.id===teeId);if(!course||!tee)return;
  const holes=[...tee.holes].sort((a,b)=>a.hole_number-b.hole_number),pars=holes.map(hole=>Number(hole.par)),indexes=holes.map(hole=>Number(hole.stroke_index));
  const name=selectedClub.name,displayName=tee.name.trim(),teeName=course.name&&course.name!==selectedClub.name?`${course.name} · ${displayName}`:displayName,slope=Number(tee.slope_rating),rating=Number(tee.course_rating);
  const validIndexes=[...indexes].sort((a,b)=>a-b).every((value,index)=>value===index+1);
  if(holes.length!==18||pars.some(value=>!Number.isInteger(value)||value<3||value>6)||!validIndexes||!Number.isFinite(rating)||rating<40||rating>90||!Number.isInteger(slope)||slope<55||slope>155){$('#teeChoices').insertAdjacentHTML('beforeend','<p class="validation">This tee does not have a complete scorecard.</p>');return}
  state.course={name,tee:teeName,slope,rating,pars,indexes};state.format=null;state.handicapMode='recommended';ensurePlayerSlots();state.players.forEach(player=>{const whs=Number(player.index);if(player.index!==''&&Number.isFinite(whs)&&whs>=0&&whs<=36){const calculated=courseHandicap(whs);player.courseHandicap=calculated>=0&&calculated<=36?calculated:null}else player.courseHandicap=null});showScreen('format');save();
}

renderFavourites();
$('#clubSearch').addEventListener('input',event=>{clearTimeout(searchTimer);const query=event.target.value.trim();if(query.length<2){$('#clubStatus').textContent='Type at least two characters.';$('#searchSection').classList.add('hidden');renderFavourites();return}$('#favouritesSection').classList.add('hidden');$('#searchSection').classList.remove('hidden');$('#clubResults').innerHTML='<div class="searching-row"><span></span>Searching clubs…</div>';searchTimer=setTimeout(()=>searchClubs(query),250)});
$('#clubSearch').addEventListener('search',event=>{if(!event.target.value){$('#searchSection').classList.add('hidden');$('#clubStatus').textContent='Type at least two characters.';renderFavourites()}});
document.querySelector('.club-picker').addEventListener('click',event=>{const club=event.target.closest('[data-club-id]');if(club)selectClub(club.dataset.clubId,club.querySelector('strong')?.textContent)});
$('#teeChoices').addEventListener('click',event=>{const tee=event.target.closest('[data-tee-id]');if(tee)selectTee(tee.dataset.courseId,tee.dataset.teeId)});
$('#changeClub').addEventListener('click',showClubDiscovery);
$('#backToTees').addEventListener('click',()=>showScreen('tee'));
document.querySelector('.format-list').addEventListener('click',event=>{const button=event.target.closest('[data-format]');if(!button)return;state.format=button.dataset.format;state.handicapMode='recommended';ensurePlayerSlots();renderPlayers();showScreen('players');save()});
$('#toggleFavourite').addEventListener('click',()=>{if(!selectedClub)return;const clubs=favourites(),index=clubs.findIndex(club=>club.id===selectedClub.id);if(index>=0){clubs.splice(index,1);if(homeClub()?.id===selectedClub.id)saveHomeClub(null)}else clubs.unshift({id:selectedClub.id,name:selectedClub.name});saveFavourites(clubs);renderFavourites();updateFavouriteButton();updateHomeButton()});
$('#toggleHome').addEventListener('click',()=>{if(!selectedClub)return;const current=homeClub();if(current?.id===selectedClub.id)saveHomeClub(null);else{const club={id:selectedClub.id,name:selectedClub.name},clubs=favourites();if(!clubs.some(item=>item.id===club.id)){clubs.unshift(club);saveFavourites(clubs)}saveHomeClub(club)}renderFavourites();updateFavouriteButton();updateHomeButton()});

function settingsProfile(){try{const settings=JSON.parse(localStorage.getItem(SETTINGS_KEY))||{},whs=settings.whs===''||settings.whs==null?null:Number(settings.whs);return {playerName:settings.playerName?.trim()||settings.name?.trim()||'Your Name',whs:Number.isFinite(whs)&&whs>=0&&whs<=36?whs:null}}catch{return {playerName:'Your Name',whs:null}}}
function settingsPlayerName(){return settingsProfile().playerName}
function emptyPlayer(name=''){return {name,index:'',courseHandicap:null}}
function ensurePlayerSlots(){if(!state.scores?.length){while(state.players.length<4)state.players.push(emptyPlayer());state.players=state.players.slice(0,4)}if(!state.players[0]?.name){const profile=settingsProfile();if(!state.players[0])state.players[0]=emptyPlayer();state.players[0].name=profile.playerName;if(profile.whs!=null){state.players[0].index=String(profile.whs);if(state.course){const calculated=courseHandicap(profile.whs);state.players[0].courseHandicap=calculated>=0&&calculated<=36?calculated:null}}}}
let rememberedPlayers=[],nameLookupTimer=null;
const playerSaveTimers=new Map();
function storedPlayers(){try{const players=JSON.parse(localStorage.getItem(PLAYER_MEMORY_KEY));return Array.isArray(players)?players:[]}catch{return []}}
function renderRememberedNames(){$('#rememberedNames').innerHTML=rememberedPlayers.map(player=>`<option value="${escapeHtml(player.name)}"></option>`).join('')}
function loadRememberedNames(query=''){const needle=query.trim().toLocaleLowerCase();rememberedPlayers=storedPlayers().filter(player=>!needle||player.name.toLocaleLowerCase().includes(needle)).slice(0,20);renderRememberedNames();return rememberedPlayers}
function applyRememberedPlayer(slot){
  const player=state.players[slot],remembered=rememberedPlayers.find(item=>item.name.toLocaleLowerCase()===player.name.trim().toLocaleLowerCase());if(!remembered||remembered.whs==null)return;
  if(Number(remembered.whs)<0||Number(remembered.whs)>36)return;
  player.index=String(remembered.whs);player.courseHandicap=courseHandicap(Number(remembered.whs));const row=document.querySelector(`[data-player-row="${slot}"]`);if(row){row.querySelector('[data-player-index]').value=player.index;row.querySelector('[data-player-course]').value=player.courseHandicap}
}
function queueRememberedPlayerSave(slot){clearTimeout(playerSaveTimers.get(slot));playerSaveTimers.set(slot,setTimeout(()=>{const player=state.players[slot],name=player.name.trim(),whs=player.index===''?null:Number(player.index);if(!name||whs==null||!Number.isFinite(whs)||whs<0||whs>36){playerSaveTimers.delete(slot);return}const players=storedPlayers(),match=players.findIndex(item=>item.name.toLocaleLowerCase()===name.toLocaleLowerCase()),saved={name,whs,updatedAt:Date.now()};if(match>=0)players.splice(match,1);players.unshift(saved);localStorage.setItem(PLAYER_MEMORY_KEY,JSON.stringify(players.slice(0,100)));playerSaveTimers.delete(slot)},500))}
function handicapRuleText(){
  if(state.format==='fourball')return state.handicapMode==='full'?'Full handicap · 100% · no differential':'Recommended · 90% from lowest';
  if(state.format==='matchplay')return state.handicapMode==='full'?'Full handicap · 100% · no differential':'Recommended · 100% from lowest';
  return '';
}
function renderPlayers(){
  ensurePlayerSlots();$('#selectedCourse').textContent=`${state.course.name} · ${state.course.tee} tees · Par ${coursePar()} · Slope ${state.course.slope}`;
  const needsChoice=state.format==='fourball'||state.format==='matchplay',rule=$('#handicapRule');rule.classList.toggle('hidden',!needsChoice);$('#handicapOptions').classList.add('hidden');
  if(needsChoice){$('#handicapRuleName').textContent=handicapRuleText();const recommended=state.format==='fourball'?'Recommended · 90% from lowest':'Recommended · 100% from lowest';document.querySelector('[data-handicap-mode="recommended"]').textContent=recommended;document.querySelectorAll('[data-handicap-mode]').forEach(button=>button.classList.toggle('active',button.dataset.handicapMode===state.handicapMode))}
  $('#playerRows').innerHTML=state.players.slice(0,playerCount()).map((player,i)=>{const teamHeading=state.format==='fourball'&&(i===0||i===2)?`<h2 class="team-heading"><span>Team ${i===0?'A':'B'}</span><small>${i===0?'Players 1 & 2':'Players 3 & 4'}</small></h2>`:'';return `${teamHeading}<article class="player-row" data-player-row="${i}"><label class="player-name">Name<input value="${escapeHtml(player.name)}" data-player-name="${i}" maxlength="40" autocomplete="off" list="rememberedNames" placeholder="Player ${i+1}"></label><label class="player-whs">WHS<input type="number" inputmode="decimal" min="0" max="36" step="0.1" value="${escapeHtml(player.index)}" data-player-index="${i}"></label><label class="player-course">Course<input type="text" inputmode="numeric" pattern="[0-9]*" value="${player.courseHandicap??''}" data-player-course="${i}" aria-label="Course Handicap for player ${i+1}"></label><button class="remove-player" data-clear-player="${i}" aria-label="Clear player ${i+1}"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="remove-cross-shadow" d="M7.5 7.5l9 9M16.5 7.5l-9 9"/><path class="remove-cross" d="M7.5 7.5l9 9M16.5 7.5l-9 9"/><path class="remove-cross-highlight" d="M7.8 7.3l3.7 3.7M16.2 7.3L12.5 11"/></svg></button></article>`}).join('');loadRememberedNames();
}
$('#playerRows').addEventListener('input',event=>{
  const i=Number(event.target.dataset.playerName??event.target.dataset.playerIndex??event.target.dataset.playerCourse);if(!Number.isInteger(i))return;const player=state.players[i];
  if(event.target.matches('[data-player-name]')){player.name=event.target.value;clearTimeout(nameLookupTimer);nameLookupTimer=setTimeout(async()=>{await loadRememberedNames(player.name.trim());applyRememberedPlayer(i)},180)}
  else if(event.target.matches('[data-player-index]')){const value=Number(event.target.value);if(event.target.value!==''&&(!Number.isFinite(value)||value<0||value>36)){event.target.value='';player.index='';player.courseHandicap=null}else{player.index=event.target.value;player.courseHandicap=event.target.value===''?null:courseHandicap(value);if(player.courseHandicap<0||player.courseHandicap>36)player.courseHandicap=null}document.querySelector(`[data-player-course="${i}"]`).value=player.courseHandicap??'';queueRememberedPlayerSave(i)}
  else{const value=Number(event.target.value);if(event.target.value!==''&&(!Number.isInteger(value)||value<0||value>36)){event.target.value='';player.courseHandicap=null}else player.courseHandicap=event.target.value===''?null:value}$('#playerError').textContent='';save();
});
$('#playerRows').addEventListener('change',event=>{const i=Number(event.target.dataset.playerName??event.target.dataset.playerIndex);if(Number.isInteger(i))queueRememberedPlayerSave(i)});
$('#playerRows').addEventListener('click',event=>{if(event.target.matches('[data-player-course]')){event.target.select();return}const button=event.target.closest('[data-clear-player]');if(!button)return;const i=Number(button.dataset.clearPlayer);state.players[i]=emptyPlayer(i===0?settingsPlayerName():'');renderPlayers();save()});
$('#changeHandicapRule').addEventListener('click',()=>$('#handicapOptions').classList.toggle('hidden'));
$('#handicapOptions').addEventListener('click',event=>{const button=event.target.closest('[data-handicap-mode]');if(!button)return;state.handicapMode=button.dataset.handicapMode;renderPlayers();save()});
$('#backToCourse').addEventListener('click',()=>showScreen('format'));
$('#startRound').addEventListener('click',()=>{const error=$('#playerError'),available=state.players.slice(0,playerCount()),players=available.filter(player=>player.name.trim()),exact=state.format!=='stableford';if(!players.length){error.textContent='Enter at least one player.';return}if(exact&&players.length!==playerCount()){error.textContent=`${FORMAT_CONFIG[state.format].name} needs ${playerCount()} players.`;return}if(players.some(player=>player.courseHandicap==null||player.courseHandicap===''||!Number.isInteger(Number(player.courseHandicap))||Number(player.courseHandicap)<0||Number(player.courseHandicap)>36)){error.textContent='Each named player needs a Course Handicap from 0 to 36.';return}state.players=players.map(player=>({...player,name:player.name.trim(),courseHandicap:Number(player.courseHandicap)}));state.scores=state.players.map(()=>Array(18).fill(null));state.hole=0;error.textContent='';state.players.forEach((_,i)=>queueRememberedPlayerSave(i));renderScore();showScreen('score');save()});

let selectedPlayer=0,swipeStartX=0,swipeStartY=0,suppressPlayerClickUntil=0;
function holeComplete(hole=state.hole){return state.scores.every(scores=>scores[hole]!=null)}
function completedHoleCount(){return Array.from({length:18},(_,hole)=>holeComplete(hole)).filter(Boolean).length}
function firstIncompleteHole(){const hole=Array.from({length:18},(_,i)=>i).find(i=>!holeComplete(i));return hole??17}
function netFor(playerIndex,hole,handicaps=playingHandicaps()){
  const gross=state.scores[playerIndex]?.[hole];if(gross==null)return null;if(gross===NO_SCORE)return Infinity;
  return gross-strokesOnHole(handicaps[playerIndex],state.course.indexes[hole]);
}
function fourTwentyPoints(hole){
  if(!holeComplete(hole))return Array(3).fill(null);const nets=state.players.map((_,i)=>netFor(i,hole));
  if(nets[0]===nets[1]&&nets[1]===nets[2])return [2,2,2];
  const order=[0,1,2].sort((a,b)=>nets[a]-nets[b]),points=[0,0,0];
  if(nets[order[0]]===nets[order[1]]){points[order[0]]=3;points[order[1]]=3;return points}
  if(nets[order[1]]===nets[order[2]]){points[order[0]]=4;points[order[1]]=1;points[order[2]]=1;return points}
  points[order[0]]=4;points[order[1]]=2;return points;
}
function matchHoleWinner(hole){
  if(!holeComplete(hole))return 0;const handicaps=playingHandicaps();
  if(state.format==='fourball'){
    const teamA=Math.min(netFor(0,hole,handicaps),netFor(1,hole,handicaps)),teamB=Math.min(netFor(2,hole,handicaps),netFor(3,hole,handicaps));return teamA===teamB?0:teamA<teamB?1:-1;
  }
  const first=netFor(0,hole,handicaps),second=netFor(1,hole,handicaps);return first===second?0:first<second?1:-1;
}
function matchStanding(throughHole=state.hole){return Array.from({length:throughHole+1},(_,hole)=>matchHoleWinner(hole)).reduce((sum,result)=>sum+result,0)}
function matchStatus(){
  const standing=matchStanding(),played=Array.from({length:state.hole+1},(_,hole)=>holeComplete(hole)).filter(Boolean).length;if(!standing)return played===18?'Match halved':'All square';
  const leader=state.format==='fourball'?(standing>0?'Team A':'Team B'):(standing>0?state.players[0].name:state.players[1].name),lead=Math.abs(standing),remaining=18-played;
  if(!remaining)return `${leader} wins ${lead} up`;if(lead>remaining)return `${leader} wins ${lead} & ${remaining}`;return `${leader} ${lead} up`;
}
function renderScore(){
  const h=state.hole,complete=completedHoleCount(),handicaps=playingHandicaps(),isMatch=state.format==='matchplay'||state.format==='fourball';$('#holeCounter').textContent=`${FORMAT_CONFIG[state.format].name.toUpperCase()} · HOLE ${h+1} OF 18`;$('#holeTitle').textContent=`Hole ${h+1}`;$('#holeDetails').textContent=`Par ${state.course.pars[h]} · Stroke index ${state.course.indexes[h]}`;$('#completedHoles').textContent=isMatch?matchStatus():`${complete}/18`;$('#runningLabel').textContent=isMatch?'match':'complete';$('#scoreProgress').style.width=`${complete/18*100}%`;
  $('#scorePlayers').innerHTML=state.players.map((player,i)=>{const gross=state.scores[i][h],playingHandicap=handicaps[i],strokes=strokesOnHole(playingHandicap,state.course.indexes[h]),strokeText=strokes>0?`${strokes} stroke${strokes===1?'':'s'}`:strokes<0?`gives ${Math.abs(strokes)}`:'no stroke';let value,label,detail;
    if(state.format==='stableford'){value=pointsFor(gross,player,h,playingHandicap);const total=state.scores[i].reduce((sum,score,hole)=>sum+(pointsFor(score,player,hole,playingHandicap)||0),0);label='Points';detail=`CH ${player.courseHandicap} · ${strokeText} · Total ${total} pts`}
    else if(state.format==='fourtwenty'){const holePoints=fourTwentyPoints(h),total=Array.from({length:18},(_,hole)=>fourTwentyPoints(hole)[i]||0).reduce((a,b)=>a+b,0);value=holePoints[i];label='4-2-0';detail=`CH ${player.courseHandicap} · ${strokeText} · Total ${total}`}
    else{const net=netFor(i,h,handicaps);value=net===Infinity?'NS':net;label='Net';detail=`${state.format==='fourball'?`Team ${i<2?'A':'B'} · `:''}CH ${player.courseHandicap} · PH ${playingHandicap} · ${strokeText}`}
    const teamHeading=state.format==='fourball'&&(i===0||i===2)?`<h2 class="score-team-heading">Team ${i===0?'A':'B'}</h2>`:'';return `${teamHeading}<button class="score-player ${gross!=null?'complete':''} ${i===selectedPlayer?'selected':''}" data-player="${i}"><span><span class="score-player-name">${escapeHtml(player.name)}</span><span class="score-player-detail">${detail}</span></span><span class="score-gross"><strong>${gross===NO_SCORE?'NS':gross??'—'}</strong><small>Gross</small></span><span class="score-points"><strong>${value??'—'}</strong><small>${label}</small></span></button>`}).join('');
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
$('#openSettings').addEventListener('click',()=>$('#settingsDialog').showModal());
$('#closeSettings').addEventListener('click',()=>$('#settingsDialog').close());
$('#openAbandonScoring').addEventListener('click',()=>{$('#settingsDialog').close();$('#abandonDialog').showModal()});
$('#cancelAbandon').addEventListener('click',()=>{$('#abandonDialog').close();$('#settingsDialog').showModal()});
$('#confirmAbandon').addEventListener('click',clearRound);
$('#openProfileSettings').addEventListener('click',()=>{const profile=settingsProfile();$('#settingsDialog').close();$('#settingsPlayerName').value=profile.playerName;$('#settingsPlayerWhs').value=profile.whs??'';$('#settingsProfileError').textContent='';$('#profileSettingsDialog').showModal();setTimeout(()=>{$('#settingsPlayerName').focus();$('#settingsPlayerName').select()},0)});
$('#cancelProfileSettings').addEventListener('click',()=>{$('#profileSettingsDialog').close();$('#settingsDialog').showModal()});
$('#saveProfileSettings').addEventListener('click',()=>{const playerName=$('#settingsPlayerName').value.trim()||'Your Name',rawWhs=$('#settingsPlayerWhs').value,whs=rawWhs===''?null:Number(rawWhs);if(whs!=null&&(!Number.isFinite(whs)||whs<0||whs>36)){ $('#settingsProfileError').textContent='WHS must be between 0 and 36.';return}localStorage.setItem(SETTINGS_KEY,JSON.stringify({playerName,whs}));ensurePlayerSlots();state.players[0].name=playerName;state.players[0].index=whs==null?'':String(whs);if(whs==null)state.players[0].courseHandicap=null;else if(state.course){const calculated=courseHandicap(whs);state.players[0].courseHandicap=calculated>=0&&calculated<=36?calculated:null}save();if(state.course&&!$('#playersScreen').classList.contains('hidden'))renderPlayers();$('#profileSettingsDialog').close()});

try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||localStorage.getItem(LEGACY_STORAGE_KEY));if(saved?.course){Object.assign(state,saved);state.handicapMode=state.handicapMode||'recommended';if(state.scores?.length){state.format=state.format||'stableford';renderScore();showScreen('score')}else if(state.format){ensurePlayerSlots();renderPlayers();showScreen('players')}else{ensurePlayerSlots();showScreen('format')}save()}else ensurePlayerSlots()}catch{ensurePlayerSlots()}
