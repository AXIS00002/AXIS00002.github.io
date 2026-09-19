// Browser-only workbook reading. Imported shop data is never sent to GitHub.
const $ = id => document.getElementById(id);
const section = document.createElement('section');
section.className = 'panel';
section.innerHTML = `
<h2>商品资料与 code 编辑</h2>
<p>先获取商品或粘贴 URL，再导入原「コード設定」表匹配。核对后复制三行内容，粘贴到 Excel。</p>
<div class="grid">
 <div class="field"><label for="templateFile">导入参考表（本机读取）</label><input id="templateFile" type="file" accept=".xlsx"><select id="templateSheet" aria-label="参考工作表" disabled></select><span id="templateStatus" class="hint">未导入参考表。内部 code 需从原表匹配或手动填写。</span></div>
 <div class="field"><label for="manualUrls">商品 URL（每行一个）</label><textarea id="manualUrls" rows="3" placeholder="https://item.rakuten.co.jp/lovestyle/1001017/"></textarea><button id="addUrls" class="secondary">加入商品</button></div>
</div>
<div class="buttons"><button id="collectDetails" class="secondary">获取所选商品 PC／手机版详情</button><a href="./rakuten-details.user.js" target="_blank">安装详情采集油猴脚本</a></div>
<p id="workStatus" role="status">请选择商品。详情采集需要安装脚本后刷新页面。</p>
<div class="grid">
 <div><label for="productFilter">查找商品</label><input id="productFilter" placeholder="URL、商品名或编号"><select id="productPicker" size="8" aria-label="商品列表"></select><div id="sourceInfo"></div></div>
 <div><h3>三行 code</h3><p class="hint">A 列保存 URL 末尾 ID，保留 0106 等前导零。B 第一行是店铺商品番号，B 第三行是内部 code。自由选择商品的数量留空，按原表规则填写。</p>
 <label for="templateMatch">原表匹配记录</label><select id="templateMatch"></select><button id="applyMatch" class="secondary">填入所选原表记录</button>
 <div class="grid" id="codeFields"></div>
 <div class="table-wrap"><table id="codeTable" style="min-width:600px"><thead><tr><th>順番</th><th>対照表（选项原文）</th><th>個数</th><th>操作</th></tr></thead><tbody></tbody></table></div>
 <div class="buttons"><button id="addColumn" class="secondary">添加颜色／选项</button><button id="copyBlock" class="primary">复制三行 code</button><button id="copyAllBlocks" class="secondary">复制所有已编辑 code</button></div>
 <p class="hint">复制前请核对原文。未匹配内容不会按标题猜测；空白数量保留为空。</p><pre id="blockPreview"></pre>
 </div>
</div>`;
document.querySelector('.wrap').append(section);
const style = document.createElement('style');
style.textContent = `textarea{width:100%;padding:10px;border:1px solid #cfcfd5;border-radius:8px;font:inherit}#productPicker{margin-top:10px;min-height:240px}#sourceInfo{overflow-wrap:anywhere;line-height:1.65}#sourceInfo pre,#blockPreview{white-space:pre-wrap;overflow:auto;max-height:300px;background:#f6f6f8;padding:12px;border-radius:8px;font-size:12px}#codeFields{margin:14px 0}#codeTable input{min-width:90px}#codeTable td:nth-child(2) input{min-width:230px}h2{margin-top:0}#templateMatch{margin-bottom:8px}`;
document.head.append(style);
let products = [], current = null, records = [], book = null;
const drafts = new Map(), details = new Map();
const normalize = value => {
 try {const u = new URL(value); if(u.protocol !== 'https:' || u.hostname !== 'item.rakuten.co.jp') return ''; const p=u.pathname.split('/').filter(Boolean); return p.length===2 ? `${u.origin}/${p[0]}/${p[1]}/` : '';} catch{return '';}
};
const itemId = url => new URL(url).pathname.split('/').filter(Boolean)[1];
const status = message => $('workStatus').textContent = message;
function mergeProducts(items) {
 const map = new Map(products.map(p=>[p.商品URL,p]));
 for(const p of items){const url=normalize(p.商品URL);if(url)map.set(url,{...map.get(url),...p,商品URL:url});}
 products=[...map.values()]; renderPicker();
}
window.addEventListener('rk-products-updated', e=>mergeProducts(e.detail));
$('addUrls').onclick = () => {
 const lines=$('manualUrls').value.split(/\s+/).filter(Boolean), valid=lines.map(normalize).filter(Boolean);
 mergeProducts(valid.map(url=>({商品URL:url,商品管理番号:itemId(url)})));
 status(`已加入 ${valid.length} 个 URL；无效输入 ${lines.length-valid.length} 个。`);
};
function renderPicker(){
 const filter=$('productFilter').value.toLowerCase();const picker=$('productPicker');picker.replaceChildren();
 for(const p of products){if(!`${p.商品URL} ${p.商品名||''} ${p.商品番号||''}`.toLowerCase().includes(filter))continue; const o=new Option(`${itemId(p.商品URL)}  ${p.商品名||'待获取详情'}`,p.商品URL);picker.add(o);}
 if(current && [...picker.options].some(o=>o.value===current))picker.value=current;
 else current=picker.value||null;
 showProduct();
}
$('productFilter').oninput=renderPicker;
$('productPicker').onchange=()=>{current=$('productPicker').value;showProduct();};
const fields=[['id','商品 URL 末尾 ID'],['number','店铺商品番号（B 第一行）'],['model','型番（C 第一行）'],['category','分类标记（A 第二行）'],['internal','内部 code（B 第三行）']];
for(const [key,label] of fields){const box=document.createElement('div');box.className='field';const l=document.createElement('label');l.htmlFor=`field_${key}`;l.textContent=label;const input=document.createElement('input');input.id=l.htmlFor;input.oninput=()=>{if(!current)return;const d=getDraft();d[key]=input.value;d.edited=true;preview();};box.append(l,input);$('codeFields').append(box);}
function getDraft(){if(!drafts.has(current)){const p=products.find(p=>p.商品URL===current);drafts.set(current,{id:itemId(current),number:p?.商品番号||'',model:'',category:'',internal:'',columns:[],edited:false});}return drafts.get(current);}
function textBlock(label,value,parent){const h=document.createElement('h4');h.textContent=label;const pre=document.createElement('pre');pre.textContent=value||'未获取';parent.append(h,pre);}
function showProduct(){
 const source=$('sourceInfo');source.replaceChildren();
 for(const id of ['collectDetails','applyMatch','addColumn','copyBlock'])$(id).disabled=!current;
 if(!current){$('codeTable').querySelector('tbody').replaceChildren();$('blockPreview').textContent='';for(const [key]of fields)$(`field_${key}`).value='';return;}
 const p=products.find(p=>p.商品URL===current),d=getDraft();
 const a=document.createElement('a');a.href=current;a.target='_blank';a.rel='noopener noreferrer';a.textContent=current;source.append(a);
 textBlock('商品名',p.商品名,source);textBlock('API 商品说明',p.API商品说明,source);
 const detail=details.get(current);
 if(detail)for(const mode of ['pc','mobile']){const s=detail[mode];textBlock(mode==='pc'?'PC 页面原文':'手机版页面原文',s?.error||s?.text,source);if(s?.tables?.length)textBlock('页面表格原文',s.tables.join('\n\n'),source);if(s?.options?.length)textBlock('页面中找到的选项（可能不完整）',s.options.join('\n'),source);}
 for(const [key]of fields)$(`field_${key}`).value=d[key];
 renderColumns();renderMatches();preview();
}
function renderColumns(){const body=$('codeTable').querySelector('tbody');body.replaceChildren();if(!current)return;
 getDraft().columns.forEach((column,index)=>{const tr=document.createElement('tr');for(const key of ['order','label','quantity']){const td=document.createElement('td'),input=document.createElement('input');input.value=column[key]??'';input.setAttribute('aria-label',`${index+1} ${key}`);input.oninput=()=>{column[key]=input.value;getDraft().edited=true;preview();};td.append(input);tr.append(td);}const td=document.createElement('td'),button=document.createElement('button');button.textContent='删除';button.onclick=()=>{getDraft().columns.splice(index,1);getDraft().edited=true;renderColumns();preview();};td.append(button);tr.append(td);body.append(tr);});}
