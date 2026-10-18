/* Adaptateur Supabase. Le carnet local PHP reste indépendant de cette version. */
'use strict';
window.CarnetCloud = (() => {
  const config = window.CARNET_CONFIG || {};
  const bucket = 'carnet-photos';
  const listeners = new Set();
  const sdk = window.supabase;
  let client, member, timer, inFlight, generation = 0, refreshListener, authSubscribed=false;
  function configurationError() {
    if (!sdk?.createClient) return 'La bibliothèque de connexion n’a pas pu être chargée. Rechargez la page.';
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url || '')) return 'L’adresse du projet Supabase doit être renseignée dans config.js.';
    if (/^sb_secret_/.test(config.publishableKey || '')) return 'Une clé secrète ne doit jamais être utilisée dans le navigateur.';
    if (!/^(sb_publishable_[\w-]+|eyJ[\w.-]+)$/.test(config.publishableKey || '')) return 'La clé publique Supabase manque dans config.js.';
    if (config.publishableKey?.startsWith('eyJ')) {
      try {const role = JSON.parse(atob(config.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role;if(role !== 'anon') return 'Utilisez uniquement une clé publique anon, jamais service_role.';} catch {return 'La clé publique Supabase est invalide.';}
    }
    return '';
  }
  const initialError = configurationError();
  if (!initialError) client = sdk.createClient(config.url, config.publishableKey, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'carnet-voyage-session'}});
  function explain(error) {
    const message = error?.message || String(error || 'Une erreur est survenue.');
    if (/Invalid login credentials/i.test(message)) return 'L’adresse e-mail ou le mot de passe est incorrect.';
    if (/Email not confirmed/i.test(message)) return 'Le compte doit être confirmé dans Supabase → Authentication → Users.';
    if (/schema cache|relation .* does not exist|Could not find the table/i.test(message)) return 'La configuration Supabase manque. Exécutez le fichier 01-installation.sql dans SQL Editor, puis rechargez le carnet.';
    if (/Failed to fetch|NetworkError|network|fetch failed/i.test(message)) return 'Connexion impossible. Vérifiez Internet et que le projet Supabase est actif, puis réessayez.';
    if (/row-level security|permission denied/i.test(message)) return 'L’accès au carnet n’est pas autorisé pour ce compte. Vérifiez son inscription dans carnet_members.';
    if (/rate limit|too many requests/i.test(message)) return 'Trop de tentatives. Patientez quelques instants avant de réessayer.';
    return message;
  }
  function checked(result) {if(result.error) throw new Error(explain(result.error));return result.data;}
  async function checkMembership() {
    const {data:{user},error} = await client.auth.getUser();
    if(error || !user) throw new Error('Connectez-vous pour ouvrir le carnet.');
    const row = checked(await client.from('carnet_members').select('user_id').eq('user_id',user.id).maybeSingle());
    if(!row) throw new Error('Ce compte n’a pas encore accès au carnet. Exécutez 02-autoriser-compte.sql après avoir créé le compte dans Authentication → Users.');
    member = user;
    return user;
  }
  async function signIn(email,password) {
    if(initialError) throw new Error(initialError);
    checked(await client.auth.signInWithPassword({email,password}));
    try {return await checkMembership();}catch(error){await client.auth.signOut();throw error;}
  }
  async function session() {
    if(initialError) throw new Error(initialError);
    const result = checked(await client.auth.getSession());
    if(!result.session) return null;
    return checkMembership();
  }
  async function signOut() {
    generation++; member = null;clearInterval(timer);
    if(client) checked(await client.auth.signOut({scope:'local'}));
  }
  function filename(path) {return String(path || '').split(/[\\/]/).pop();}
  async function load() {
    if(!member) await checkMembership();
    const [memories,places] = await Promise.all([
      client.from('carnet_memories').select('*').order('created_at',{ascending:false}).order('id'),
      client.from('carnet_places').select('*').order('sort_order').order('name')
    ]);
    const rows = checked(memories), destinations = checked(places);
    const paths = [...new Set(rows.map(m=>m.photo_path).filter(Boolean))];
    const urls = new Map();
    if(paths.length) {
      const signed = checked(await client.storage.from(bucket).createSignedUrls(paths,3600));
      for(const item of signed) {
        if(item.error || !item.signedUrl) throw new Error('Une photo est introuvable ou inaccessible dans le stockage privé.');
        urls.set(item.path,item.signedUrl);
      }
    }
    return {memories:rows.map(m=>({...m,date:m.date || '',place:m.place || '',photo:urls.get(m.photo_path) || ''})),places:destinations,token:''};
  }
  function photoFile(file) {
    if(!file || !file.size) return null;
    const extensions = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
    if(!extensions[file.type]) throw new Error('Choisissez une image JPG, PNG, WebP ou GIF. Les photos HEIC doivent être exportées en JPG.');
    if(file.size > 12*1024*1024) throw new Error('Choisissez une photo de moins de 12 Mo.');
    return {file,extension:extensions[file.type]};
  }
  async function upload(photo) {
    const path = `${member.id}/${crypto.randomUUID()}.${photo.extension}`;
    checked(await client.storage.from(bucket).upload(path,photo.file,{contentType:photo.file.type,cacheControl:'3600',upsert:false}));
    return path;
  }
  async function cleanupUnusedUpload(path) {
    // Après une panne réseau, une écriture peut avoir abouti sans réponse reçue.
    // Ne jamais supprimer sa photo tant que l’absence de référence est incertaine.
    try {
      const result=await client.from('carnet_memories').select('id').eq('photo_path',path).limit(1);
      if(!result.error && result.data && result.data.length===0)await client.storage.from(bucket).remove([path]);
    }catch{ /* Un fichier privé orphelin est préférable à la perte d’un original. */ }
  }
  function validate(form) {
    const field = name => String(form.get(name)||'').trim();
    const record = {title:field('title'),owner:field('owner'),note:field('note'),date:field('date') || null,place:field('place') || null};
    if(!record.title || record.title.length>120) throw new Error('Renseignez un titre de 1 à 120 caractères.');
    if(!['madina','abdourahman','nous'].includes(record.owner)) throw new Error('Choisissez un carnet.');
    if(record.note.length>3000) throw new Error('Le petit mot est limité à 3 000 caractères.');
    if(record.date && (!/^\d{4}-\d{2}-\d{2}$/.test(record.date) || !Number.isFinite(Date.parse(record.date+'T12:00:00Z')) || new Date(record.date+'T12:00:00Z').toISOString().slice(0,10)!==record.date)) throw new Error('La date est invalide.');
    let custom = null;
    const name=field('customPlace'),lat=field('lat'),lng=field('lng');
    if(name) {
      if(name.length>80) throw new Error('Le nom du lieu est limité à 80 caractères.');
      if((lat==='')!==(lng==='') || (lat!=='' && (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || Math.abs(Number(lat))>90 || Math.abs(Number(lng))>180))) throw new Error('Renseignez deux coordonnées valides ou laissez les deux champs vides.');
      custom={id:crypto.randomUUID(),name,country:'',lat:lat===''?null:Number(lat),lng:lng===''?null:Number(lng),owners:record.owner==='nous'?['madina','abdourahman']:[record.owner],sort_order:100};
    }
    return {record,custom,photo:photoFile(form.get('photo'))};
  }
  async function mutate(form, snapshot) {
    if(!member) await checkMembership();
    const action=String(form.get('action')||''),id=String(form.get('id')||'');
    const existing=snapshot.memories.find(m=>m.id===id);
    if(action==='favorite') {
      if(!existing) throw new Error('Ce souvenir n’existe plus. Actualisez le carnet.');
      const rows=checked(await client.from('carnet_memories').update({favorite:!existing.favorite}).eq('id',id).eq('updated_at',existing.updated_at).select('id'));
      if(!rows.length) throw new Error('Ce souvenir vient de changer sur un autre appareil. Actualisez le carnet avant de réessayer.');
    } else if(action==='delete') {
      if(!existing) throw new Error('Souvenir introuvable.');
      const rows=checked(await client.from('carnet_memories').delete().eq('id',id).eq('updated_at',existing.updated_at).select('id'));
      if(!rows.length) throw new Error('Ce souvenir a changé sur un autre appareil. Actualisez le carnet avant de le supprimer.');
      // Le fichier original reste privé dans Storage, pour ne pas perdre une photo.
    } else if(action==='save') {
      if(id && !existing) throw new Error('Ce souvenir n’existe plus. Actualisez le carnet.');
      const {record,custom,photo}=validate(form);
      let uploaded='',insertedPlace='';
      try {
        if(custom){checked(await client.from('carnet_places').insert(custom));insertedPlace=custom.id;record.place=custom.id;}
        if(photo){uploaded=await upload(photo);record.photo_path=uploaded;}
        if(existing) {
          const rows=checked(await client.from('carnet_memories').update(record).eq('id',id).eq('updated_at',existing.updated_at).select('id'));
          if(!rows.length) throw new Error('Ce souvenir vient d’être modifié sur un autre appareil. Actualisez le carnet, puis réessayez.');
        } else {checked(await client.from('carnet_memories').insert(record));}
      }catch(error){
        if(uploaded) await cleanupUnusedUpload(uploaded);
        if(insertedPlace) await client.from('carnet_places').delete().eq('id',insertedPlace);
        throw error;
      }
    } else throw new Error('Action inconnue.');
    return load();
  }
  function watch(callback) {
    listeners.add(callback);clearInterval(timer);
    const refresh=async()=>{if(!member || document.hidden || inFlight)return;const current=generation;inFlight=true;try{const data=await load();if(current===generation)for(const cb of listeners)cb(data);}catch(error){console.warn('Actualisation du carnet :',explain(error));}finally{inFlight=false;}};
    timer=setInterval(refresh,30000);
    if(refreshListener)window.removeEventListener('focus',refreshListener);
    refreshListener=refresh;window.addEventListener('focus',refreshListener);
    if(!authSubscribed){authSubscribed=true;client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){generation++;member=null;clearInterval(timer);window.dispatchEvent(new Event('carnet-signed-out'));}});}
  }
  async function importLegacy(data,files,onProgress) {
    if(!member) await checkMembership();
    if(!Array.isArray(data?.memories)||!Array.isArray(data?.places))throw new Error('Choisissez le fichier JSON exporté par le carnet local.');
    if(data.memories.length>500)throw new Error('Importez au maximum 500 souvenirs par fichier.');
    const imported=checked(await client.from('carnet_memories').select('legacy_id').not('legacy_id','is',null));
    const known=new Set(imported.map(m=>m.legacy_id));
    const pending=data.memories.filter(m=>m.id && !known.has(String(m.id)));
    const candidates=new Map();
    for(const file of files){if(candidates.has(file.name))throw new Error(`Deux photos portent le nom ${file.name}. Importez les dossiers séparément pour éviter de les confondre.`);candidates.set(file.name,file);}
    for(const m of pending){if(m.photo && !candidates.has(filename(m.photo)))throw new Error(`Photo manquante : ${filename(m.photo)}. Sélectionnez toutes les photos du carnet avant de lancer l’import.`);}
    const existingPlaces=new Set(checked(await client.from('carnet_places').select('id')).map(p=>p.id));
    const suppliedPlaces=new Map(data.places.filter(p=>typeof p.id==='string').map(p=>[p.id,p]));
    for(const m of pending){
      if(m.place && !existingPlaces.has(m.place) && !suppliedPlaces.has(m.place))throw new Error(`Le lieu du souvenir « ${m.title} » est introuvable dans cette sauvegarde.`);
      const form=new FormData();for(const key of ['title','owner','note','date','place'])form.set(key,m[key]||'');
      if(m.photo)form.set('photo',candidates.get(filename(m.photo)));
      validate(form);
    }
    let count=0;
    for(const m of pending){
      if(m.place && !existingPlaces.has(m.place)) {
        const p=suppliedPlaces.get(m.place);
        if(!p.name || p.name.length>80 || !Array.isArray(p.owners)||p.owners.some(o=>!['madina','abdourahman'].includes(o)) || (p.lat===null)!==(p.lng===null) || (p.lat!==null && (!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180)))throw new Error('Lieu invalide dans la sauvegarde.');
        checked(await client.from('carnet_places').insert({id:p.id,name:p.name,country:p.country||'',lat:p.lat,lng:p.lng,owners:p.owners,sort_order:100}));existingPlaces.add(p.id);
      }
      let path='';
      try {
        if(m.photo)path=await upload(photoFile(candidates.get(filename(m.photo))));
        checked(await client.from('carnet_memories').insert({title:m.title,owner:m.owner,note:m.note||'',date:m.date||null,place:m.place||null,photo_path:path,favorite:!!m.favorite,legacy_id:String(m.id)}));
      }catch(error){if(path)await cleanupUnusedUpload(path);throw error;}
      count++;onProgress(count,pending.length);
    }
    return {count,skipped:data.memories.length-pending.length,data:await load()};
  }
  return {initialError,explain,signIn,signOut,session,load,mutate,watch,importLegacy};
})();
