import { decode, type Envelope, type SaveEdition } from '../../src/games/monster-wars/save';

const key='progress', backupKey='backup';

export async function openStorage(edition:SaveEdition='prototype'){
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const q=indexedDB.open(edition==='official'?'monster-wars-official':'monster-wars',1);
    q.onupgradeneeded=()=>{q.result.createObjectStore('local');};
    q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
    q.onblocked=()=>reject(Error('保存データベースが使用中です'));
  });
  const read=(id:string)=>new Promise<unknown>((resolve,reject)=>{
    const q=db.transaction('local').objectStore('local').get(id);
    q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
  });
  const probe=()=>new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('local','readwrite'),s=tx.objectStore('local');
    s.put(1,'probe');s.delete('probe');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);
  });
  await probe();
  let readProgress:unknown;
  const sameInvalid=(current:unknown)=>{
    try{return JSON.stringify(current)===JSON.stringify(readProgress);}
    catch{return false;}
  };
  const save=(value:Envelope,expected:Envelope|undefined,replaceInvalid=false)=>new Promise<void>((resolve,reject)=>{
    try{decode(value,edition);}catch(e){reject(e);return;}
    const tx=db.transaction('local','readwrite'),s=tx.objectStore('local'),q=s.get(key);
    let failure:Error|undefined;
    q.onsuccess=()=>{
      const raw=q.result;
      let prior:Envelope|undefined;
      if(raw!==undefined)try{prior=decode(raw,edition);}catch{
        if(!replaceInvalid||(edition==='official'&&!sameInvalid(raw))){failure=Error('破損したセーブは確認操作が必要です');tx.abort();return;}
      }
      if(prior?.saveId!==expected?.saveId||prior?.revision!==expected?.revision){
        failure=Error('別の画面がセーブを更新しました。再読み込みしてください');tx.abort();return;
      }
      try{
        if(prior)s.put(prior,backupKey);
        s.put(value,key);
      }catch(e){
        failure=e instanceof Error?e:Error('保存に失敗しました');
        tx.abort();
      }
    };
    tx.oncomplete=()=>{readProgress=value;resolve();};
    tx.onabort=()=>reject(failure??tx.error??Error('保存に失敗しました'));
  });
  return {read:async()=>{readProgress=await read(key);return readProgress;},backup:()=>read(backupKey),save};
}
