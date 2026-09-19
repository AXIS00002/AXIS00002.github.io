// ==UserScript==
// @name         楽天 code 商品详情采集
// @namespace    https://axis00002.github.io/
// @version      1.0.0
// @description  按钮触发，匿名获取 PC 与手机版静态原文供 code 编辑核对
// @match        https://axis00002.github.io/*
// @grant        GM_xmlhttpRequest
// @connect      item.rakuten.co.jp
// @run-at       document-start
// ==/UserScript==
(() => {
 'use strict';
 let busy=false;
 function fetchPage(url){return new Promise(resolve=>{
  GM_xmlhttpRequest({method:'GET',url,anonymous:true,timeout:28000,responseType:'arraybuffer',onload:r=>{try{
   if(r.status!==200)throw Error(`HTTP ${r.status}`);
   const bytes=new Uint8Array(r.response),ascii=new TextDecoder('ascii').decode(bytes.slice(0,12000));
   const encoding=(r.responseHeaders.match(/charset\s*=\s*([\w-]+)/i)||ascii.match(/charset\s*=\s*["']?([\w-]+)/i))?.[1]||'utf-8';
   const html=new TextDecoder(encoding).decode(bytes);const doc=new DOMParser().parseFromString(html,'text/html');
   for(const n of doc.querySelectorAll('script,style,noscript,nav,header,footer'))n.remove();
   const clean=n=>(n.textContent||'').replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
   const tables=[...doc.querySelectorAll('table')].filter(t=>!t.querySelector('table')).map(t=>[...t.rows].map(row=>[...row.cells].map(clean).join('\t')).join('\n')).filter(t=>/商品|内容|型番|カラー|個数/.test(t)).slice(0,80);
   const options=[...doc.querySelectorAll('select')].map(s=>[...s.options].map(clean).join('\n'));
   const text=clean(doc.body).slice(0,100000);if(text.length<100)throw Error('页面内容过短，无法可靠获取商品详情');
   resolve({text,tables,options,url,encoding});
  }catch(e){resolve({error:e.message,url});}},onerror:()=>resolve({error:'网络请求失败',url}),ontimeout:()=>resolve({error:'请求超时',url})});
 });}
 window.addEventListener('message',async e=>{
  if(e.source!==window||e.origin!==location.origin||e.data?.type!=='RK_CODE_FETCH_DETAIL'||busy)return;
  const {id,url}=e.data;let u;try{u=new URL(url);}catch{return;}
  if(u.protocol!=='https:'||u.hostname!=='item.rakuten.co.jp'||!/^\/[^/]+\/[^/]+\/$/.test(u.pathname))return;
  busy=true;try{const pc=await fetchPage(url);u.searchParams.set('force-site','ipn');const mobile=await fetchPage(u.href);window.postMessage({type:'RK_CODE_DETAIL_RESULT',id,result:{pc,mobile}},location.origin);}finally{busy=false;}
 });
})();
