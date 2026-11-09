const $=selector=>document.querySelector(selector);
if('scrollRestoration' in history)history.scrollRestoration='manual';
$('#refreshApp').addEventListener('click',()=>window.location.reload());
$('#refreshApp').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();window.location.reload()}});
$('#refreshApp').addEventListener('contextmenu',event=>event.preventDefault());
$('#refreshApp').addEventListener('dragstart',event=>event.preventDefault());
function dismissSplash(){const splash=$('#appSplash');if(!splash||splash.classList.contains('splash-exit'))return;splash.classList.add('splash-exit');setTimeout(()=>splash.remove(),380)}
function splashProfile(){try{const profile=JSON.parse(localStorage.getItem('caddiecard-settings-v1'))||{},name=profile.playerName?.trim()||profile.name?.trim()||'',whs=profile.whs===''||profile.whs==null?null:Number(profile.whs);return {name,whs:Number.isFinite(whs)?whs:null}}catch{return {name:'',whs:null}}}
function showSplashProfile(){const splash=$('#appSplash'),profile=splashProfile();if(!splash)return;splash.classList.add('needs-profile');$('#splashStatus').classList.add('hidden');$('#splashProfile').classList.remove('hidden');$('#splashPlayerName').value=profile.name==='Your Name'?'':profile.name;$('#splashPlayerWhs').value=formatWHS(profile.whs);setTimeout(()=>{const field=!$('#splashPlayerName').value?$('#splashPlayerName'):$('#splashPlayerWhs');field.focus();field.select()},80)}
function runSplash(){
  const messages=['Refreshing Cloudflare links…','Checking GitHub version…','Checking saved clubs…','Finding today’s pin positions…','Polishing the scorecard…','Waking the course caddie…'],status=$('#splashStatus');let last=-1;
  const nextMessage=()=>{let pick=Math.floor(Math.random()*messages.length);if(pick===last)pick=(pick+1)%messages.length;last=pick;if(status)status.textContent=messages[pick]};
  nextMessage();const messageTimer=setInterval(nextMessage,430),hold=1500+Math.random()*1000;setTimeout(()=>{clearInterval(messageTimer);const profile=splashProfile();if(!profile.name||profile.name==='Your Name'||profile.whs==null)showSplashProfile();else dismissSplash()},hold);
}
window.addEventListener('load',runSplash,{once:true});setTimeout(()=>{if(!$('#appSplash')?.classList.contains('needs-profile'))dismissSplash()},5000);
const STORAGE_KEY='caddiecard-one-off-v1';
const LEGACY_STORAGE_KEY='scoring-app-one-off-v1';
const SETTINGS_KEY='caddiecard-settings-v1';
const FRIENDS_KEY='caddiecard-friends-v1';
const AUTO_ADVANCE_KEY='caddiecard-auto-hole-advance-v1';
const APP_VERSION='2026.11.09.2';
const UPDATE_SNOOZE_KEY='caddiecard-update-snooze-v1';
const UPDATE_CHECK_INTERVAL=5*60*1000;
const UPDATE_SNOOZE_INTERVAL=15*60*1000;
const NO_SCORE=99;
const state={course:null,format:null,handicapMode:'recommended',players:[],hole:0,scores:[],skinsStake:1,nassauMode:'singles'};
const FORMAT_CONFIG={stableford:{name:'Stableford',players:4},fourball:{name:'4BBB',players:4},greensomes:{name:'Greensomes',players:4},matchplay:{name:'Matchplay',players:2},strokeplay:{name:'Stroke Play',players:4},fourtwenty:{name:'4-2-0',players:3},skins:{name:'Skins',players:4},nassau:{name:'Nassau',players:2}};

