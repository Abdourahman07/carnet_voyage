'use strict';
window.bootCarnetCloud = async function () {
  const cloud=window.CarnetCloud;
  const gate=document.querySelector('#cloud-gate'),page=document.querySelector('#private-carnet');
  const form=document.querySelector('#cloud-login-form'),errorBox=document.querySelector('#cloud-error');
  let signedIn=false,refreshBusy=false;
  function showGate(message='') {
    signedIn=false;page.hidden=true;gate.hidden=false;
    document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    state.memories=[];state.places=[];state.place=null;render();
    errorBox.textContent=message;
    form.elements.password.value='';
    document.querySelector('#cloud-account').textContent='';
    document.querySelector('#cloud-status').textContent='Connectez-vous pour retrouver votre carnet partagé.';
  }
  function apply(data) {
    Object.assign(state,{memories:data.memories,places:data.places});render();
  }
  const receiveUpdate=data=>{
    if(!signedIn || refreshBusy || document.querySelector('#editor').open || document.querySelector('#cloud-import').open || document.querySelector('#detail').open)return;
    apply(data);document.querySelector('#cloud-sync').textContent='Synchronisé · '+new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(new Date());
  };
  async function openCarnet(user) {
    await request();render();
    signedIn=true;gate.hidden=true;page.hidden=false;
    document.querySelector('#cloud-account').textContent=user.email || 'Compte connecté';
    document.querySelector('#cloud-sync').textContent='Synchronisé · actualisation automatique';
    cloud.watch(receiveUpdate);
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;button.textContent='Connexion…';errorBox.textContent='';
    try {const user=await cloud.signIn(form.elements.email.value.trim(),form.elements.password.value);await openCarnet(user);form.elements.password.value='';}
    catch(error){showGate(cloud.explain(error));}
    finally{button.disabled=false;button.textContent='Ouvrir notre carnet';}
  });
  document.querySelector('#show-password').addEventListener('change',event=>{form.elements.password.type=event.target.checked?'text':'password';});
  document.querySelector('#cloud-logout').onclick=async()=>{try{await cloud.signOut();showGate();}catch(error){toast(cloud.explain(error));}};
  window.addEventListener('carnet-signed-out',()=>showGate());
  document.querySelector('#cloud-refresh').onclick=async()=>{
    const button=document.querySelector('#cloud-refresh');button.disabled=true;refreshBusy=true;
    try{await request();render();toast('Le carnet est à jour.');}catch(error){toast(cloud.explain(error));}finally{button.disabled=false;refreshBusy=false;}
  };
  $('#export').onclick=()=>{
    const memories=state.memories.map(({photo,...m})=>({...m,photo:m.photo_path||''}));
    const blob=new Blob([JSON.stringify({version:2,storage:'supabase-private',memories,places:state.places},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='carnet-partage-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Textes exportés. Les photos doivent être sauvegardées séparément depuis Supabase Storage.');
  };
  const importDialog=$('#cloud-import'),importForm=$('#cloud-import-form');
  $('#cloud-import-open').onclick=()=>{importForm.reset();$('#cloud-import-status').textContent='';$('#cloud-import-progress').hidden=true;importDialog.showModal();};
  $('#cloud-import-close').onclick=()=>importDialog.close();
  importForm.onsubmit=async event=>{
    event.preventDefault();const button=$('#cloud-import-submit'),close=$('#cloud-import-close'),progress=$('#cloud-import-progress'),status=$('#cloud-import-status');
    button.disabled=true;close.disabled=true;refreshBusy=true;progress.hidden=false;progress.removeAttribute('value');status.textContent='Vérification de la sauvegarde et des photos…';
    const preventClose=e=>e.preventDefault();importDialog.addEventListener('cancel',preventClose);
    try {
      const file=importForm.elements.backup.files[0];if(!file)throw new Error('Choisissez une sauvegarde JSON.');
      if(file.size>10*1024*1024)throw new Error('Choisissez une sauvegarde JSON de moins de 10 Mo.');
      let data;try{data=JSON.parse(await file.text());}catch{throw new Error('Le fichier JSON est illisible.');}
      if(data.storage==='supabase-private')throw new Error('Cet outil importe les sauvegardes de la version locale PHP. La restauration d’une sauvegarde Supabase se fait depuis le tableau de bord.');
      const result=await cloud.importLegacy(data,[...importForm.elements.photos.files],(done,total)=>{progress.max=total;progress.value=done;status.textContent=`Importation : ${done} souvenir(s) sur ${total}.`;});
      apply(result.data);progress.max=1;progress.value=1;status.textContent=`Terminé : ${result.count} souvenir(s) ajouté(s), ${result.skipped} déjà importé(s). Vous pouvez fermer cette fenêtre.`;toast('Les souvenirs locaux ont rejoint votre carnet partagé.');
    }catch(error){status.textContent=cloud.explain(error)+'\nLes souvenirs déjà importés sont conservés. Vous pouvez relancer l’import sans doublons.';progress.hidden=true;}
    finally{button.disabled=false;close.disabled=false;refreshBusy=false;importDialog.removeEventListener('cancel',preventClose);}
  };
  try {const response=await fetch('assets/countries.geojson');if(response.ok){geography=await response.json();renderLand();}}catch{ /* Les lieux restent disponibles via leurs boutons. */ }
  if(cloud.initialError){showGate(cloud.initialError);form.querySelector('[type=submit]').disabled=true;return;}
  document.querySelector('#cloud-status').textContent='Vérification de votre connexion…';
  try {const user=await cloud.session();if(user)await openCarnet(user);else showGate();}catch(error){showGate(cloud.explain(error));}
};