$('addColumn').onclick=()=>{getDraft().columns.push({order:'',label:'',quantity:''});getDraft().edited=true;renderColumns();preview();};
function blockRows(d){return [[d.id,d.number,d.model,'順番',...d.columns.map(c=>c.order)],[d.category,'','','対照表',...d.columns.map(c=>c.label)],['',d.internal,'','個数',...d.columns.map(c=>c.quantity)]];}
function preview(){if(current)$('blockPreview').textContent=blockRows(getDraft()).map(r=>r.join('\t')).join('\n');}
function safeCell(v){let s=String(v??'').replace(/[\t\r\n]/g,' ');if(/^[=+@-]/.test(s)||/^0\d+$/.test(s))s="'"+s;return s;}
async function copyDrafts(list){try{if(!list.length)throw Error('没有已编辑的 code。');for(const d of list){if(!d.id||!d.internal||!d.model||!d.columns.length||d.columns.some(c=>!c.order||!c.label|| (c.quantity!==''&&!/^\d+$/.test(String(c.quantity)))))throw Error('请填写 ID、型番、内部 code 和选项。数量只能为空或非负整数。');}
 await navigator.clipboard.writeText(list.flatMap(blockRows).map(r=>r.map(safeCell).join('\t')).join('\n'));status(`已复制 ${list.length} 组 code，可直接粘贴到 Excel 的 A 列。`);}catch(e){status(e.message);}}
