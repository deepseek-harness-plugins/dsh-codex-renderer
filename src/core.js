import {fromMarkdown} from 'mdast-util-from-markdown';

export const PREFERENCE_KEY = 'dsh-codex-renderer.ui.v1';
export const DEFAULTS = Object.freeze({tables:true,mermaid:true,media:true});

export function mediaKind(value) {
  if (/^data:audio\//i.test(value)) return 'audio';
  if (/^data:video\//i.test(value)) return 'video';
  let path;
  try {path=decodeURIComponent(value.split(/[?#]/)[0]);} catch {return null;}
  if (/\.(?:mp3|wav|m4a|ogg|oga|flac|aac|opus)$/i.test(path)) return 'audio';
  if (/\.(?:mp4|webm|mov|m4v|ogv|mkv)$/i.test(path)) return 'video';
  return null;
}

export function mediaURL(value,base=document.baseURI) {
  if (/^https?:\/\//i.test(value)||/^blob:/i.test(value)||/^data:(audio|video)\//i.test(value)) return value;
  if (value.startsWith('dsh-app://app/api/file?')) return value;
  let path;
  try {path=decodeURIComponent(value.split(/[?#]/)[0]);} catch {return null;}
  if (!/^\/(?!\/)/.test(path)||/[\u0000-\u001f\u007f]/.test(path)) return null;
  if (!/^https?:/.test(base)&&!base.startsWith('dsh-app://app/')) return null;
  return new URL(`api/file?path=${encodeURIComponent(path)}`,base).href;
}

export function contentWidgets(markdown) {
  const tree=fromMarkdown(markdown),codes=[],media=[],definitions=new Map();
  const walk=(node,fn,parent)=>{fn(node,parent);for(const child of node.children??[])walk(child,fn,node);};
  walk(tree,n=>{if(n.type==='definition')definitions.set(n.identifier.toUpperCase(),n.url);});
  walk(tree,(node,parent)=>{
    if (node.type==='code'&&node.lang?.toLowerCase()==='mermaid') codes.push(node.value);
    const isImage=node.type==='image'||node.type==='imageReference';
    const isLink=(node.type==='link'||node.type==='linkReference')&&parent?.type==='paragraph'&&parent.children.length===1;
    if (!isImage&&!isLink) return;
    const url=node.url??definitions.get(node.identifier?.toUpperCase());
    const kind=url&&mediaKind(url);
    if (kind&&!media.some(item=>item.url===url)) media.push({url,kind,image:isImage,label:node.alt??node.children?.map(n=>n.value??'').join('')??''});
  });
  return {codes,media};
}

export function tableClipboard(table) {
  const text=Array.from(table.rows,row=>Array.from(row.cells,cell=>(cell.innerText??cell.textContent).replace(/\r?\n/g,' ')).join('\t')).join('\n');
  return {text,html:table.outerHTML};
}

export function createPreferences(storage) {
  const listeners=new Set();
  const read=()=>{
    let data;
    try {data=JSON.parse(storage.getItem(PREFERENCE_KEY));}catch{return DEFAULTS;}
    return Object.freeze(Object.fromEntries(Object.entries(DEFAULTS).map(([key,value])=>[key,typeof data?.[key]==='boolean'?data[key]:value])));
  };
  let current=read();
  const publish=next=>{if(Object.keys(DEFAULTS).every(key=>current[key]===next[key]))return;current=next;listeners.forEach(fn=>fn());};
  return {getSnapshot:()=>current,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},reload:()=>publish(read()),update:patch=>{const next=Object.freeze({...current,...patch});storage.setItem(PREFERENCE_KEY,JSON.stringify(next));publish(next);}};
}
