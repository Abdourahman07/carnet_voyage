'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const names = { madina: 'Madina', abdourahman: 'Abdourahman', nous: 'Nous deux' };
const state = { memories: [], places: [], owner: 'all', view: 'map', search: '', favorites: false, place: null, token: '' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const placeName = id => state.places.find(p => p.id === id)?.name || 'Lieu à préciser';
const dateText = date => date ? new Intl.DateTimeFormat('fr-FR', {day:'numeric',month:'long',year:'numeric'}).format(new Date(date + 'T12:00:00')) : '';
let toastTimer, previewUrl;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4000); }
async function request(form) {
  const response = await fetch('api.php', form ? {method:'POST',headers:{'X-CSRF-Token':state.token},body:form} : {});
  let data; try { data = await response.json(); } catch { throw new Error('Le serveur PHP ne répond pas correctement. Ouvrez le carnet via Wamp.'); }
  if (!response.ok || data.error) throw new Error(data.error || 'Impossible de sauvegarder.');
  Object.assign(state, {memories:data.memories,places:data.places,token:data.token});
  return data;
}
async function action(action, id) { const form = new FormData(); form.set('action', action); form.set('id', id); await request(form); render(); }
function filtered() { return state.memories.filter(m => (state.owner === 'all' || m.owner === state.owner) && (!state.favorites || m.favorite) && (!state.place || m.place === state.place) && (!state.search || `${m.title} ${m.note} ${placeName(m.place)} ${names[m.owner]}`.toLocaleLowerCase('fr').includes(state.search))); }
function photoMarkup(m, featured = false) {
  return `<button class="polaroid" data-open="${esc(m.id)}" aria-label="Ouvrir ${esc(m.title)}">${m.photo ? `<img src="${esc(m.photo)}" alt="${esc(m.title)}" ${featured ? '' : 'loading="lazy"'}>` : `<div class="photo-placeholder">✎</div>`}<h3>${esc(m.title)}</h3><span class="photo-meta">${esc(placeName(m.place))} · ${esc(names[m.owner])}</span></button>`;
}
function render() {
  $$('.person').forEach(b => { b.classList.toggle('active', b.dataset.owner === state.owner); b.setAttribute('aria-pressed', b.dataset.owner === state.owner); });
  $$('.view-tabs button').forEach(b => {b.classList.toggle('active', b.dataset.view === state.view); b.setAttribute('aria-pressed',b.dataset.view === state.view);});
  $('#favorites').setAttribute('aria-pressed',state.favorites); $('#favorites').textContent = state.favorites ? '♥' : '♡';
  $('#map-view').hidden = state.view !== 'map';
  $('#collection-section').hidden = state.view === 'map' && !state.place;
  let entries = filtered();
  const places = visiblePlaces();
  $('#counter').textContent = `${places.length} lieux · ${entries.length} souvenir${entries.length !== 1 ? 's' : ''}`;
  $('#collection-kicker').textContent = state.place ? placeName(state.place).toLocaleUpperCase('fr') : state.owner === 'all' ? 'À GARDER TOUT PRÈS' : `LE CARNET DE ${names[state.owner].toLocaleUpperCase('fr')}`;
  $('#collection-title').textContent = state.view === 'notes' ? 'Les mots qui restent' : state.view === 'photos' ? 'Nos instants en images' : 'Les dernières pages du carnet';
  $('#show-all').hidden = state.view !== 'map';
  $('#memory-grid').innerHTML = entries.map(m => state.view === 'notes' ? `<article class="note-card"><h3>${esc(m.title)}</h3><p>${esc(m.note || 'Une histoire à raconter…')}</p><small>${esc(names[m.owner])} · ${esc(placeName(m.place))}${m.date ? ' · ' + esc(dateText(m.date)) : ''}</small><button class="note-open" data-open="${esc(m.id)}" aria-label="Ouvrir ${esc(m.title)}"></button></article>` : `<article class="memory-item">${photoMarkup(m)}<button class="favorite-small" data-favorite="${esc(m.id)}" aria-pressed="${!!m.favorite}" aria-label="${m.favorite ? 'Retirer des' : 'Ajouter aux'} favoris">${m.favorite ? '♥' : '♡'}</button></article>`).join('');
  $('#empty').hidden = entries.length > 0;
  $('#empty-text').textContent = state.search || state.favorites ? 'Aucun souvenir ne correspond à ces filtres.' : state.owner === 'madina' ? 'Madina, tes aventures en Éthiopie, à Djibouti et à Kazan attendent leurs premières photos.' : state.owner === 'nous' ? 'Votre histoire à deux attend ses premières photos et ses premiers mots.' : 'Ajoutez une photo ou un petit mot pour commencer cette page.';
  const photos = entries.filter(m => m.photo);
  $('#featured-left').innerHTML = photos[0] ? photoMarkup(photos[0],true) : blankFeature('Les souvenirs de ' + (names[state.owner] || 'Madina'), 'Une histoire à écrire');
  $('#featured-right').innerHTML = photos[1] ? photoMarkup(photos[1],true) : blankFeature('Et puis, nous…', 'La suite nous appartient');
  $('#featured-bottom-left').innerHTML = photos[2] ? photoMarkup(photos[2],true) : blankFeature('Les jours heureux', 'Vos photos à venir');
  $('#featured-bottom-right').innerHTML = photos[3] ? photoMarkup(photos[3],true) : blankFeature('Encore une escale…', 'Vos photos à venir');
  $('#featured-middle').innerHTML = photos[4] ? photoMarkup(photos[4],true) : blankFeature(state.owner === 'all' || state.owner === 'madina' ? 'Madina, ses voyages' : 'La prochaine escale…', 'Les souvenirs arrivent bientôt');
  $('#featured-us').innerHTML = photos[5] ? photoMarkup(photos[5],true) : blankFeature(state.owner === 'all' || state.owner === 'nous' ? 'Nous — à deux' : 'La suite du voyage…', 'Nos moments à ajouter');
  $('#map-destinations').innerHTML = visiblePlaces().map(p => `<button class="destination-chip" data-place="${esc(p.id)}" aria-pressed="${state.place === p.id}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>${esc(p.name)}</button>`).join('');
  renderPins(); renderPlacePanel();
}
function blankFeature(title, caption) { return `<button class="polaroid" data-add="true"><div class="photo-placeholder">♡</div><h3>${esc(title)}</h3><span class="photo-meta">${esc(caption)}</span></button>`; }
function visiblePlaces() { return state.places.filter(p => state.owner === 'all' || (state.owner === 'nous' ? state.memories.some(m=>m.owner==='nous' && m.place === p.id) : p.owners.includes(state.owner) || state.memories.some(m=>m.owner===state.owner && m.place===p.id))); }
// Projection équirectangulaire, étendue adaptée aux parcours et aux futurs lieux.
let bounds = {west:-17,east:65,south:1,north:65};
function project(lng, lat) { return [(lng-bounds.west)/(bounds.east-bounds.west)*1000,(bounds.north-lat)/(bounds.north-bounds.south)*650]; }
let geography;
function mapBounds() { const pins = visiblePlaces().filter(p=>p.lat !== null && p.lng !== null); bounds = {west:Math.min(-17,...pins.map(p=>p.lng-9)),east:Math.max(65,...pins.map(p=>p.lng+9)),south:Math.min(1,...pins.map(p=>p.lat-7)),north:Math.max(65,...pins.map(p=>p.lat+7))}; }
function renderLand() {
  if (!geography) return;
  $('#map-shapes').innerHTML = geography.features.map(f => {
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    const d = polygons.map(polygon => polygon.map(ring => ring.map((p,i) => {const [x,y]=project(p[0],p[1]);return `${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;}).join(' ')+'Z').join(' ')).join(' ');
    return `<path class="land" d="${d}"><title>${esc(f.properties.name)}</title></path>`;
  }).join('');
}
function renderPins() {
  mapBounds(); renderLand();
  const places = visiblePlaces().filter(p=>p.lat !== null && p.lng !== null);
  // Les lieux proches sont regroupés pour garder la carte lisible.
  const clustered = [];
  places.forEach(p=> {const [x,y]=project(p.lng,p.lat); const group=clustered.find(g=>Math.hypot(g.x-x,g.y-y)<34);if(group){group.places.push(p);}else clustered.push({x,y,places:[p]});});
  $('#map-pins').innerHTML = clustered.map(g => {const p=g.places[0],shared=p.owners.length>1,color=shared?'#b79450':p.owners.includes('madina')?'#bf8791':'#657365';return `<g class="map-pin" role="button" tabindex="0" data-place="${esc(p.id)}" aria-label="${esc(g.places.map(x=>x.name).join(', '))}" transform="translate(${g.x},${g.y})"><title>${esc(g.places.map(x=>x.name).join(', '))}</title><rect class="pin-hit-area" x="-22" y="-39" width="44" height="44" fill="transparent"/><path class="pin-body" d="M0 0C-3-5-12-14-12-22a12 12 0 1 1 24 0C12-14 3-5 0 0Z" fill="${color}"/><path class="pin-center" d="M0-26a4 4 0 1 0 0 8a4 4 0 1 0 0-8Z"/><text x="${g.x>830?-19:19}" y="-13" text-anchor="${g.x>830?'end':'start'}">${esc(g.places.length>1?'France · '+g.places.length+' lieux':p.name)}</text></g>`;}).join('');
  const routes = [{ids:['ethiopie','djibouti','kazan'],color:'#bf8791',owner:'madina'},{ids:['djibouti','saint-omer','milan','barcelone'],color:'#657365',owner:'abdourahman'}];
  $('#map-routes').innerHTML = routes.filter(r=>state.owner==='all'||state.owner===r.owner).map(r=>{const points=r.ids.map(id=>state.places.find(p=>p.id===id)).filter(Boolean).map(p=>project(p.lng,p.lat));return `<path class="map-route" stroke="${r.color}" d="${points.map((p,i)=>`${i?'L':'M'}${p.join(',')}`).join(' ')}"/>`;}).join('');
}
function renderPlacePanel() {
  const panel = $('#place-panel'); panel.hidden = !state.place;
  if (!state.place) return;
  const p = state.places.find(p=>p.id===state.place); if (!p) return;
  const siblings = state.places.filter(x=>p.country && x.country===p.country);
  panel.innerHTML = `<div><h3>${esc(p.name)} <span>♡</span></h3><p>${esc(p.country)} · ${state.memories.filter(m=>m.place===p.id).length} souvenir(s)${p.lat===null?' · Coordonnées à compléter':''}</p>${siblings.length>1?`<div>${siblings.map(x=>`<button class="text-button" data-place="${esc(x.id)}">${esc(x.name)} &nbsp;</button>`).join('')}</div>`:''}</div><div><button class="button primary" data-add="true">＋ Un souvenir ici</button> <button class="icon-button" id="clear-place" aria-label="Enlever le filtre de lieu">×</button></div>`;
}
function openEditor(id) {
  const form = $('#memory-form'); form.reset(); $('#form-error').textContent = ''; $('#upload-preview').hidden = true; $('#upload-label').hidden = false;
  if(previewUrl) { URL.revokeObjectURL(previewUrl);previewUrl=null; }
  $('#coordinates').hidden = true;
  $('#place-select').innerHTML = '<option value="">Lieu à préciser</option>'+state.places.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  const memory=state.memories.find(m=>m.id===id);
  $('#editor-title').textContent = memory?'Une page à compléter':'Un souvenir à garder';
  if(memory){ for(const key of ['id','title','owner','place','date','note']) form.elements[key].value=memory[key]||'';if(memory.photo){$('#upload-preview').src=memory.photo;$('#upload-preview').hidden=false;$('#upload-label').hidden=true;} }
  else {form.elements.owner.value=state.owner==='all'?'nous':state.owner;form.elements.place.value=state.place||'';}
  $('#editor').showModal();
}
function openDetail(id) {
  const m=state.memories.find(m=>m.id===id);if(!m)return;
  $('#detail-content').innerHTML=`<div class="detail-header"><span class="eyebrow">UNE PAGE DE NOTRE HISTOIRE</span><button class="icon-button" id="close-detail" aria-label="Fermer">×</button></div>${m.photo?`<img class="detail-photo" src="${esc(m.photo)}" alt="${esc(m.title)}">`:''}<div class="detail-copy"><h2>${esc(m.title)}</h2><p class="detail-meta">${esc(names[m.owner])} · ${esc(placeName(m.place))}${m.date?' · '+esc(dateText(m.date)):''}</p><p class="detail-note">${esc(m.note || 'Il reste tant à raconter…')}</p><div class="detail-actions"><button class="delete-button" id="delete-memory">Supprimer ce souvenir</button><button class="button" id="edit-memory">✎ Compléter cette page</button></div></div>`;
  $('#close-detail').onclick=()=>$('#detail').close();
  $('#edit-memory').onclick=()=>{$('#detail').close();openEditor(id);};
  $('#delete-memory').onclick=async()=>{if(!confirm('Supprimer ce souvenir du carnet ? Cette action est définitive.'))return;try{await action('delete',id);$('#detail').close();toast('Le souvenir a été supprimé.');}catch(e){toast(e.message);}};
  $('#detail').showModal();
}
document.addEventListener('click',async e=>{
  const target=e.target.closest('button, [data-place]');if(!target)return;
  if(target.dataset.owner){state.owner=target.dataset.owner;state.place=null;render();}
  if(target.dataset.view){state.view=target.dataset.view;render();}
  if(target.dataset.open)openDetail(target.dataset.open);
  if(target.dataset.add)openEditor();
  if(target.dataset.place){state.place=target.dataset.place;render();}
  if(target.dataset.favorite){target.disabled=true;try{await action('favorite',target.dataset.favorite);}catch(error){toast(error.message);target.disabled=false;}}
  if(target.id==='clear-place'){state.place=null;render();}
});
$('#travel-map').addEventListener('keydown',e=>{const pin=e.target.closest('[data-place]');if(pin&&(e.key==='Enter'||e.key===' ')){e.preventDefault();state.place=pin.dataset.place;render();}});
$('#search').addEventListener('input',e=>{state.search=e.target.value.trim().toLocaleLowerCase('fr');render();});
$('#favorites').onclick=()=>{state.favorites=!state.favorites;render();};
$('#show-all').onclick=()=>{state.view='photos';render();};
$('#add-top').onclick=$('#add-empty').onclick=()=>openEditor();
$$('.close-dialog').forEach(b=>b.onclick=()=>$('#editor').close());
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#memory-form').elements.customPlace.addEventListener('input',e=>$('#coordinates').hidden=!e.target.value.trim());
$('#photo').addEventListener('change',e=>{if(previewUrl)URL.revokeObjectURL(previewUrl);const f=e.target.files[0];if(!f)return;previewUrl=URL.createObjectURL(f);$('#upload-preview').src=previewUrl;$('#upload-preview').hidden=false;$('#upload-label').hidden=true;});
$('#memory-form').addEventListener('submit',async e=>{e.preventDefault();const button=$('#save');button.disabled=true;button.textContent='Enregistrement…';$('#form-error').textContent='';const form=new FormData(e.target);form.set('action','save');try{await request(form);$('#editor').close();state.search='';$('#search').value='';state.favorites=false;state.place=null;state.owner=form.get('owner');render();toast('Un souvenir de plus dans notre histoire ♡');}catch(error){$('#form-error').textContent=error.message;}finally{button.disabled=false;button.textContent='Garder ce souvenir ♡';}});
$('#export').onclick=()=>{const {memories,places}=state;const blob=new Blob([JSON.stringify({memories,places},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='nos-echappees-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Carnet exporté. Conservez aussi les dossiers assets et uploads pour sauvegarder les photos.');};
async function start(){
  $('#memory-grid').innerHTML='<p class="load-status">On ouvre le carnet…</p>';
  try{await request();render();}catch(e){$('#memory-grid').innerHTML=`<div class="error-banner"><strong>Le carnet n’a pas pu s’ouvrir.</strong><p>${esc(e.message)}</p><button class="button" onclick="location.reload()">Réessayer</button></div>`;$('#add-top').disabled=true;return;}
  try{const r=await fetch('assets/countries.geojson');if(!r.ok)throw Error();geography=await r.json();renderLand();}catch{toast('Les contours de la carte sont indisponibles. Les lieux restent accessibles.');}
}
start();