$('copyBlock').onclick=()=>copyDrafts([getDraft()]);
$('copyAllBlocks').onclick=()=>copyDrafts([...drafts.values()].filter(d=>d.edited));
// Read only the selected sheet; retain cell strings exactly, including leading zeros.
async function openXlsx(file){
 const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error('不是有效的 XLSX 文件');
 const entries=new Map();let pos=view.getUint32(end+16,true);
 for(let n=0;n<view.getUint16(end+10,true);n++){if(view.getUint32(pos,true)!==0x02014b50)throw Error('XLSX ZIP 目录损坏');const length=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true);entries.set(new TextDecoder().decode(bytes.slice(pos+46,pos+46+length)),{method:view.getUint16(pos+10,true),size:view.getUint32(pos+20,true),offset:view.getUint32(pos+42,true)});pos+=46+length+extra+comment;}
 const read=async path=>{const e=entries.get(path);if(!e)throw Error(`表格缺少 ${path}`);const start=e.offset+30+view.getUint16(e.offset+26,true)+view.getUint16(e.offset+28,true);let data=bytes.slice(start,start+e.size);if(e.method===8)data=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());else if(e.method!==0)throw Error('不支持此表格压缩格式');return new DOMParser().parseFromString(new TextDecoder().decode(data),'application/xml');};
 const workbook=await read('xl/workbook.xml'),rels=await read('xl/_rels/workbook.xml.rels');const targets=new Map([...rels.getElementsByTagName('Relationship')].map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
 const sheets=[...workbook.getElementsByTagName('sheet')].map(s=>({name:s.getAttribute('name'),path:targets.get(s.getAttribute('r:id'))}));
 const shared=entries.has('xl/sharedStrings.xml')?[...(await read('xl/sharedStrings.xml')).getElementsByTagName('si')].map(s=>[...s.getElementsByTagName('t')].map(t=>t.textContent).join('')):[];
 return {sheets,async rows(sheet){const path=sheet.path.startsWith('/')?sheet.path.slice(1):'xl/'+sheet.path;const doc=await read(path),rows=new Map();for(const r of doc.getElementsByTagName('row')){const row=[];for(const c of r.getElementsByTagName('c')){const letters=c.getAttribute('r').match(/^[A-Z]+/)[0];let col=0;for(const l of letters)col=col*26+l.charCodeAt(0)-64;const v=c.getElementsByTagName('v')[0]?.textContent||'';row[col-1]=c.getAttribute('t')==='s'?shared[Number(v)]:c.getAttribute('t')==='inlineStr'?[...c.getElementsByTagName('t')].map(t=>t.textContent).join(''):v;}rows.set(Number(r.getAttribute('r')),row);}return rows;}};
}
function parseRecords(rows){const result=[];for(const [r,a]of rows){const b=rows.get(r+1),c=rows.get(r+2);if(a[3]!=='順番'||b?.[3]!=='対照表'||c?.[3]!=='個数')continue;const columns=[];for(let i=4;i<Math.max(a.length,b.length,c.length);i++)columns.push({order:a[i]||'',label:b[i]||'',quantity:c[i]??''});while(columns.length&&Object.values(columns.at(-1)).every(x=>x===''))columns.pop();result.push({id:String(a[0]||''),number:a[1]||'',model:a[2]||'',category:b[0]||'',internal:c[1]||'',columns,row:r});}return result;}
$('templateFile').onchange=async()=>{const file=$('templateFile').files[0];if(!file)return;try{$('templateStatus').textContent='正在读取参考表…';book=await openXlsx(file);$('templateSheet').replaceChildren(...book.sheets.map((s,i)=>new Option(s.name,String(i))));$('templateSheet').disabled=false;await readSheet();}catch(e){book=null;records=[];$('templateSheet').disabled=true;$('templateStatus').textContent=`读取失败：${e.message}`;renderMatches();}};
async function readSheet(){try{$('templateStatus').textContent='正在读取工作表…';records=parseRecords(await book.rows(book.sheets[Number($('templateSheet').value)]));$('templateStatus').textContent=`识别到 ${records.length} 组三行 code；原文件未修改。`;renderMatches();}catch(e){records=[];$('templateStatus').textContent=e.message;renderMatches();}}
$('templateSheet').onchange=readSheet;
function renderMatches(){const s=$('templateMatch');s.replaceChildren();if(!current)return;const id=itemId(current);records.forEach((r,i)=>{const rid=normalize(r.id)?itemId(normalize(r.id)):r.id;if(rid===id)s.add(new Option(`第 ${r.row} 行 · ${r.number||'未填商品番号'} · ${r.model} · ${r.internal}`,String(i)));});if(!s.options.length)s.add(new Option('原表未找到此 URL ID，请手动填写',''));$('applyMatch').disabled=!s.value;}
$('applyMatch').onclick=()=>{const r=records[Number($('templateMatch').value)];if(!r)return;const d=getDraft();if(d.edited&&!confirm('用所选原表记录替换当前商品已编辑的 code？'))return;drafts.set(current,{...structuredClone(r),edited:true});showProduct();status('已填入原表记录；同一 URL 的不同商品番号需选择对应记录。');};
let pending=null;
$('collectDetails').onclick=()=>{if(!current||pending)return;const id=crypto.randomUUID(),url=current;status('正在获取 PC／手机版详情…');$('collectDetails').disabled=true;pending={id,url,timer:setTimeout(()=>{pending=null;$('collectDetails').disabled=!current;status('未收到采集结果。请安装详情采集脚本、刷新网页后重试。');},70000)};window.postMessage({type:'RK_CODE_FETCH_DETAIL',id,url},location.origin);};
window.addEventListener('message',e=>{if(e.source!==window||e.origin!==location.origin||e.data?.type!=='RK_CODE_DETAIL_RESULT'||!pending||e.data.id!==pending.id)return;const url=pending.url;clearTimeout(pending.timer);pending=null;$('collectDetails').disabled=!current;details.set(url,e.data.result);if(current===url)showProduct();status('详情采集结束。请查看两种页面的原文或错误提示；动态选项可能未包含在静态页面中。');});
renderPicker();
