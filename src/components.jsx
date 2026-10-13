import React,{useState,useEffect,useLayoutEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {tableClipboard} from './core.js';

export function Icon({name}) {
  const paths={copy:<><rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V5a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h3"/></>,expand:<><path d="M14 3h7v7M21 3l-7 7M10 21H3v-7M3 21l7-7"/></>,close:<path d="m6 6 12 12M18 6 6 18"/>,check:<path d="m4 12 5 5L20 6"/>,download:<><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,code:<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>,play:<path d="m8 4 13 8-13 8Z"/>,pause:<><path d="M8 4v16M16 4v16"/></>,minus:<path d="M5 12h14"/>,plus:<path d="M5 12h14M12 5v14"/>};
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function Action({label,icon,onClick,disabled=false,pressed}) {
  return <button type="button" className="dcr-action" aria-label={label} aria-pressed={pressed} onClick={onClick} disabled={disabled}><Icon name={icon}/></button>;
}

export function Copy({getValue,label='复制'}) {
  const [status,setStatus]=useState('idle'),timer=useRef();
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const copy=async()=>{
    try {
      const value=getValue();
      if (typeof value==='string')await navigator.clipboard.writeText(value);
      else if(navigator.clipboard.write&&typeof ClipboardItem!=='undefined')await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([value.text],{type:'text/plain'}),'text/html':new Blob([value.html],{type:'text/html'})})]);
      else await navigator.clipboard.writeText(value.text);
      setStatus('copied');
    } catch {setStatus('error');}
    clearTimeout(timer.current);timer.current=setTimeout(()=>setStatus('idle'),1600);
  };
  return <Action label={status==='copied'?'已复制':status==='error'?'复制失败，点击重试':label} icon={status==='copied'?'check':'copy'} onClick={copy}/>;
}

export function Modal({title,children,actions,onClose}) {
  const dialog=useRef(),timer=useRef(),[closing,setClosing]=useState(false);
  useLayoutEffect(()=>{const element=dialog.current;element.showModal();return()=>{clearTimeout(timer.current);element.close();};},[]);
  const close=()=>{if(closing)return;setClosing(true);timer.current=setTimeout(onClose,matchMedia('(prefers-reduced-motion: reduce)').matches?0:160);};
  return createPortal(<dialog ref={dialog} className={`dcr-dialog${closing?' dcr-closing':''}`} aria-label={title} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===dialog.current)close();}}>
    <header><span>{title}</span><div className="dcr-actions">{actions}<Action label="关闭预览" icon="close" onClick={close}/></div></header>
    <div className="dcr-dialog-body">{children}</div>
  </dialog>,document.body);
}

function TablePreview({table}) {
  const target=useRef();
  useLayoutEffect(()=>{
    const original=Array.from(table.querySelectorAll('button')),clone=table.cloneNode(true);
    clone.classList.add('dcr-preview-table');target.current.append(clone);
    const buttons=Array.from(clone.querySelectorAll('button'));
    const forward=event=>{const button=event.target.closest('button');if(button)original[buttons.indexOf(button)]?.click();};
    clone.addEventListener('click',forward);
    return()=>{clone.removeEventListener('click',forward);clone.remove();};
  },[table]);
  return <div ref={target} className="dcr-table-preview" tabIndex="0" role="region" aria-label="表格内容"/>;
}

export function TableTools({table}) {
  const [expanded,setExpanded]=useState(false);
  return <><div className="dcr-table-tools"><Copy label="复制表格" getValue={()=>tableClipboard(table)}/><Action label="展开表格" icon="expand" onClick={()=>setExpanded(true)}/></div>
    {expanded&&<Modal title="表格预览" onClose={()=>setExpanded(false)} actions={<Copy label="复制表格" getValue={()=>tableClipboard(table)}/>}><TablePreview table={table}/></Modal>}</>;
}