function capitalisePlayerName(value){return value.trim().replace(/\s+/g,' ').replace(/(^|[\s'-])([a-z])/g,(_,separator,letter)=>separator+letter.toUpperCase())}
function capitalisePlayerNameEntry(value){return value.replace(/(^|[\s'-])([a-z])/g,(_,separator,letter)=>separator+letter.toUpperCase())}
function formatWHS(value,fallback=''){if(value===''||value==null)return fallback;const number=Number(value);return Number.isFinite(number)?number.toFixed(1):fallback}
function normaliseWHSInput(event){const value=Number(event.target.value);if(event.target.value!==''&&Number.isFinite(value)&&value>=0&&value<=36)event.target.value=formatWHS(value)}
[$('#splashPlayerWhs'),$('#settingsPlayerWhs'),$('#friendWhs')].forEach(input=>input.addEventListener('change',normaliseWHSInput));
function surnameFirst(name){const words=capitalisePlayerName(name).split(' ').filter(Boolean);return words.length<2?words[0]||'':`${words.at(-1)}, ${words.slice(0,-1).join(' ')}`}
$('#splashPlayerName').addEventListener('input',event=>{const start=event.target.selectionStart;event.target.value=capitalisePlayerNameEntry(event.target.value);event.target.setSelectionRange(start,start)});
$('#splashPlayerName').addEventListener('blur',event=>{event.target.value=capitalisePlayerName(event.target.value)});
$('#splashProfile').addEventListener('submit',event=>{event.preventDefault();const name=capitalisePlayerName($('#splashPlayerName').value),rawWhs=$('#splashPlayerWhs').value,whs=rawWhs===''?null:Number(rawWhs),error=$('#splashProfileError');$('#splashPlayerName').value=name;if(!name||name==='Your Name'){error.textContent='Enter the name you want on your scorecard.';$('#splashPlayerName').focus();return}if(whs==null||!Number.isFinite(whs)||whs<0||whs>36){error.textContent='Enter a WHS between 0 and 36.';$('#splashPlayerWhs').focus();return}localStorage.setItem(SETTINGS_KEY,JSON.stringify({playerName:name,whs}));if(!state.scores.length){ensurePlayerSlots();state.players[0].name=name;state.players[0].index=String(whs);const calculated=state.course?courseHandicap(whs):null;state.players[0].courseHandicap=calculated!=null&&calculated>=0&&calculated<=36?calculated:null;save();if(state.course&&!$('#playersScreen').classList.contains('hidden'))renderPlayers()}dismissSplash()});

function renderCourseRows(pars=Array(18).fill(4),indexes=Array.from({length:18},(_,i)=>i+1)){
  $('#courseTable tbody').innerHTML=Array.from({length:18},(_,i)=>`<tr><td>${i+1}</td><td><input type="number" inputmode="numeric" min="3" max="6" value="${pars[i]??''}" data-par="${i}" aria-label="Par for hole ${i+1}"></td><td><input type="number" inputmode="numeric" min="1" max="18" value="${indexes[i]??''}" data-si="${i}" aria-label="Stroke index for hole ${i+1}"></td></tr>`).join('');
}

function showScreen(name){['course','tee','format','handicap','players','score','summary'].forEach(id=>$(`#${id}Screen`).classList.toggle('hidden',id!==name));window.scrollTo({top:0,behavior:'auto'})}
function coursePar(){return state.course.pars.reduce((a,b)=>a+b,0)}
function courseHandicap(index){return Math.round(index*(state.course.slope/113)+(state.course.rating-coursePar()))}
function strokesOnHole(handicap,strokeIndex){if(handicap>=0)return Math.floor(handicap/18)+(strokeIndex<=handicap%18?1:0);const plus=Math.abs(handicap);return -(Math.floor(plus/18)+(strokeIndex<=plus%18?1:0))}
function pointsFor(gross,player,hole,handicap=player.courseHandicap){if(gross==null)return null;if(gross===NO_SCORE)return 0;const net=gross-strokesOnHole(handicap,state.course.indexes[hole]);return Math.max(0,2+(state.course.pars[hole]-net))}
function playerCount(){return state.format==='nassau'&&state.nassauMode==='teams'?4:FORMAT_CONFIG[state.format]?.players||4}
function playingHandicaps(){
  const courseHandicaps=state.players.map(player=>Number(player.courseHandicap)||0);
  if(state.format==='greensomes'){
    const teamHandicap=(first,second)=>state.handicapMode==='equal'?Math.round((first+second)*.5):Math.round(Math.min(first,second)*.6+Math.max(first,second)*.4),teamA=teamHandicap(courseHandicaps[0],courseHandicaps[1]),teamB=teamHandicap(courseHandicaps[2],courseHandicaps[3]),lowest=Math.min(teamA,teamB);
    return [teamA-lowest,teamA-lowest,teamB-lowest,teamB-lowest];
  }
  if((state.format==='stableford'||state.format==='fourtwenty'||state.format==='skins')&&state.handicapMode==='differential'){const lowest=Math.min(...courseHandicaps);return courseHandicaps.map(handicap=>handicap-lowest)}
  if(state.format==='stableford'||state.format==='strokeplay'||state.format==='fourtwenty'||state.format==='skins'||state.handicapMode==='full')return courseHandicaps;
  const lowest=Math.min(...courseHandicaps),allowance=state.format==='fourball'||(state.format==='nassau'&&state.nassauMode==='teams')?0.9:1;
  return courseHandicaps.map(handicap=>Math.round((handicap-lowest)*allowance));
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}

let lastUpdateCheckAt=0,pendingUpdateVersion='';
function preRoundScreenActive(){return !state.scores?.length&&['course','tee','format','handicap','players'].some(name=>!$(`#${name}Screen`).classList.contains('hidden'))}
function updateSnoozed(version){try{const snooze=JSON.parse(localStorage.getItem(UPDATE_SNOOZE_KEY));return snooze?.version===version&&Number(snooze.until)>Date.now()}catch{return false}}
function showUpdateOffer(version){if(!preRoundScreenActive()||version===APP_VERSION||updateSnoozed(version))return;pendingUpdateVersion=version;const otherDialogs=[...document.querySelectorAll('dialog[open]')].filter(dialog=>dialog.id!=='updateAvailableDialog');if(otherDialogs.length){otherDialogs.forEach(dialog=>dialog.addEventListener('close',()=>setTimeout(()=>showUpdateOffer(version),0),{once:true}));return}const dialog=$('#updateAvailableDialog');if(!dialog.open)dialog.showModal()}
async function checkForUpdate(force=false){if(!preRoundScreenActive()||document.hidden)return;const now=Date.now();if(!force&&now-lastUpdateCheckAt<UPDATE_CHECK_INTERVAL)return;lastUpdateCheckAt=now;try{const response=await fetch(`version.json?check=${now}`,{cache:'no-store'});if(!response.ok)return;const release=await response.json(),version=String(release.version||'').trim();if(version&&version!==APP_VERSION)showUpdateOffer(version)}catch{}}
function snoozeUpdate(){if(pendingUpdateVersion)try{localStorage.setItem(UPDATE_SNOOZE_KEY,JSON.stringify({version:pendingUpdateVersion,until:Date.now()+UPDATE_SNOOZE_INTERVAL}))}catch{}$('#updateAvailableDialog').close()}
$('#snoozeUpdate').addEventListener('click',snoozeUpdate);
$('#updateAvailableDialog').addEventListener('cancel',event=>{event.preventDefault();snoozeUpdate()});
$('#applyUpdate').addEventListener('click',()=>{try{localStorage.removeItem(UPDATE_SNOOZE_KEY)}catch{}const url=new URL(location.href);url.searchParams.set('update',pendingUpdateVersion||Date.now());location.replace(url.href)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkForUpdate()});
window.addEventListener('focus',()=>checkForUpdate());
window.addEventListener('load',()=>setTimeout(()=>checkForUpdate(true),3000),{once:true});

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
const CLUB_COURSES_KEY='caddiecard-club-courses-v1';
const HOME_CLUB_PROMPTED_KEY='caddiecard-home-club-prompted-v1';
let selectedClub=null,searchTimer=null,searchRequest=0,clubSelectionRequest=0;

function favourites(){
  try{const saved=JSON.parse(localStorage.getItem(FAVOURITES_KEY)||localStorage.getItem(LEGACY_FAVOURITES_KEY));if(saved&&!localStorage.getItem(FAVOURITES_KEY))saveFavourites(saved);return saved||[]}catch{return []}
}
function saveFavourites(clubs){localStorage.setItem(FAVOURITES_KEY,JSON.stringify(clubs))}
function homeClub(){try{return JSON.parse(localStorage.getItem(HOME_CLUB_KEY))}catch{return null}}
function saveHomeClub(club){if(club)localStorage.setItem(HOME_CLUB_KEY,JSON.stringify(club));else localStorage.removeItem(HOME_CLUB_KEY)}
function storedClubCourses(id){try{return JSON.parse(localStorage.getItem(CLUB_COURSES_KEY))?.[id]?.courses||null}catch{return null}}
function saveClubCourses(club,courses){
  try{const saved=JSON.parse(localStorage.getItem(CLUB_COURSES_KEY))||{};saved[club.id]={club,courses,savedAt:Date.now()};const trimmed=Object.fromEntries(Object.entries(saved).sort((a,b)=>b[1].savedAt-a[1].savedAt).slice(0,12));localStorage.setItem(CLUB_COURSES_KEY,JSON.stringify(trimmed))}catch{}
}
function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
const golfApiCache=new Map(),golfApiPending=new Map();
function storedGolfApi(path){try{const cache=JSON.parse(localStorage.getItem(GOLF_CACHE_KEY))||{},entry=cache[path];if(!entry||entry.expires<Date.now())return null;return entry.payload}catch{return null}}
function storeGolfApi(path,payload){try{const now=Date.now(),saved=JSON.parse(localStorage.getItem(GOLF_CACHE_KEY))||{},ttl=path.startsWith('/courses/')?7*864e5:path.includes('/courses')?864e5:15*60e3;const live=Object.entries(saved).filter(([,entry])=>entry&&entry.expires>now);live.push([path,{payload,expires:now+ttl}]);const cache=Object.fromEntries(live.sort((a,b)=>b[1].expires-a[1].expires).filter(([key],index,all)=>index===all.findIndex(([candidate])=>candidate===key)).slice(0,60));localStorage.setItem(GOLF_CACHE_KEY,JSON.stringify(cache))}catch{}}
async function requestGolfApi(path){
  let response;
  try{
    response=await fetch(`${COURSE_API}${path}`);
    if(response.status===429){
      const retryAfter=Number(response.headers.get('Retry-After')),delay=Math.min(3000,Math.max(750,(Number.isFinite(retryAfter)?retryAfter:1)*1000));
      await new Promise(resolve=>setTimeout(resolve,delay));
      response=await fetch(`${COURSE_API}${path}`);
    }
  }catch{throw new Error('The course service could not be reached. Check your connection and try again.')}
  if(response.ok){
    try{const payload=await response.json();return payload.data??payload}catch{throw new Error('The course service returned an invalid response. Please try again.')}
  }
  if(response.status===429){
    const retryAfter=Number(response.headers.get('Retry-After')),waitText=Number.isFinite(retryAfter)&&retryAfter>0?` Wait ${Math.ceil(retryAfter)} seconds, then try again.`:' Please wait a moment, then try again.';
    throw new Error(`The club search service asked us to slow down.${waitText}`);
  }
  throw new Error(`The course service returned an error (${response.status}). Please try again.`);
}
function golfApi(path){
  if(golfApiCache.has(path))return Promise.resolve(golfApiCache.get(path));
  const stored=storedGolfApi(path);if(stored!=null){golfApiCache.set(path,stored);return Promise.resolve(stored)}
  if(golfApiPending.has(path))return golfApiPending.get(path);
  const request=requestGolfApi(path).then(payload=>{golfApiCache.set(path,payload);storeGolfApi(path,payload);return payload}).finally(()=>golfApiPending.delete(path));
  golfApiPending.set(path,request);return request;
}
async function refreshGolfApi(path){const payload=await requestGolfApi(path);golfApiCache.set(path,payload);storeGolfApi(path,payload);return payload}
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
  const request=++searchRequest,normalisedQuery=query.trim().replace(/\s+/g,' ').toLowerCase();
  $('#clubStatus').textContent='Searching…';
  $('#searchSection').classList.remove('hidden');
  $('#clubResults').innerHTML='<div class="searching-row"><span></span>Searching clubs…</div>';
  try{
    const payload=await golfApi(`/clubs?search=${encodeURIComponent(normalisedQuery)}`);if(request!==searchRequest)return;
    const clubs=Array.isArray(payload)?payload:(payload.clubs||[]);renderSearchResults(clubs);$('#clubStatus').textContent=`${clubs.length} club${clubs.length===1?'':'s'} found.`;
  }catch(error){
    if(request===searchRequest){
      $('#clubStatus').innerHTML=`<span>${escapeHtml(error.message)}</span><button type="button" class="retry-button" data-retry-search>Retry</button>`;
      $('#clubResults').innerHTML='<p class="status">Search stopped.</p>';
    }
  }
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
function maybeOfferHomeClub(){
  if(homeClub()||localStorage.getItem(HOME_CLUB_PROMPTED_KEY)||!selectedClub)return;
  localStorage.setItem(HOME_CLUB_PROMPTED_KEY,'1');$('#homeCoursePromptName').textContent=selectedClub.name;$('#homeCourseDialog').showModal();
}
async function selectClub(id,displayedName,refresh=false){
  const request=++clubSelectionRequest,known=[...favourites()];
  selectedClub={id,name:displayedName?.trim()||known.find(club=>club.id===id)?.name||'Selected golf club'};
  $('#selectedClubName').textContent=selectedClub.name;updateFavouriteButton();updateHomeButton();showScreen('tee');window.scrollTo({top:0,behavior:'smooth'});
  const savedCourses=!refresh&&storedClubCourses(id);
  if(savedCourses?.length){renderTeeChoices(savedCourses);maybeOfferHomeClub();return}
  renderTeeLoading();
  try{
    const load=refresh?refreshGolfApi:golfApi,summary=normaliseCourses(await load(`/clubs/${encodeURIComponent(id)}/courses`));if(request!==clubSelectionRequest)return;
    const courses=[];
    for(const course of summary.filter(course=>course?.id)){
      courses.push(await load(`/courses/${encodeURIComponent(course.id)}`));
      if(request!==clubSelectionRequest)return;
    }
    if(request===clubSelectionRequest){saveClubCourses(selectedClub,courses);renderTeeChoices(courses);maybeOfferHomeClub()}
  }catch(error){if(request===clubSelectionRequest)$('#teeChoices').innerHTML=`<div class="api-error-card"><p class="validation">${escapeHtml(error.message)}</p><button type="button" class="retry-button" data-retry-club>Retry loading course</button></div>`}
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
$('#clubSearch').addEventListener('input',event=>{clearTimeout(searchTimer);const query=event.target.value.trim();if(query.length<2){$('#clubStatus').textContent='Type at least two characters.';$('#searchSection').classList.add('hidden');renderFavourites();return}$('#favouritesSection').classList.add('hidden');$('#searchSection').classList.remove('hidden');$('#clubResults').innerHTML='<div class="searching-row"><span></span>Searching clubs…</div>';searchTimer=setTimeout(()=>searchClubs(query),650)});
$('#clubSearch').addEventListener('search',event=>{if(!event.target.value){$('#searchSection').classList.add('hidden');$('#clubStatus').textContent='Type at least two characters.';renderFavourites()}});
document.querySelector('.club-picker').addEventListener('click',event=>{if(event.target.closest('[data-retry-search]')){const query=$('#clubSearch').value.trim();if(query.length>=2)searchClubs(query);return}const club=event.target.closest('[data-club-id]');if(club)selectClub(club.dataset.clubId,club.querySelector('strong')?.textContent)});
$('#teeChoices').addEventListener('click',event=>{if(event.target.closest('[data-retry-club]')){if(selectedClub)selectClub(selectedClub.id,selectedClub.name,true);return}const tee=event.target.closest('[data-tee-id]');if(tee)selectTee(tee.dataset.courseId,tee.dataset.teeId)});
$('#refreshCourseData').addEventListener('click',()=>{if(selectedClub)selectClub(selectedClub.id,selectedClub.name,true)});
$('#changeClub').addEventListener('click',showClubDiscovery);
$('#backToTees').addEventListener('click',()=>showScreen('tee'));
function continueFormatSetup(){state.handicapMode='recommended';ensurePlayerSlots();renderHandicapChoices();showScreen('handicap');save()}
document.querySelector('.format-list').addEventListener('click',event=>{const button=event.target.closest('[data-format]');if(!button)return;state.format=button.dataset.format;if(state.format==='skins'){$('#skinsStake').value=Number(state.skinsStake||1).toFixed(2);$('#skinsSetupError').textContent='';$('#skinsSetupDialog').showModal();return}if(state.format==='nassau'){$('#nassauSetupDialog').showModal();return}continueFormatSetup()});
$('#cancelSkinsSetup').addEventListener('click',()=>$('#skinsSetupDialog').close());
$('#confirmSkinsSetup').addEventListener('click',()=>{const stake=Number($('#skinsStake').value);if(!Number.isFinite(stake)||stake<=0||stake>1000){$('#skinsSetupError').textContent='Enter an amount between £0.01 and £1,000.';return}state.skinsStake=Math.round(stake*100)/100;$('#skinsSetupDialog').close();continueFormatSetup()});
$('#cancelNassauSetup').addEventListener('click',()=>$('#nassauSetupDialog').close());
$('#nassauSetupDialog').addEventListener('click',event=>{const button=event.target.closest('[data-nassau-mode]');if(!button)return;state.nassauMode=button.dataset.nassauMode;$('#nassauSetupDialog').close();continueFormatSetup()});
$('#toggleFavourite').addEventListener('click',()=>{if(!selectedClub)return;const clubs=favourites(),index=clubs.findIndex(club=>club.id===selectedClub.id);if(index>=0){clubs.splice(index,1);if(homeClub()?.id===selectedClub.id)saveHomeClub(null)}else clubs.unshift({id:selectedClub.id,name:selectedClub.name});saveFavourites(clubs);renderFavourites();updateFavouriteButton();updateHomeButton()});
$('#toggleHome').addEventListener('click',()=>{if(!selectedClub)return;const current=homeClub();if(current?.id===selectedClub.id)saveHomeClub(null);else{const club={id:selectedClub.id,name:selectedClub.name},clubs=favourites();if(!clubs.some(item=>item.id===club.id)){clubs.unshift(club);saveFavourites(clubs)}saveHomeClub(club)}renderFavourites();updateFavouriteButton();updateHomeButton()});
$('#declineHomeCourse').addEventListener('click',()=>$('#homeCourseDialog').close());
$('#confirmHomeCourse').addEventListener('click',()=>{if(selectedClub){const club={id:selectedClub.id,name:selectedClub.name},clubs=favourites();if(!clubs.some(item=>item.id===club.id)){clubs.unshift(club);saveFavourites(clubs)}saveHomeClub(club);renderFavourites();updateFavouriteButton();updateHomeButton()}$('#homeCourseDialog').close()});

function settingsProfile(){try{const settings=JSON.parse(localStorage.getItem(SETTINGS_KEY))||{},whs=settings.whs===''||settings.whs==null?null:Number(settings.whs);return {playerName:settings.playerName?.trim()||settings.name?.trim()||'Your Name',whs:Number.isFinite(whs)&&whs>=0&&whs<=36?whs:null}}catch{return {playerName:'Your Name',whs:null}}}
function settingsPlayerName(){return settingsProfile().playerName}
function emptyPlayer(name=''){return {name,index:'',courseHandicap:null}}
function ensurePlayerSlots(){if(!state.scores?.length){while(state.players.length<4)state.players.push(emptyPlayer());state.players=state.players.slice(0,4)}if(!state.players[0]?.name){const profile=settingsProfile();if(!state.players[0])state.players[0]=emptyPlayer();state.players[0].name=profile.playerName;if(profile.whs!=null){state.players[0].index=String(profile.whs);if(state.course){const calculated=courseHandicap(profile.whs);state.players[0].courseHandicap=calculated>=0&&calculated<=36?calculated:null}}}}
function friends(){try{const saved=JSON.parse(localStorage.getItem(FRIENDS_KEY));return Array.isArray(saved)?saved:[]}catch{return []}}
function saveFriends(items){localStorage.setItem(FRIENDS_KEY,JSON.stringify(items))}
function sortedFriends(){return friends().sort((a,b)=>surnameFirst(a.name).localeCompare(surnameFirst(b.name),undefined,{sensitivity:'base'}))}
function playerActionIcon(type){if(type==='star')return '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="icon-glow" d="m16 3.2 3.8 8 8.7 1.1-6.4 6 1.7 8.6-7.8-4.3-7.8 4.3 1.7-8.6-6.4-6 8.7-1.1z"/><path class="icon-star" d="m16 5.8 3.1 6.6 7.2.9-5.3 5 1.4 7.1-6.4-3.6-6.4 3.6 1.4-7.1-5.3-5 7.2-.9z"/><path class="icon-shine" d="m12.2 12.9 3.8-5 2 4.4"/></svg>';return '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="remove-cross-shadow" d="M7.5 7.5l9 9M16.5 7.5l-9 9"/><path class="remove-cross" d="M7.5 7.5l9 9M16.5 7.5l-9 9"/><path class="remove-cross-highlight" d="M7.8 7.3l3.7 3.7M16.2 7.3L12.5 11"/></svg>'}
const HANDICAP_OPTIONS={
  stableford:[{mode:'recommended',title:'Standard · 100% Course Handicap',description:'Each player receives their full Course Handicap, with strokes applied by stroke index.'},{mode:'differential',title:'Differential · 100% from lowest',description:'The lowest-handicap player plays from scratch. Every other player receives the full difference between their Course Handicap and the lowest Course Handicap.'}],
  fourball:[{mode:'recommended',title:'Recommended · 90% from lowest',description:'The lowest player plays from zero. Every other player receives 90% of the Course Handicap difference.'},{mode:'full',title:'Full handicap · 100% · no differential',description:'Each player uses their full Course Handicap without reducing against the lowest player.'}],
  greensomes:[{mode:'recommended',title:'Greensomes · 60/40',description:'Each team receives 60% of the lower plus 40% of the higher Course Handicap. In match play, use the difference between team handicaps.'},{mode:'equal',title:'Combined · 50/50',description:'Each team receives 50% of the partners’ combined Course Handicaps, following the common foursomes allowance.'}],
  matchplay:[{mode:'recommended',title:'Recommended · 100% from lowest',description:'The lowest player plays from zero. The other player receives the full Course Handicap difference.'},{mode:'full',title:'Full handicap · 100% · no differential',description:'Both players use their full Course Handicap without reducing against the lowest player.'}],
  strokeplay:[{mode:'recommended',title:'Net Stroke Play · 100% Course Handicap',description:'Each player receives their full Course Handicap. Lowest total net score wins.'}],
  fourtwenty:[{mode:'recommended',title:'Standard · 100% Course Handicap',description:'Each player receives their full Course Handicap before the 4-2-0 points are awarded.'},{mode:'differential',title:'Differential · 100% from lowest',description:'The lowest-handicap player plays from scratch. Every other player receives the full difference between their Course Handicap and the lowest Course Handicap.'}],
  skins:[{mode:'recommended',title:'Net Skins · 100% Course Handicap',description:'Each player receives their full Course Handicap. A unique lowest net score wins the skin; ties carry.'},{mode:'differential',title:'Differential · 100% from lowest',description:'The lowest-handicap player plays from scratch. Other players receive the full difference.'}],
  nassau:[{mode:'recommended',title:'Recommended match allowance',description:'Singles use 100% of the difference. Teams use 90% of the difference with best-ball scoring.'},{mode:'full',title:'Full handicap · no differential',description:'Each player uses their full Course Handicap without reducing against the lowest player.'}]
};
function formatHandicapOptions(){return HANDICAP_OPTIONS[state.format]||HANDICAP_OPTIONS.stableford}
function handicapRuleText(){
  return formatHandicapOptions().find(option=>option.mode===state.handicapMode)?.title||formatHandicapOptions()[0].title;
}
function renderHandicapChoices(){
  $('#handicapFormatTitle').textContent=FORMAT_CONFIG[state.format].name;
  $('#handicapChoices').innerHTML=formatHandicapOptions().map(option=>`<button type="button" class="handicap-choice ${option.mode===state.handicapMode?'active':''}" data-handicap-mode="${option.mode}"><strong>${escapeHtml(option.title)}</strong><span>${escapeHtml(option.description)}</span></button>`).join('');
}
function renderPlayers(){
  ensurePlayerSlots();$('#selectedCourse').textContent=`${state.course.name} · ${state.course.tee} tees · Par ${coursePar()} · Slope ${state.course.slope}`;
  $('#handicapRuleName').textContent=handicapRuleText();
  $('#playerRows').innerHTML=state.players.slice(0,playerCount()).map((player,i)=>{const teamFormat=state.format==='fourball'||state.format==='greensomes'||(state.format==='nassau'&&state.nassauMode==='teams'),teamHeading=teamFormat&&(i===0||i===2)?`<h2 class="team-heading"><span>Team ${i===0?'A':'B'}</span><small>${i===0?'Players 1 & 2':'Players 3 & 4'}</small></h2>`:'',hasPlayer=Boolean(player.name.trim()),action=i===0?'<span class="player-action-spacer" aria-hidden="true"></span>':`<button class="remove-player ${hasPlayer?'':'friend-star'}" ${hasPlayer?`data-clear-player="${i}"`:`data-pick-friend="${i}"`} aria-label="${hasPlayer?`Clear player ${i+1}`:`Choose a friend for player ${i+1}`}">${playerActionIcon(hasPlayer?'remove':'star')}</button>`;return `${teamHeading}<article class="player-row" data-player-row="${i}"><label class="player-name">Name<input value="${escapeHtml(player.name)}" data-player-name="${i}" maxlength="40" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Player ${i+1}"></label><label class="player-whs">WHS<input type="number" inputmode="decimal" min="0" max="36" step="0.1" value="${escapeHtml(formatWHS(player.index))}" data-player-index="${i}"></label><label class="player-course">Course<input type="text" inputmode="numeric" pattern="[0-9]*" value="${player.courseHandicap??''}" data-player-course="${i}" aria-label="Course Handicap for player ${i+1}"></label>${action}</article>`}).join('');
}
$('#playerRows').addEventListener('input',event=>{
  const i=Number(event.target.dataset.playerName??event.target.dataset.playerIndex??event.target.dataset.playerCourse);if(!Number.isInteger(i))return;const player=state.players[i];
  if(event.target.matches('[data-player-name]')){const start=event.target.selectionStart,name=capitalisePlayerNameEntry(event.target.value);event.target.value=name;event.target.setSelectionRange(start,start);player.name=name}
  else if(event.target.matches('[data-player-index]')){const value=Number(event.target.value);if(event.target.value!==''&&(!Number.isFinite(value)||value<0||value>36)){event.target.value='';player.index='';player.courseHandicap=null}else{player.index=event.target.value;player.courseHandicap=event.target.value===''?null:courseHandicap(value);if(player.courseHandicap<0||player.courseHandicap>36)player.courseHandicap=null}document.querySelector(`[data-player-course="${i}"]`).value=player.courseHandicap??''}
  else{const value=Number(event.target.value);if(event.target.value!==''&&(!Number.isInteger(value)||value<0||value>36)){event.target.value='';player.courseHandicap=null}else player.courseHandicap=event.target.value===''?null:value}$('#playerError').textContent='';save();
});
$('#playerRows').addEventListener('change',event=>{if(!event.target.matches('[data-player-index]'))return;const player=state.players[Number(event.target.dataset.playerIndex)],whs=Number(player?.index);if(!player||player.index===''||!Number.isFinite(whs)||whs<0||whs>36)return;player.index=formatWHS(whs);event.target.value=player.index;save();if(!player.friendId)return;const items=friends(),friend=items.find(item=>item.id===player.friendId);if(!friend)return;friend.whs=whs;saveFriends(items)});
let friendPickerSlot=null;
function renderFriendPicker(){const selectedIds=new Set(state.players.map((player,index)=>index===friendPickerSlot?null:player.friendId).filter(Boolean)),items=sortedFriends().filter(item=>!selectedIds.has(item.id));$('#friendPickerList').innerHTML=items.map(item=>`<button type="button" data-select-friend="${escapeHtml(item.id)}">${escapeHtml(surnameFirst(item.name))}</button>`).join('');$('#friendPickerEmpty').textContent=sortedFriends().length?'All saved players have already been selected.':'No saved players. Add friends from Settings first.';$('#friendPickerEmpty').classList.toggle('hidden',items.length>0)}
$('#playerRows').addEventListener('click',event=>{if(event.target.matches('[data-player-course]')){event.target.select();return}const picker=event.target.closest('[data-pick-friend]');if(picker){friendPickerSlot=Number(picker.dataset.pickFriend);renderFriendPicker();$('#friendPickerDialog').showModal();return}const button=event.target.closest('[data-clear-player]');if(!button)return;const i=Number(button.dataset.clearPlayer);state.players[i]=emptyPlayer(i===0?settingsPlayerName():'');renderPlayers();save()});
$('#closeFriendPicker').addEventListener('click',()=>$('#friendPickerDialog').close());
$('#friendPickerList').addEventListener('click',event=>{const button=event.target.closest('[data-select-friend]');if(!button||friendPickerSlot==null)return;const friend=friends().find(item=>item.id===button.dataset.selectFriend);if(!friend)return;const whs=Number(friend.whs),course=courseHandicap(whs);state.players[friendPickerSlot]={name:friend.name,index:formatWHS(friend.whs),courseHandicap:course>=0&&course<=36?course:null,friendId:friend.id};$('#friendPickerDialog').close();renderPlayers();save()});
$('#backToFormat').addEventListener('click',()=>showScreen('format'));
$('#handicapChoices').addEventListener('click',event=>{const button=event.target.closest('[data-handicap-mode]');if(!button)return;state.handicapMode=button.dataset.handicapMode;renderPlayers();showScreen('players');save()});
$('#changeHandicapRule').addEventListener('click',()=>{renderHandicapChoices();showScreen('handicap')});
$('#backToCourse').addEventListener('click',()=>{renderHandicapChoices();showScreen('handicap')});
$('#startRound').addEventListener('click',()=>{const error=$('#playerError'),available=state.players.slice(0,playerCount()),players=available.filter(player=>player.name.trim()),flexible=['stableford','strokeplay','skins'].includes(state.format);if(!players.length){error.textContent='Enter at least one player.';return}if(state.format==='skins'&&players.length<2){error.textContent='Skins needs at least 2 players.';return}if(!flexible&&players.length!==playerCount()){error.textContent=`${FORMAT_CONFIG[state.format].name} needs ${playerCount()} players.`;return}if(players.some(player=>player.courseHandicap==null||player.courseHandicap===''||!Number.isInteger(Number(player.courseHandicap))||Number(player.courseHandicap)<0||Number(player.courseHandicap)>36)){error.textContent='Each named player needs a Course Handicap from 0 to 36.';return}document.activeElement?.blur();state.players=players.map(player=>({...player,name:player.name.trim(),courseHandicap:Number(player.courseHandicap)}));state.scores=state.players.map(()=>Array(18).fill(null));state.hole=0;error.textContent='';renderScore();showScreen('score');setTimeout(()=>window.scrollTo({top:0,left:0,behavior:'auto'}),50);save()});

let selectedPlayer=0,swipeStartX=0,swipeStartY=0,suppressPlayerClickUntil=0,testMode=false,testModeTimer=null;
let autoAdvance=(()=>{try{return localStorage.getItem(AUTO_ADVANCE_KEY)==='true'}catch{return false}})(),autoAdvanceTimer=null,autoAdvanceCountdownHole=null;
function holeComplete(hole=state.hole){return state.scores.every(scores=>scores[hole]!=null)}
function holeClosed(hole=state.hole){return Boolean(state.scores.length)&&state.scores.every(scores=>scores[hole]===NO_SCORE)}
function completedHoleCount(){return Array.from({length:18},(_,hole)=>holeComplete(hole)).filter(Boolean).length}
function firstIncompleteHole(){const hole=Array.from({length:18},(_,i)=>i).find(i=>!holeComplete(i));return hole??17}
function cancelAutoAdvanceCountdown(){if(!autoAdvanceTimer)return;clearTimeout(autoAdvanceTimer);autoAdvanceTimer=null;autoAdvanceCountdownHole=null;$('#autoProgressTrack').classList.remove('counting')}
function renderAutoAdvanceBar(){const track=$('#autoProgressTrack');track.classList.toggle('enabled',autoAdvance);if(!autoAdvanceTimer)track.classList.remove('counting')}
function autoAdvanceCompletedHole(wasComplete){if(!autoAdvance||wasComplete||!holeComplete()||state.hole===17)return false;const countdownHole=state.hole,track=$('#autoProgressTrack');cancelAutoAdvanceCountdown();autoAdvanceCountdownHole=countdownHole;track.classList.remove('counting');void track.offsetWidth;track.classList.add('counting');autoAdvanceTimer=setTimeout(()=>{autoAdvanceTimer=null;autoAdvanceCountdownHole=null;track.classList.remove('counting');if(state.hole===countdownHole&&holeComplete())moveHole(1)},3000);return true}
document.addEventListener('pointerdown',cancelAutoAdvanceCountdown,true);document.addEventListener('wheel',cancelAutoAdvanceCountdown,{capture:true,passive:true});document.addEventListener('keydown',cancelAutoAdvanceCountdown,true);
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
function isTeamMatchFormat(){return state.format==='fourball'||state.format==='greensomes'||(state.format==='nassau'&&state.nassauMode==='teams')}
function matchHoleWinner(hole){
  if(!holeComplete(hole))return 0;const handicaps=playingHandicaps();
  if(state.format==='fourball'||(state.format==='nassau'&&state.nassauMode==='teams')){
    const teamA=Math.min(netFor(0,hole,handicaps),netFor(1,hole,handicaps)),teamB=Math.min(netFor(2,hole,handicaps),netFor(3,hole,handicaps));return teamA===teamB?0:teamA<teamB?1:-1;
  }
  if(state.format==='greensomes'){const teamA=netFor(0,hole,handicaps),teamB=netFor(2,hole,handicaps);return teamA===teamB?0:teamA<teamB?1:-1}
  const first=netFor(0,hole,handicaps),second=netFor(1,hole,handicaps);return first===second?0:first<second?1:-1;
}
function matchStanding(throughHole=state.hole){return Array.from({length:throughHole+1},(_,hole)=>matchHoleWinner(hole)).reduce((sum,result)=>sum+result,0)}
function teamMatchStatus(team){const standing=matchStanding()*(team==='A'?1:-1);return standing===0?'A/S':`${Math.abs(standing)} ${standing>0?'Up':'Down'}`}
function teamMatchStatusClass(team){const standing=matchStanding()*(team==='A'?1:-1);return standing===0?'all-square':standing>0?'up':'down'}
function playerMatchStatus(playerIndex){const standing=matchStanding()*(playerIndex===0?1:-1);return standing===0?'A/S':`${Math.abs(standing)}${standing>0?'up':'dn'}`}
function matchStatus(){
  const standing=matchStanding(),played=Array.from({length:state.hole+1},(_,hole)=>holeComplete(hole)).filter(Boolean).length;if(!standing)return played===18?'Match halved':'All square';
  const leader=isTeamMatchFormat()?(standing>0?'Team A':'Team B'):(standing>0?state.players[0].name:state.players[1].name),lead=Math.abs(standing),remaining=18-played;
  if(!remaining)return `${leader} wins ${lead} up`;if(lead>remaining)return `${leader} wins ${lead} & ${remaining}`;return `${leader} ${lead} up`;
}
function skinsLedger(){
  const stake=Number(state.skinsStake)||1,wins=state.players.map(()=>0),moneyWon=state.players.map(()=>0),holes=[];let carry=0;
  for(let hole=0;hole<18;hole++){
    carry+=stake;if(!holeComplete(hole)){holes.push({winner:null,value:carry,pending:true});continue}
    const nets=state.players.map((_,i)=>netFor(i,hole)),best=Math.min(...nets),leaders=nets.map((net,i)=>net===best?i:-1).filter(i=>i>=0);
    if(leaders.length===1&&best!==Infinity){const winner=leaders[0];wins[winner]++;moneyWon[winner]+=carry;holes.push({winner,value:carry});carry=0}else holes.push({winner:null,value:carry});
  }
  return {stake,wins,moneyWon,holes,carry};
}
function skinsSettlements(){
  const {holes}=skinsLedger(),balances=state.players.map(()=>0);
  for(const skin of holes){if(skin.winner==null)continue;balances[skin.winner]+=skin.value*(state.players.length-1);balances.forEach((_,i)=>{if(i!==skin.winner)balances[i]-=skin.value})}
  const creditors=balances.map((amount,i)=>({i,amount})).filter(item=>item.amount>.005),debtors=balances.map((amount,i)=>({i,amount:-amount})).filter(item=>item.amount>.005),settlements=[];
  for(const debtor of debtors)for(const creditor of creditors){if(debtor.amount<=.005||creditor.amount<=.005)continue;const amount=Math.min(debtor.amount,creditor.amount);settlements.push({from:debtor.i,to:creditor.i,amount});debtor.amount-=amount;creditor.amount-=amount}
  return settlements;
}
function nassauSegment(start,end){const standing=Array.from({length:end-start},(_,offset)=>matchHoleWinner(start+offset)).reduce((sum,result)=>sum+result,0),label=standing===0?'Halved':`${isTeamMatchFormat()?(standing>0?'Team A':'Team B'):(standing>0?state.players[0].name:state.players[1].name)} ${Math.abs(standing)} up`;return {standing,label}}
function nassauResults(){return [{name:'Front 9',...nassauSegment(0,9)},{name:'Back 9',...nassauSegment(9,18)},{name:'Overall',...nassauSegment(0,18)}]}
function scoreText(score){return score===NO_SCORE?'NS':score??'—'}
function playerTotal(i){const handicap=playingHandicaps()[i];if(state.format==='stableford')return state.scores[i].reduce((sum,score,hole)=>sum+(pointsFor(score,state.players[i],hole,handicap)||0),0);if(state.format==='fourtwenty')return Array.from({length:18},(_,hole)=>fourTwentyPoints(hole)[i]||0).reduce((a,b)=>a+b,0);if(state.format==='strokeplay'){if(state.scores[i].includes(NO_SCORE))return Infinity;return Array.from({length:18},(_,hole)=>netFor(i,hole,playingHandicaps())).reduce((sum,net)=>sum+net,0)}if(state.format==='skins')return skinsLedger().wins[i];return state.scores[i].reduce((sum,score)=>sum+(typeof score==='number'?score:0),0)}
function greensomesTeamTotal(start){return state.scores[start].includes(NO_SCORE)?Infinity:state.scores[start].reduce((sum,score)=>sum+(typeof score==='number'?score:0),0)}
function summaryResultText(){if(state.format==='fourball'||state.format==='greensomes'||state.format==='matchplay')return matchStatus();if(state.format==='nassau')return nassauResults().map(result=>`${result.name}: ${result.label}`).join(' · ');if(state.format==='skins'){const ledger=skinsLedger(),best=Math.max(...ledger.moneyWon),winners=state.players.filter((_,i)=>ledger.moneyWon[i]===best&&best>0).map(player=>player.name);return best>0?`${winners.join(' & ')} · £${best.toFixed(2)} in skins`:'No skins won'}const totals=state.players.map((_,i)=>playerTotal(i)),lowestWins=state.format==='strokeplay',eligible=lowestWins?totals.filter(Number.isFinite):totals;if(!eligible.length)return 'No valid net score';const best=(lowestWins?Math.min:Math.max)(...eligible),winners=state.players.filter((_,i)=>totals[i]===best).map(player=>player.name);return `${winners.join(' & ')} · ${best} ${state.format==='stableford'?'points':state.format==='strokeplay'?'net':'pts'}`}
function holeFormatValue(i,hole){const handicap=playingHandicaps()[i];if(state.format==='stableford')return pointsFor(state.scores[i][hole],state.players[i],hole,handicap);if(state.format==='fourtwenty')return fourTwentyPoints(hole)[i];if(state.format==='skins'){const skin=skinsLedger().holes[hole];return skin.winner===i?`£${skin.value.toFixed(2)}`:'—'}return netFor(i,hole)}
function renderSummary(){
  $('#summaryCourse').textContent=`${state.course.name} · ${state.course.tee} tees · ${FORMAT_CONFIG[state.format].name}`;$('#summaryResult').innerHTML=`<small>FINAL RESULT</small><strong>${escapeHtml(summaryResultText())}</strong>`;
  if(state.format==='skins'){const ledger=skinsLedger(),settlements=skinsSettlements();$('#summaryPlayers').innerHTML=`<section class="summary-card card"><h2>Settle after the round</h2><div class="settlement-list">${settlements.length?settlements.map(item=>`<div class="settlement-row"><span>${escapeHtml(state.players[item.from].name)} pays ${escapeHtml(state.players[item.to].name)}</span><strong>£${item.amount.toFixed(2)}</strong></div>`).join(''):'<div class="settlement-row settled">Nothing to settle</div>'}</div>${ledger.carry?`<p class="skins-carry">£${ledger.carry.toFixed(2)} finished unclaimed.</p>`:''}</section>`;$('#summaryTable').innerHTML=`<thead><tr><th>Hole</th><th>Winner</th><th>Value</th></tr></thead><tbody>${ledger.holes.map((skin,hole)=>`<tr><td>${hole+1}</td><td>${skin.winner==null?'Carry':escapeHtml(state.players[skin.winner].name)}</td><td>£${skin.value.toFixed(2)}</td></tr>`).join('')}</tbody>`;return}
  if(state.format==='greensomes')$('#summaryPlayers').innerHTML=[0,2].map(start=>{const team=start===0?'A':'B',total=greensomesTeamTotal(start);return `<article class="summary-player"><div><strong>Team ${team}</strong><span>${escapeHtml(state.players[start].name)} &amp; ${escapeHtml(state.players[start+1].name)} · PH ${playingHandicaps()[start]}</span></div><strong>${total===Infinity?'NS':total} gross</strong></article>`}).join('');
  else if(state.format==='nassau')$('#summaryPlayers').innerHTML=nassauResults().map(result=>`<article class="summary-player"><div><strong>${result.name}</strong><span>${state.nassauMode==='teams'?'Best-ball teams':'Singles'}</span></div><strong>${escapeHtml(result.label)}</strong></article>`).join('');else $('#summaryPlayers').innerHTML=state.players.map((player,i)=>`<article class="summary-player"><div><strong>${escapeHtml(player.name)}</strong><span>WHS ${escapeHtml(formatWHS(player.index,'—'))} · CH ${player.courseHandicap} · PH ${playingHandicaps()[i]}</span></div><strong>${playerTotal(i)===Infinity?'NS':playerTotal(i)}${state.format==='stableford'?' pts':state.format==='strokeplay'&&playerTotal(i)!==Infinity?' net':''}</strong></article>`).join('');
  const summaryPlayers=state.format==='greensomes'?[{name:'Team A',i:0},{name:'Team B',i:2}]:state.players.map((player,i)=>({name:player.name,i})),headings=summaryPlayers.map(item=>`<th>${escapeHtml(item.name)}</th>`).join(''),rows=Array.from({length:18},(_,hole)=>`<tr><td>${hole+1}</td><td>${state.course.pars[hole]}</td><td>${state.course.indexes[hole]}</td>${summaryPlayers.map(item=>`<td>${scoreText(state.scores[item.i][hole])} / ${holeFormatValue(item.i,hole)===Infinity?'NS':holeFormatValue(item.i,hole)}</td>`).join('')}</tr>`).join('');
  $('#summaryTable').innerHTML=`<thead><tr><th>Hole</th><th>Par</th><th>SI</th>${headings}</tr></thead><tbody>${rows}</tbody>`;
}
function showSummary(){renderSummary();showScreen('summary');window.scrollTo({top:0,behavior:'smooth'});save();loadPdfLibraries().catch(()=>{})}
let pdfLibrariesPromise=null;
function loadExternalScript(src){return new Promise((resolve,reject)=>{const existing=document.querySelector(`script[src="${src}"]`);if(existing){if(existing.dataset.loaded)resolve();else existing.addEventListener('load',resolve,{once:true});return}const script=document.createElement('script');script.src=src;script.onload=()=>{script.dataset.loaded='true';resolve()};script.onerror=reject;document.head.appendChild(script)})}
function loadPdfLibraries(){return pdfLibrariesPromise??=(async()=>{await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js')})()}
async function createScorecardPdf(){
  await loadPdfLibraries();const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'}),handicaps=playingHandicaps(),format=FORMAT_CONFIG[state.format].name,date=new Intl.DateTimeFormat('en-GB',{dateStyle:'long'}).format(new Date());
  doc.setTextColor(20,54,41);doc.setFontSize(22);doc.text('CaddieCard - Scorecard Summary',14,15);doc.setFontSize(11);doc.text(`${state.course.name} | ${state.course.tee} tees | ${date}`,14,23);doc.text(`${format} | ${handicapRuleText()} | Par ${coursePar()} | Rating ${state.course.rating} | Slope ${state.course.slope}`,14,29);doc.setFontSize(15);doc.text(`Final result: ${summaryResultText()}`,14,38);
  const pdfPlayers=state.format==='greensomes'?[{name:`Team A: ${state.players[0].name} & ${state.players[1].name}`,i:0},{name:`Team B: ${state.players[2].name} & ${state.players[3].name}`,i:2}]:state.players.map((player,i)=>({name:player.name,i}));
  doc.autoTable({startY:43,head:[state.format==='greensomes'?['Team','Playing Hcp','Gross total']:['Player','WHS','Course Hcp','Playing Hcp','Total']],body:state.format==='greensomes'?pdfPlayers.map(item=>[item.name,handicaps[item.i],greensomesTeamTotal(item.i)===Infinity?'NS':greensomesTeamTotal(item.i)]):state.players.map((player,i)=>[player.name,formatWHS(player.index,'-'),player.courseHandicap,handicaps[i],playerTotal(i)]),theme:'grid',headStyles:{fillColor:[20,54,41]}});
  pdfPlayers.forEach(item=>{const i=item.i;doc.addPage('a4','landscape');doc.setFontSize(18);doc.setTextColor(20,54,41);doc.text(`${item.name} - complete scorecard`,14,15);const body=Array.from({length:18},(_,hole)=>{const gross=state.scores[i][hole],strokes=strokesOnHole(handicaps[i],state.course.indexes[hole]),net=netFor(i,hole,handicaps),value=holeFormatValue(i,hole);return [hole+1,state.course.pars[hole],state.course.indexes[hole],scoreText(gross),strokes,net===Infinity?'NS':net,value===Infinity?'NS':value]});doc.autoTable({startY:21,head:[['Hole','Par','SI','Gross','Strokes','Net',state.format==='stableford'?'Points':state.format==='fourtwenty'?'4-2-0 points':'Format result']],body,theme:'grid',headStyles:{fillColor:[20,54,41]},styles:{halign:'center'}})});
  doc.addPage('a4','landscape');doc.setFontSize(18);doc.setTextColor(20,54,41);doc.text('Round hole-by-hole overview',14,15);doc.autoTable({startY:21,head:[['Hole','Par','SI',...pdfPlayers.flatMap(item=>[`${item.name} gross`,`${item.name} result`])]],body:Array.from({length:18},(_,hole)=>[hole+1,state.course.pars[hole],state.course.indexes[hole],...pdfPlayers.flatMap(item=>[scoreText(state.scores[item.i][hole]),holeFormatValue(item.i,hole)===Infinity?'NS':holeFormatValue(item.i,hole)])]),theme:'grid',headStyles:{fillColor:[20,54,41]},styles:{fontSize:7,halign:'center'}});return doc.output('blob')
}
async function shareScorecardPdf(){const button=$('#sharePdf'),error=$('#summaryError');button.disabled=true;button.textContent='Preparing PDF…';error.textContent='';try{const blob=await createScorecardPdf(),safeName=state.course.name.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,''),file=new File([blob],`CaddieCard-${safeName}.pdf`,{type:'application/pdf'});if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({title:'CaddieCard scorecard',text:`${FORMAT_CONFIG[state.format].name} at ${state.course.name}`,files:[file]});else{const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}catch(err){if(err.name!=='AbortError')error.textContent='The PDF could not be prepared. Please try again.'}finally{button.disabled=false;button.textContent='Share PDF'}}
function renderScore(){
  const h=state.hole,complete=completedHoleCount(),handicaps=playingHandicaps();$('#holeCounter').textContent=`${FORMAT_CONFIG[state.format].name.toUpperCase()} · HOLE ${h+1} OF 18`;$('#holeTitle').textContent=`Hole ${h+1}`;$('#holeDetails').textContent=`Par ${state.course.pars[h]} · Stroke index ${state.course.indexes[h]}`;$('#scoreProgress').style.width=`${complete/18*100}%`;
  renderAutoAdvanceBar();
  const closed=holeClosed(h),closedButton=$('#toggleHoleClosed');closedButton.classList.toggle('active',closed);closedButton.setAttribute('aria-pressed',String(closed));
  const playerCard=(player,i)=>{const gross=state.scores[i][h],playingHandicap=handicaps[i],strokes=strokesOnHole(playingHandicap,state.course.indexes[h]),strokeText=strokes>0?`${strokes} stroke${strokes===1?'':'s'}`:strokes<0?`gives ${Math.abs(strokes)}`:'no stroke';let value,label,detail;
    if(state.format==='stableford'){value=pointsFor(gross,player,h,playingHandicap);const total=state.scores[i].reduce((sum,score,hole)=>sum+(pointsFor(score,player,hole,playingHandicap)||0),0);label='Points';detail=`CH ${player.courseHandicap} · ${strokeText} · Total ${total} pts`}
    else if(state.format==='fourtwenty'){const holePoints=fourTwentyPoints(h),total=Array.from({length:18},(_,hole)=>fourTwentyPoints(hole)[i]||0).reduce((a,b)=>a+b,0);value=holePoints[i];label='4-2-0';detail=`CH ${player.courseHandicap} · ${strokeText} · Total ${total}`}
    else{const net=netFor(i,h,handicaps),teamLabel=state.format==='fourball'||(state.format==='nassau'&&state.nassauMode==='teams')?`Team ${i<2?'A':'B'} · `:'',skinLabel=state.format==='skins'?` · £${skinsLedger().holes[h].value.toFixed(2)} skin`:'';value=net===Infinity?'NS':net;label='Net';detail=`${teamLabel}CH ${player.courseHandicap} · PH ${playingHandicap} · ${strokeText}${skinLabel}`}
    const matchName=state.format==='matchplay'||(state.format==='nassau'&&state.nassauMode==='singles'),nameLine=matchName?`<span class="score-player-name match-name">${escapeHtml(player.name)} <span>|</span> <strong>${playerMatchStatus(i)}</strong></span>`:`<span class="score-player-name">${escapeHtml(player.name)}</span>`;return `<button class="score-player ${gross!=null?'complete':''} ${i===selectedPlayer?'selected':''}" data-player="${i}"><span>${nameLine}<span class="score-player-detail">${detail}</span></span><span class="score-gross"><strong>${gross===NO_SCORE?'NS':gross??'—'}</strong><small>Gross</small></span><span class="score-points"><strong>${value??'—'}</strong><small>${label}</small></span></button>`};
  if(state.format==='fourball'||(state.format==='nassau'&&state.nassauMode==='teams'))$('#scorePlayers').innerHTML=[0,2].map(start=>{const team=start===0?'A':'B';return `<section class="score-team-group" data-team-start="${start}"><h2 class="score-team-heading"><span>TEAM ${team}</span><strong class="${teamMatchStatusClass(team)}">${teamMatchStatus(team)}</strong></h2><div class="score-team-members">${playerCard(state.players[start],start)}${playerCard(state.players[start+1],start+1)}</div></section>`}).join('');
  else if(state.format==='greensomes')$('#scorePlayers').innerHTML=[0,2].map(start=>{const team=start===0?'A':'B',gross=state.scores[start][h],playingHandicap=handicaps[start],strokes=strokesOnHole(playingHandicap,state.course.indexes[h]),count=Math.abs(strokes),strokeText=strokes>0?(count===1?'One stroke':`${count} strokes`):strokes<0?(count===1?'Gives one stroke':`Gives ${count} strokes`):'No stroke',net=netFor(start,h,handicaps);return `<section class="score-team-group greensomes-group"><h2 class="score-team-heading"><span>TEAM ${team}</span><strong class="${teamMatchStatusClass(team)}">${teamMatchStatus(team)}</strong></h2><button class="score-player greensomes-team ${gross!=null?'complete':''} ${start===selectedPlayer?'selected':''}" data-player="${start}"><span><span class="score-player-name greensomes-pair-name"><span>${escapeHtml(state.players[start].name)}</span><span>${escapeHtml(state.players[start+1].name)}</span></span><span class="score-player-detail">${strokeText}</span></span><span class="score-gross"><strong>${gross===NO_SCORE?'NS':gross??'—'}</strong><small>Gross</small></span><span class="score-points"><strong>${net===Infinity?'NS':net??'—'}</strong><small>Net</small></span></button></section>`}).join('');
  else $('#scorePlayers').innerHTML=state.players.map(playerCard).join('');
  const limit=firstIncompleteHole();$('#holeDots').innerHTML=Array.from({length:18},(_,i)=>`<button class="hole-dot ${i===h?'active':''} ${holeComplete(i)?'scored':''} ${i>limit?'blocked':''}" data-hole="${i}" aria-disabled="${i>limit}">${i+1}</button>`).join('');
}
const scoreEntryDialog=$('#scoreEntryDialog');
function updateRecordedScore(){const score=state.scores[selectedPlayer]?.[state.hole];document.querySelectorAll('#scoreKeypad button').forEach(key=>{const recorded=score===NO_SCORE?key.hasAttribute('data-no-score'):key.dataset.score===String(score);key.classList.toggle('recorded',recorded);key.setAttribute('aria-pressed',String(recorded))})}
function renderTeamScoreTabs(){const tabs=$('#teamScoreTabs'),teamEntry=state.format==='fourball'||(state.format==='nassau'&&state.nassauMode==='teams');tabs.classList.toggle('hidden',!teamEntry);if(!teamEntry)return;const start=selectedPlayer<2?0:2;tabs.innerHTML=[start,start+1].map(i=>{const score=state.scores[i][state.hole];return `<button type="button" class="team-score-tab ${i===selectedPlayer?'active':''} ${score!=null?'complete':''}" data-team-player="${i}"><span>${escapeHtml(state.players[i].name)}</span><strong>${score===NO_SCORE?'NS':score??'—'}</strong></button>`}).join('')}
function updateScoreEntry(){const player=state.players[selectedPlayer],team=selectedPlayer<2?'A':'B',title=$('#keypadPlayer'),teamEntry=state.format==='fourball'||(state.format==='nassau'&&state.nassauMode==='teams');if(state.format==='greensomes')title.innerHTML=`<span>${escapeHtml(player.name)}</span><span>${escapeHtml(state.players[selectedPlayer+1].name)}</span>`;else title.textContent=teamEntry?`TEAM ${team}`:player.name;title.classList.toggle('greensomes-pair-title',state.format==='greensomes');$('#scoreEntryHole').textContent=`HOLE ${state.hole+1} · PAR ${state.course.pars[state.hole]}`;renderTeamScoreTabs();updateRecordedScore()}
function openScoreEntry(){updateScoreEntry();scoreEntryDialog.showModal()}
function closeScoreEntry(){if(scoreEntryDialog.open)scoreEntryDialog.close()}
function setGrossScore(gross){const wasComplete=holeComplete(),scoredPlayer=selectedPlayer,teamEntry=state.format==='fourball'||(state.format==='nassau'&&state.nassauMode==='teams');state.scores[scoredPlayer][state.hole]=gross;if(state.format==='greensomes')state.scores[scoredPlayer+1][state.hole]=gross;save();$('#scoreError').textContent='';if(teamEntry){const start=scoredPlayer<2?0:2,partner=scoredPlayer===start?start+1:start;if(state.scores[partner][state.hole]==null){selectedPlayer=partner;renderScore();updateScoreEntry();return}}closeScoreEntry();const missing=state.scores.findIndex(scores=>scores[state.hole]==null);if(missing>=0)selectedPlayer=state.format==='greensomes'?(missing<2?0:2):missing;renderScore();autoAdvanceCompletedHole(wasComplete)}
$('#scorePlayers').addEventListener('click',event=>{if(Date.now()<suppressPlayerClickUntil)return;const player=event.target.closest('[data-player]'),teamGroup=event.target.closest('[data-team-start]');if(!player&&!teamGroup)return;if(player)selectedPlayer=Number(player.dataset.player);else{const start=Number(teamGroup.dataset.teamStart);selectedPlayer=state.scores[start][state.hole]==null?start:state.scores[start+1][state.hole]==null?start+1:start}renderScore();openScoreEntry()});
$('#teamScoreTabs').addEventListener('click',event=>{const tab=event.target.closest('[data-team-player]');if(!tab)return;selectedPlayer=Number(tab.dataset.teamPlayer);updateScoreEntry()});
$('#scoreKeypad').addEventListener('click',event=>{const key=event.target.closest('button');if(!key)return;if(key.dataset.score)setGrossScore(Number(key.dataset.score));else if(key.hasAttribute('data-no-score'))setGrossScore(NO_SCORE)});
function updateTestMode(){const button=$('#toggleHoleClosed'),status=$('#testModeStatus');button.textContent=testMode?'AUTO':'Hole closed';button.classList.toggle('auto-score',testMode);button.classList.toggle('active',!testMode&&holeClosed());button.setAttribute('aria-label',testMode?'Automatically score every player on this hole':'Toggle hole closed');if(status)status.textContent=testMode?'AUTO ENABLED':''}
function autoScoreHole(){const par=Number(state.course.pars[state.hole]);state.scores.forEach(scores=>scores[state.hole]=par-1+Math.floor(Math.random()*4));save();closeScoreEntry();selectedPlayer=0;$('#scoreError').textContent='';moveHole(1)}
const settingsTestLogo=$('#settingsTestLogo');
function cancelTestModeHold(){clearTimeout(testModeTimer);testModeTimer=null}
settingsTestLogo.addEventListener('pointerdown',event=>{event.preventDefault();cancelTestModeHold();testModeTimer=setTimeout(()=>{testMode=!testMode;updateTestMode();navigator.vibrate?.(60);testModeTimer=null},2000)});
['pointerup','pointercancel'].forEach(type=>settingsTestLogo.addEventListener(type,cancelTestModeHold));
settingsTestLogo.addEventListener('contextmenu',event=>event.preventDefault());settingsTestLogo.addEventListener('dragstart',event=>event.preventDefault());
$('#toggleHoleClosed').addEventListener('click',()=>{if(testMode){autoScoreHole();return}const wasComplete=holeComplete(),close=!holeClosed();state.scores.forEach(scores=>{if(close)scores[state.hole]=NO_SCORE;else if(scores[state.hole]===NO_SCORE)scores[state.hole]=null});selectedPlayer=0;$('#scoreError').textContent='';renderScore();save();if(close)autoAdvanceCompletedHole(wasComplete)});
$('#closeScoreEntry').addEventListener('click',closeScoreEntry);scoreEntryDialog.addEventListener('cancel',event=>{event.preventDefault();closeScoreEntry()});
function blockedAdvance(){if(holeComplete())return false;$('#scoreError').textContent='Enter a score for every player before moving to the next hole.';return true}
function moveHole(change){cancelAutoAdvanceCountdown();if(change>0&&blockedAdvance())return;if(change>0&&state.hole===17){showSummary();return}state.hole=Math.max(0,Math.min(17,state.hole+change));selectedPlayer=Math.max(0,state.scores.findIndex(scores=>scores[state.hole]==null));$('#scoreError').textContent='';renderScore();save()}
$('#holeDots').addEventListener('click',event=>{const button=event.target.closest('[data-hole]');if(!button)return;const target=Number(button.dataset.hole);if(target>firstIncompleteHole()){blockedAdvance();return}state.hole=target;selectedPlayer=Math.max(0,state.scores.findIndex(scores=>scores[state.hole]==null));$('#scoreError').textContent='';renderScore();save()});
$('#scoreScreen').addEventListener('touchstart',event=>{const touch=event.touches[0];swipeStartX=touch.clientX;swipeStartY=touch.clientY},{passive:true});
$('#scoreScreen').addEventListener('touchend',event=>{const touch=event.changedTouches[0],dx=touch.clientX-swipeStartX,dy=touch.clientY-swipeStartY;if(Math.abs(dx)<55||Math.abs(dx)<Math.abs(dy)*1.3)return;suppressPlayerClickUntil=Date.now()+500;if(dx<0)moveHole(1);else if(state.hole>0)moveHole(-1)},{passive:true});
$('#cancelFinish').addEventListener('click',()=>$('#finishDialog').close());
$('#backToScoring').addEventListener('click',()=>{renderScore();showScreen('score')});
$('#startNewRound').addEventListener('click',()=>$('#finishDialog').showModal());
$('#sharePdf').addEventListener('click',shareScorecardPdf);
function clearRound(){localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(LEGACY_STORAGE_KEY);location.reload()}
$('#confirmFinish').addEventListener('click',clearRound);
$('#openSettings').addEventListener('click',()=>{$('#autoAdvanceSetting').checked=autoAdvance;$('#settingsDialog').showModal()});
$('#closeSettings').addEventListener('click',()=>$('#settingsDialog').close());
$('#autoAdvanceSetting').addEventListener('change',event=>{autoAdvance=event.target.checked;cancelAutoAdvanceCountdown();try{localStorage.setItem(AUTO_ADVANCE_KEY,String(autoAdvance))}catch{}if(state.scores.length&&!$('#scoreScreen').classList.contains('hidden'))renderAutoAdvanceBar()});
$('#openAbandonScoring').addEventListener('click',()=>{$('#settingsDialog').close();$('#abandonDialog').showModal()});
$('#cancelAbandon').addEventListener('click',()=>{$('#abandonDialog').close();$('#settingsDialog').showModal()});
$('#confirmAbandon').addEventListener('click',clearRound);
$('#openProfileSettings').addEventListener('click',()=>{const profile=settingsProfile();$('#settingsDialog').close();$('#settingsPlayerName').value=profile.playerName;$('#settingsPlayerWhs').value=formatWHS(profile.whs);$('#settingsProfileError').textContent='';$('#profileSettingsDialog').showModal();setTimeout(()=>{$('#settingsPlayerName').focus();$('#settingsPlayerName').select()},0)});
$('#cancelProfileSettings').addEventListener('click',()=>{$('#profileSettingsDialog').close();$('#settingsDialog').showModal()});
$('#saveProfileSettings').addEventListener('click',()=>{const playerName=$('#settingsPlayerName').value.trim()||'Your Name',rawWhs=$('#settingsPlayerWhs').value,whs=rawWhs===''?null:Number(rawWhs);if(whs!=null&&(!Number.isFinite(whs)||whs<0||whs>36)){ $('#settingsProfileError').textContent='WHS must be between 0 and 36.';return}localStorage.setItem(SETTINGS_KEY,JSON.stringify({playerName,whs}));ensurePlayerSlots();state.players[0].name=playerName;state.players[0].index=whs==null?'':String(whs);if(whs==null)state.players[0].courseHandicap=null;else if(state.course){const calculated=courseHandicap(whs);state.players[0].courseHandicap=calculated>=0&&calculated<=36?calculated:null}save();if(state.course&&!$('#playersScreen').classList.contains('hidden'))renderPlayers();$('#profileSettingsDialog').close()});

let editingFriendId=null;
function renderFriends(){const items=sortedFriends();$('#friendsList').innerHTML=items.map(item=>`<article class="friend-row"><div><strong>${escapeHtml(surnameFirst(item.name))}</strong><span>WHS ${escapeHtml(formatWHS(item.whs))}</span></div><div class="friend-actions"><button type="button" data-edit-friend="${escapeHtml(item.id)}" aria-label="Edit ${escapeHtml(item.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="action-shadow" d="m5 19 1.1-4.2L15.9 5l3.1 3.1-9.8 9.8z"/><path class="action-line" d="m5 19 1.1-4.2L15.9 5l3.1 3.1-9.8 9.8zM14.5 6.4l3.1 3.1M6.1 14.8l3.1 3.1"/><path class="action-shine" d="m16.1 6.2 1.7 1.7"/></svg></button><button type="button" class="delete-friend" data-delete-friend="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="action-shadow" d="M7 8h10l-.7 11H7.7z"/><path class="action-line" d="M7 8h10l-.7 11H7.7zM5.5 8h13M9.5 8V5.5h5V8M10 11v5M14 11v5"/><path class="action-shine" d="M8.6 9.5h6.8"/></svg></button></div></article>`).join('');$('#friendsEmpty').classList.toggle('hidden',items.length>0)}
function sizeFriendEditor(){const dialog=$('#friendEditorDialog'),widths=[window.visualViewport?.width,document.documentElement.clientWidth,document.body.getBoundingClientRect().width,window.innerWidth,screen.width].filter(value=>Number.isFinite(value)&&value>0),viewportWidth=Math.min(...widths);dialog.style.width=`${Math.max(260,Math.min(430,viewportWidth-26))}px`;dialog.style.maxWidth=`${Math.max(260,viewportWidth-26)}px`}
function openFriendEditor(friend=null){editingFriendId=friend?.id||null;$('#friendEditorTitle').textContent=friend?'Edit friend':'Add friend';$('#friendName').value=friend?.name||'';$('#friendWhs').value=formatWHS(friend?.whs);$('#friendEditorError').textContent='';$('#friendsDialog').close();sizeFriendEditor();$('#friendEditorDialog').showModal();requestAnimationFrame(()=>requestAnimationFrame(sizeFriendEditor))}
window.visualViewport?.addEventListener('resize',()=>{if($('#friendEditorDialog').open)sizeFriendEditor()});window.addEventListener('orientationchange',()=>{if($('#friendEditorDialog').open)setTimeout(sizeFriendEditor,50)});
$('#openFriends').addEventListener('click',()=>{$('#settingsDialog').close();renderFriends();$('#friendsDialog').showModal()});
$('#closeFriends').addEventListener('click',()=>$('#friendsDialog').close());
$('#addFriend').addEventListener('click',()=>openFriendEditor());
$('#friendName').addEventListener('input',event=>{const start=event.target.selectionStart;event.target.value=capitalisePlayerNameEntry(event.target.value);event.target.setSelectionRange(start,start)});
$('#friendName').addEventListener('blur',event=>{event.target.value=capitalisePlayerName(event.target.value)});
$('#cancelFriendEditor').addEventListener('click',()=>{$('#friendEditorDialog').close();renderFriends();$('#friendsDialog').showModal()});
$('#saveFriend').addEventListener('click',()=>{const name=capitalisePlayerName($('#friendName').value),whs=Number($('#friendWhs').value),error=$('#friendEditorError');$('#friendName').value=name;if(!name){error.textContent='Enter your friend’s name.';return}if($('#friendWhs').value===''||!Number.isFinite(whs)||whs<0||whs>36){error.textContent='Enter a WHS between 0 and 36.';return}const items=friends(),duplicate=items.find(item=>item.id!==editingFriendId&&item.name.toLocaleLowerCase()===name.toLocaleLowerCase());if(duplicate){error.textContent='That friend is already in your list.';return}const existing=items.find(item=>item.id===editingFriendId),saved={id:existing?.id||`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,name,whs};if(existing)Object.assign(existing,saved);else items.push(saved);saveFriends(items);$('#friendEditorDialog').close();renderFriends();$('#friendsDialog').showModal()});
$('#friendsList').addEventListener('click',event=>{const edit=event.target.closest('[data-edit-friend]'),remove=event.target.closest('[data-delete-friend]'),items=friends();if(edit){openFriendEditor(items.find(item=>item.id===edit.dataset.editFriend));return}if(remove){saveFriends(items.filter(item=>item.id!==remove.dataset.deleteFriend));renderFriends()}});

try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||localStorage.getItem(LEGACY_STORAGE_KEY));if(saved?.course){Object.assign(state,saved);state.handicapMode=state.handicapMode||'recommended';if(state.scores?.length){state.format=state.format||'stableford';if(completedHoleCount()===18){renderSummary();showScreen('summary');loadPdfLibraries().catch(()=>{})}else{renderScore();showScreen('score')}}else if(state.format){ensurePlayerSlots();renderPlayers();showScreen('players')}else{ensurePlayerSlots();showScreen('format')}save()}else ensurePlayerSlots()}catch{ensurePlayerSlots()}
