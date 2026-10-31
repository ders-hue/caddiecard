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

function applyRecognizedText(text,blocks){
  const textRows=scorecardRowsFromText(text),positionedRows=scorecardRowsFromWords(wordsFromBlocks(blocks));
  const rows=positionedRows.size>=textRows.size?positionedRows:textRows;
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
  return {rowCount:rows.size,hasCompleteCard};
}

renderCourseRows();
$('#takePhoto').addEventListener('click',()=>$('#scorecardPhoto').click());
$('#scorecardPhoto').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  const preview=$('#photoPreview');preview.src=URL.createObjectURL(file);preview.classList.remove('hidden');
  const status=$('#scanStatus');
  status.textContent='Preparing on-device text recognition… The first scan can take a little longer.';
  let worker;
  try{
    const Tesseract=await loadOcrLibrary();
    worker=await Tesseract.createWorker('eng',1,{logger:message=>{
      if(message.status==='recognizing text')status.textContent=`Reading scorecard… ${Math.round((message.progress||0)*100)}%`;
    }});
    await worker.setParameters({tessedit_pageseg_mode:Tesseract.PSM.SINGLE_BLOCK,preserve_interword_spaces:'1'});
    const preparedImage=await prepareOcrImage(file);
    const result=await worker.recognize(preparedImage,{}, {text:true,blocks:true});
    const applied=applyRecognizedText(result.data.text||'',result.data.blocks||[]);
    status.textContent=applied.hasCompleteCard
      ?'Scorecard details filled in. Check every value against the photograph before continuing.'
      :`Text recognition found ${applied.rowCount} of 18 hole rows. Check and complete the details below against the photograph.`;
  }catch(error){
    console.error('Scorecard recognition failed',error);
    status.textContent='Automatic recognition could not finish. Check your connection, then retake the photo or enter the details below.';
  }finally{if(worker)await worker.terminate()}
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
