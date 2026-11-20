(function(root) {
  'use strict';
  let database;
  function open() {
    if(!database)database=new Promise((resolve,reject)=>{
      if(!root.indexedDB){reject(new Error('此浏览器没有本地数据库'));return;}
      const request=root.indexedDB.open('casemap-projects',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('草稿数据库被另一个页面占用'));
    });
    return database;
  }
  async function read() {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const request=db.transaction('drafts').objectStore('drafts').get('current');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }
  async function write(value) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('drafts','readwrite');
      tx.objectStore('drafts').put(value,'current');
      tx.oncomplete=()=>resolve();
      tx.onabort=tx.onerror=()=>reject(tx.error);
    });
  }
  root.CaseMapDrafts={read,write};
})(globalThis);
