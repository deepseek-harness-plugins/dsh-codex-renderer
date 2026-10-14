import React,{useState,useEffect,useLayoutEffect,useRef} from 'react';
import {Button,Tooltip,IconCopyOutlineRegular,IconFullscreenOutlineRegular,IconCloseOutlineRegular,IconCheckOutlineRegular,IconDownloadOutlineRegular,IconCodeOutlineRegular,IconPlayOutlineRegular,IconPauseOutlineRegular,IconPlusOutlineRegular,IconRightUpOutlineRegular} from '@deepseek-ai/dsh-client-ui-primitives';
import {Action as MediaAction,Icon as MediaIcon,Menu} from './controls.jsx';
import {tableClipboard} from './core.js';
import {PreviewModal as Modal} from './preview.jsx';

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

export {MermaidCard} from './mermaid.jsx';

const time=value=>`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;
export function MediaCard({item}) {
  const player=useRef(),frame=useRef(),scrub=useRef(),[src,setSrc]=useState(null),[playing,setPlaying]=useState(false),[position,setPosition]=useState(0),[duration,setDuration]=useState(0),[error,setError]=useState(''),[volume,setVolume]=useState(1),[muted,setMuted]=useState(false),[rate,setRate]=useState(1),[fullscreen,setFullscreen]=useState(false),[videoSize,setVideoSize]=useState(null);
  const filename=decodeURIComponent(item.url.split(/[?#]/)[0].split('/').pop()),name=filename||item.label||'媒体文件',kind=item.kind==='audio'?'音频':'视频';
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
  useEffect(()=>{const update=()=>setFullscreen(document.fullscreenElement===frame.current);document.addEventListener('fullscreenchange',update);return()=>document.removeEventListener('fullscreenchange',update);},[]);
  const download=async()=>{try{const response=await fetch(item.src);if(!response.ok)throw Error();saveBlob(await response.blob(),decodeURIComponent(item.url.split(/[?#]/)[0].split('/').pop())||`${item.kind}.bin`);}catch{setError('下载失败，可通过原始文件链接打开。');}};
  const toggle=async()=>{try{if(player.current.paused)await player.current.play();else player.current.pause();}catch{setError('无法播放此文件，可通过原始文件链接打开。');}};
  const finishScrub=()=>{const resume=scrub.current;scrub.current=null;if(resume)player.current.play().catch(()=>setError('无法恢复播放。'));};
  const timeline=<input className="dcr-timeline" type="range" min="0" max={duration||1} step=".1" value={Math.min(position,duration||1)} disabled={!duration} style={{'--dcr-progress':`${duration?position/duration*100:0}%`}} aria-label={`${kind}进度`} aria-valuetext={`${time(position)} / ${time(duration)}`} onPointerDown={()=>{scrub.current=!player.current.paused;if(item.kind==='video')player.current.pause();}} onPointerUp={finishScrub} onPointerCancel={finishScrub} onLostPointerCapture={finishScrub} onChange={e=>{const value=Number(e.target.value);player.current.currentTime=value;setPosition(value);}}/>;
  const play=<MediaAction label={playing?`暂停${kind}`:`播放${kind}`} icon={playing?'pause':item.kind==='video'?'playOutline':'play'} variant={item.kind==='audio'?'audio':'toolbar'} tooltip={item.kind==='video'} disabled={!src} onClick={toggle}/>;
  const copyPath=()=>navigator.clipboard.writeText(item.url);
  const common={src:src??undefined,preload:'metadata',onError:()=>setError('无法播放此文件，可通过原始文件链接打开。'),onLoadedMetadata:e=>{const el=e.currentTarget,value=el.duration;setDuration(Number.isFinite(value)?value:0);if(item.kind==='video')setVideoSize({width:el.videoWidth,height:el.videoHeight});},onTimeUpdate:e=>setPosition(e.currentTarget.currentTime),onPlay:()=>setPlaying(true),onPause:()=>setPlaying(false),onEnded:()=>setPlaying(false),onVolumeChange:e=>{setVolume(e.currentTarget.volume);setMuted(e.currentTarget.muted);},onRateChange:e=>setRate(e.currentTarget.playbackRate)};
  return <section ref={frame} className={`dcr-media dcr-${item.kind}`} style={videoSize?{'--dcr-video-width':`${videoSize.width}px`,'--dcr-video-ratio':videoSize.width/videoSize.height}:undefined} aria-label={`${kind}播放器`}>
    {item.kind==='video'?<><video ref={player} playsInline tabIndex="0" aria-label={item.label||name} onClick={toggle} onKeyDown={event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();if(!event.repeat)toggle();}}} {...common}/><div className="dcr-video-controls">
      {play}{timeline}<span className="dcr-time">{time(position)} / {time(duration)}</span><div className="dcr-video-actions">
        <Menu label="视频音量" icon={muted||!volume?'mute':'volume'} kind="volume" side="top"><div className="dcr-volume-control"><MediaAction label={muted?'取消静音':'静音视频'} icon={muted||!volume?'mute':'volume'} pressed={muted} onClick={()=>{player.current.muted=!player.current.muted;}}/><input className="dcr-timeline" type="range" min="0" max="1" step=".01" value={muted?0:volume} aria-label="视频音量大小" style={{'--dcr-progress':`${muted?0:volume*100}%`}} onChange={event=>{player.current.volume=Number(event.target.value);player.current.muted=false;}}/></div></Menu>
        <Menu label="视频选项" side="top" items={[{label:'将视频保存为…',onSelect:download},{separator:true},{label:'复制链接',onSelect:copyPath},{separator:true},{heading:'播放速度'},...[.25,.5,.75,1,1.25,1.5,1.75,2].map(value=>({label:`${value}×`,checked:rate===value,onSelect:()=>{player.current.playbackRate=value;}})),...document.pictureInPictureEnabled?[{label:'画中画',onSelect:async()=>{try{if(document.pictureInPictureElement===player.current)await document.exitPictureInPicture();else await player.current.requestPictureInPicture();}catch{setError('无法打开画中画。');}}}]:[]]}/>
        <MediaAction label={fullscreen?'退出全屏':'全屏播放'} icon={fullscreen?'collapse':'expand'} onClick={async()=>{try{if(fullscreen)await document.exitFullscreen();else await frame.current.requestFullscreen();}catch{setError('无法进入全屏播放。');}}}/>
      </div></div></>:<><audio ref={player} {...common}/><header><div className="dcr-audio-file-icon"><MediaIcon name="audio" size={24}/></div><div className="dcr-media-name"><span title={name}>{name}</span><small>{!src?'正在加载音频…':`${filename.split('.').pop().toUpperCase()} 音频`}</small></div><div className="dcr-actions">{play}<Menu label="音频选项" variant="audio-more" kind="audio" items={[{label:'复制路径',icon:'copy',onSelect:copyPath},{label:'保存副本…',icon:'download',onSelect:download}]}/></div></header><div className="dcr-audio-controls">{timeline}<span className="dcr-time">{time(position)} / {time(duration)}</span></div></>}
    {item.kind==='video'&&!src&&!error&&<p className="dcr-status" role="status">正在加载视频…</p>}
    {error&&<p className="dcr-status" role="status">{error}</p>}
  </section>;
}
