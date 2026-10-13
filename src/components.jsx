import React,{useState,useEffect,useLayoutEffect,useRef} from 'react';
import {Button,Tooltip,Modal as DshModal,IconCopyOutlineRegular,IconFullscreenOutlineRegular,IconCloseOutlineRegular,IconCheckOutlineRegular,IconDownloadOutlineRegular,IconCodeOutlineRegular,IconPlayOutlineRegular,IconPauseOutlineRegular,IconPlusOutlineRegular,IconRightUpOutlineRegular} from '@deepseek-ai/dsh-client-ui-primitives';
import {tableClipboard} from './core.js';

export function Icon({name}) {
  const Native={copy:IconCopyOutlineRegular,expand:IconFullscreenOutlineRegular,close:IconCloseOutlineRegular,check:IconCheckOutlineRegular,download:IconDownloadOutlineRegular,code:IconCodeOutlineRegular,play:IconPlayOutlineRegular,pause:IconPauseOutlineRegular,plus:IconPlusOutlineRegular,external:IconRightUpOutlineRegular}[name];
  if(Native)return <Native size={16}/>;
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" aria-hidden="true"><path d="M4 8h8"/></svg>;
}

export function Action({label,icon,onClick,disabled=false,pressed}) {
  return <Tooltip label={label} side="top" delayMs={350} portal disabled={disabled}><Button variant="ghost" size="sm" className="dcr-action" aria-label={label} aria-pressed={pressed} onClick={onClick} disabled={disabled}><Icon name={icon}/></Button></Tooltip>;
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

export function Modal({title,children,actions,onClose,className=''}) {
  const timer=useRef(),[closing,setClosing]=useState(false);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const close=()=>{if(closing)return;setClosing(true);timer.current=setTimeout(onClose,matchMedia('(prefers-reduced-motion: reduce)').matches?0:160);};
  return <DshModal open onClose={close} title={title} closeLabel="关闭预览" className={`dcr-dialog ${className}${closing?' dcr-closing':''}`}>
    <div className="dcr-preview-actions dcr-actions">{actions}</div><div className="dcr-dialog-body">{children}</div>
  </DshModal>;
}

function TablePreview({table}) {
  const target=useRef();
  useLayoutEffect(()=>{
    const original=Array.from(table.querySelectorAll('button')),clone=table.cloneNode(true);
    const markdown=table.closest('div[class*="_markdown_"]').cloneNode(false),frame=table.parentElement.cloneNode(false);
    frame.classList.remove('dcr-table-owner');
    clone.classList.add('dcr-preview-table');frame.append(clone);markdown.append(frame);target.current.append(markdown);
    const buttons=Array.from(clone.querySelectorAll('button'));
    const forward=event=>{const button=event.target.closest('button');if(button)original[buttons.indexOf(button)]?.click();};
    clone.addEventListener('click',forward);
    return()=>{clone.removeEventListener('click',forward);markdown.remove();};
  },[table]);
  return <div ref={target} className="dcr-table-preview" tabIndex="0" role="region" aria-label="表格内容"/>;
}

export function TableTools({table}) {
  const [expanded,setExpanded]=useState(false),[top,setTop]=useState(0);
  useLayoutEffect(()=>{
    const header=table.tHead.rows[0],owner=table.parentElement;
    const align=()=>{const row=header.getBoundingClientRect(),container=owner.getBoundingClientRect();setTop(row.top-container.top+(row.height-28)/2);};
    align();const observer=new ResizeObserver(align);observer.observe(header);observer.observe(owner);
    return()=>observer.disconnect();
  },[table]);
  return <><div className="dcr-table-tools" style={{top}}><Copy label="复制表格" getValue={()=>tableClipboard(table)}/><Action label="展开表格" icon="expand" onClick={()=>setExpanded(true)}/></div>
    {expanded&&<Modal className="dcr-table-dialog" title="表格预览" onClose={()=>setExpanded(false)} actions={<Copy label="复制表格" getValue={()=>tableClipboard(table)}/>}><TablePreview table={table}/></Modal>}</>;
}

function saveBlob(blob,name) {
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function MermaidCard({code}) {
  const [svg,setSvg]=useState(''),[error,setError]=useState(''),[source,setSource]=useState(false),[expanded,setExpanded]=useState(false),[zoom,setZoom]=useState(1),[palette,setPalette]=useState(null),holder=useRef();
  useLayoutEffect(()=>{
    let previous='';
    const read=()=>{const style=getComputedStyle(holder.current),token=name=>style.getPropertyValue(name).trim(),next={fontFamily:style.fontFamily,fontSize:'14px',primaryColor:token('--dsw-alias-bg-layer-2'),primaryTextColor:token('--dsw-alias-label-primary'),primaryBorderColor:token('--dsw-alias-border-l2'),lineColor:token('--dsw-alias-label-secondary'),edgeLabelBackground:token('--dsw-alias-markdown-code-block')},key=JSON.stringify(next);if(key!==previous){previous=key;setPalette(next);}};
    read();
    const observer=new MutationObserver(read);observer.observe(document.documentElement,{attributes:true});observer.observe(document.body,{attributes:true});
    const scheme=matchMedia('(prefers-color-scheme: dark)');scheme.addEventListener('change',read);
    return()=>{observer.disconnect();scheme.removeEventListener('change',read);};
  },[]);
  useEffect(()=>{
    if(!palette)return;
    let live=true;setSvg('');setError('');
    (async()=>{
      try {
        const {default:mermaid}=await import('mermaid');
        mermaid.initialize({startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,htmlLabels:false,theme:'base',fontFamily:palette.fontFamily,themeVariables:palette,flowchart:{htmlLabels:false,curve:'basis'}});
        const result=await mermaid.render(`dcr-${crypto.randomUUID()}`,code,holder.current);
        if(live)setSvg(result.svg);
      } catch(e) {if(live)setError('图表无法渲染，请检查 Mermaid 语法。');}
    })();
    return()=>{live=false;};
  },[code,palette]);
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
  const player=useRef(),[src,setSrc]=useState(null),[playing,setPlaying]=useState(false),[position,setPosition]=useState(0),[duration,setDuration]=useState(0),[error,setError]=useState('');
  const name=item.label||decodeURIComponent(item.url.split(/[?#]/)[0].split('/').pop())||'媒体文件';
  useEffect(()=>{
    const controller=new AbortController(),element=player.current;let objectURL;
    setError('');setDuration(0);setPosition(0);setPlaying(false);
    // DSH's local file endpoint serves whole files without byte ranges.
    // A local Blob gives the browser a seekable source without changing DSH.
    const local=item.src.startsWith(new URL('api/file?',document.baseURI).href);
    setSrc(local?null:item.src);
    if(local)(async()=>{try{
      const response=await fetch(item.src,{signal:controller.signal});if(!response.ok)throw Error();
      const blob=await response.blob();if(controller.signal.aborted)return;
      objectURL=URL.createObjectURL(blob);setSrc(objectURL);
    }catch{if(!controller.signal.aborted)setError('无法播放此文件，可通过原始文件链接打开。');}})();
    return()=>{controller.abort();element.pause();element.removeAttribute('src');element.load();if(objectURL)URL.revokeObjectURL(objectURL);};
  },[item.src]);
  const download=async()=>{try{const response=await fetch(item.src);if(!response.ok)throw Error();saveBlob(await response.blob(),decodeURIComponent(item.url.split(/[?#]/)[0].split('/').pop())||`${item.kind}.bin`);}catch{setError('下载失败，可通过原始文件链接打开。');}};
  const common={src:src??undefined,preload:'metadata',onError:()=>setError('无法播放此文件，可通过原始文件链接打开。'),onLoadedMetadata:e=>{const value=e.currentTarget.duration;setDuration(Number.isFinite(value)?value:0);},onTimeUpdate:e=>setPosition(e.currentTarget.currentTime),onPlay:()=>setPlaying(true),onPause:()=>setPlaying(false),onEnded:()=>setPlaying(false)};
  return <section className={`dcr-media dcr-${item.kind}`} aria-label={`${item.kind==='audio'?'音频':'视频'}播放器`}>
    <header><div className="dcr-media-name"><span>{name}</span><small>{item.kind==='audio'?'音频':'视频'}</small></div><div className="dcr-actions"><Action label="打开原始文件" icon="external" onClick={()=>window.open(item.src,'_blank','noopener,noreferrer')}/><Action label="下载媒体" icon="download" onClick={download}/></div></header>
    {item.kind==='video'?<video ref={player} controls playsInline {...common}/>:<><audio ref={player} {...common}/><div className="dcr-audio-controls"><Action label={playing?'暂停音频':'播放音频'} icon={playing?'pause':'play'} disabled={!src} onClick={async()=>{try{if(playing)player.current.pause();else await player.current.play();}catch{setError('无法播放此文件，可通过原始文件链接打开。');}}}/><input type="range" min="0" max={duration||1} step=".01" value={Math.min(position,duration||1)} disabled={!duration} style={{'--dcr-progress':`${duration?position/duration*100:0}%`}} aria-label="音频进度" aria-valuetext={`${time(position)} / ${time(duration)}`} onChange={e=>{const value=Number(e.target.value);player.current.currentTime=value;setPosition(value);}}/><span className="dcr-time">{time(position)} / {time(duration)}</span></div></>}
    {!src&&!error&&<p className="dcr-status" role="status">正在加载{item.kind==='audio'?'音频':'视频'}…</p>}
    {error&&<p className="dcr-status" role="status">{error}</p>}
  </section>;
}