function saveBlob(blob,name) {
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function MermaidCard({code}) {
  const [svg,setSvg]=useState(''),[error,setError]=useState(''),[source,setSource]=useState(false),[expanded,setExpanded]=useState(false),[zoom,setZoom]=useState(1),holder=useRef();
  useEffect(()=>{
    let live=true;setSvg('');setError('');
    (async()=>{
      try {
        const {default:mermaid}=await import('mermaid');
        mermaid.initialize({startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,theme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'neutral',fontFamily:getComputedStyle(document.body).fontFamily,flowchart:{htmlLabels:false}});
        const result=await mermaid.render(`dcr-${crypto.randomUUID()}`,code,holder.current);
        if(live)setSvg(result.svg);
      } catch(e) {if(live)setError('图表无法渲染，请检查 Mermaid 语法。');}
    })();
    return()=>{live=false;};
  },[code]);
  const actions=<><Copy label="复制 Mermaid 源码" getValue={()=>code}/><Action label="显示源码" icon="code" pressed={source} onClick={()=>setSource(!source)}/><Action label="下载 SVG" icon="download" disabled={!svg} onClick={()=>saveBlob(new Blob([svg],{type:'image/svg+xml'}),'diagram.svg')}/><Action label="展开图表" icon="expand" disabled={!svg} onClick={()=>{setZoom(1);setExpanded(true);}}/></>;
  return <div className="dcr-mermaid" aria-label="Mermaid 图表">
    <header><span>Mermaid</span><div className="dcr-actions">{actions}</div></header>
    <div ref={holder} className="dcr-render-work" aria-hidden="true"/>
    {source||error?<><pre><code>{code}</code></pre>{error&&<p className="dcr-status" role="status">{error}</p>}</>:svg?<div className="dcr-diagram" dangerouslySetInnerHTML={{__html:svg}}/>:<p className="dcr-status" role="status">正在绘制图表…</p>}
    {expanded&&<Modal title="图表预览" onClose={()=>setExpanded(false)} actions={<><Action label="缩小图表" icon="minus" disabled={zoom<=.5} onClick={()=>setZoom(Math.max(.5,zoom-.25))}/><span className="dcr-zoom">{Math.round(zoom*100)}%</span><Action label="放大图表" icon="plus" disabled={zoom>=3} onClick={()=>setZoom(Math.min(3,zoom+.25))}/></>}><div className="dcr-diagram dcr-diagram-expanded" style={{zoom}} dangerouslySetInnerHTML={{__html:svg}}/></Modal>}
  </div>;
}

const time=value=>`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;
export function MediaCard({item}) {
  const player=useRef(),[playing,setPlaying]=useState(false),[position,setPosition]=useState(0),[duration,setDuration]=useState(0),[error,setError]=useState('');
  const name=item.label||decodeURIComponent(item.url.split(/[?#]/)[0].split('/').pop())||'媒体文件';
  useEffect(()=>{const element=player.current;return()=>{element.pause();element.removeAttribute('src');element.load();};},[]);
  const download=async()=>{try{const response=await fetch(item.src);if(!response.ok)throw Error();saveBlob(await response.blob(),decodeURIComponent(item.url.split(/[?#]/)[0].split('/').pop())||`${item.kind}.bin`);}catch{setError('下载失败，可通过原始文件链接打开。');}};
  const common={src:item.src,preload:'metadata',onError:()=>setError('无法播放此文件，可通过原始文件链接打开。'),onLoadedMetadata:e=>{const value=e.currentTarget.duration;setDuration(Number.isFinite(value)?value:0);},onTimeUpdate:e=>setPosition(e.currentTarget.currentTime),onPlay:()=>setPlaying(true),onPause:()=>setPlaying(false),onEnded:()=>setPlaying(false)};
  return <section className={`dcr-media dcr-${item.kind}`} aria-label={`${item.kind==='audio'?'音频':'视频'}播放器`}>
    <header><div><strong>{name}</strong><small>{item.kind==='audio'?'Audio':'Video'}</small></div><Action label="下载媒体" icon="download" onClick={download}/></header>
    {item.kind==='video'?<video ref={player} controls playsInline {...common}/>:<><audio ref={player} {...common}/><div className="dcr-audio-controls"><button type="button" className="dcr-play" aria-label={playing?'暂停音频':'播放音频'} onClick={async()=>{try{if(playing)player.current.pause();else await player.current.play();}catch{setError('无法播放此文件，可通过原始文件链接打开。');}}}><Icon name={playing?'pause':'play'}/></button><input type="range" min="0" max={duration||1} step=".01" value={Math.min(position,duration||1)} disabled={!duration} aria-label="音频进度" aria-valuetext={`${time(position)} / ${time(duration)}`} onChange={e=>{const value=Number(e.target.value);player.current.currentTime=value;setPosition(value);}}/><span className="dcr-time">{time(position)} / {time(duration)}</span></div></>}
    {error&&<p className="dcr-status" role="status">{error}</p>}<a className="dcr-media-original" href={item.src} target="_blank" rel="noopener noreferrer">打开原始文件</a>
  </section>;
}
