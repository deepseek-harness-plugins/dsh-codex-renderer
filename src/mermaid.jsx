import React,{useState,useEffect,useLayoutEffect,useRef} from 'react';
import {Button,Tooltip} from '@deepseek-ai/dsh-client-ui-primitives';
import {PreviewModal} from './preview.jsx';
import {Action,Menu,Icon} from './controls.jsx';
import {renderDiagram} from './mermaid-render.js';

function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function downloadImage(svg,dark){
  const image=new Image(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  try{
    image.src=url;await image.decode();const canvas=document.createElement('canvas');
    canvas.width=image.naturalWidth*2;canvas.height=image.naturalHeight*2;
    const ctx=canvas.getContext('2d');ctx.fillStyle=dark?'#181818':'#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw Error('PNG export failed');save(png,'mermaid-diagram.png');
  }finally{URL.revokeObjectURL(url);}
}

function ViewerButton({label,icon,onClick,disabled}){
  return <Tooltip label={label} side="top" delayMs={350} portal disabled={disabled}><Button variant="ghost" size="sm" className="dcr-action" aria-label={label} disabled={disabled} onClick={onClick}><Icon name={icon} size={16}/></Button></Tooltip>;
}

function Viewer({svg,onClose,onDownload}){
  const drag=useRef(),[zoom,setZoom]=useState(1),[offset,setOffset]=useState({x:0,y:0}),[dragging,setDragging]=useState(false);
  const adjust=value=>setZoom(current=>Math.min(4,Math.max(.25,current+value)));
  const reset=()=>{setZoom(1);setOffset({x:0,y:0});};
  return <PreviewModal title="图表预览" className="dcr-graph-dialog" onClose={onClose}
    actions={<ViewerButton label="下载图像" icon="download" onClick={onDownload}/>}
    footer={<div className="dcr-graph-zoom"><ViewerButton label="缩小图表" icon="minus" disabled={zoom<=.25} onClick={()=>adjust(-.25)}/><Button variant="ghost" size="sm" className="dcr-zoom" aria-label="重置图表缩放" onClick={reset}>{Math.round(zoom*100)}%</Button><ViewerButton label="放大图表" icon="plus" disabled={zoom>=4} onClick={()=>adjust(.25)}/></div>}
    onKeyDownCapture={event=>{
      if(['+','=','-','0'].includes(event.key)&&!event.ctrlKey&&!event.metaKey){event.preventDefault();if(event.key==='0')reset();else adjust(event.key==='-'?-.25:.25);}
    }}>
    <div className={`dcr-graph-canvas${dragging?' dcr-graph-dragging':''}`} onPointerDown={event=>{
      if(event.button!==0)return;drag.current={x:event.clientX,y:event.clientY,offset};event.currentTarget.setPointerCapture(event.pointerId);setDragging(true);
    }} onPointerMove={event=>{if(drag.current)setOffset({x:drag.current.offset.x+event.clientX-drag.current.x,y:drag.current.offset.y+event.clientY-drag.current.y});}} onPointerUp={()=>{drag.current=null;setDragging(false);}} onPointerCancel={()=>{drag.current=null;setDragging(false);}} onLostPointerCapture={()=>{drag.current=null;setDragging(false);}}>
      <div className="dcr-graph-image" style={{transform:`translate(${offset.x}px,${offset.y}px) scale(${zoom})`}} dangerouslySetInnerHTML={{__html:svg}}/>
    </div>
  </PreviewModal>;
}

export function MermaidCard({code}){
  const [svg,setSvg]=useState(''),[error,setError]=useState(''),[source,setSource]=useState(false),[expanded,setExpanded]=useState(false),[palette,setPalette]=useState(null),[notice,setNotice]=useState(''),holder=useRef(),timer=useRef();
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useLayoutEffect(()=>{
    let previous='';
    const read=()=>{const style=getComputedStyle(holder.current),rgb=style.color.match(/[\d.]+/g),next={fontFamily:style.fontFamily,dark:rgb?Number(rgb[0])>128:matchMedia('(prefers-color-scheme: dark)').matches},key=JSON.stringify(next);if(key!==previous){previous=key;setPalette(next);}};
    read();const observer=new MutationObserver(read);observer.observe(document.documentElement,{attributes:true});observer.observe(document.body,{attributes:true});
    const scheme=matchMedia('(prefers-color-scheme: dark)');scheme.addEventListener('change',read);
    return()=>{observer.disconnect();scheme.removeEventListener('change',read);};
  },[]);
  useEffect(()=>{
    if(!palette)return;let live=true;
    renderDiagram(code,palette,holder.current).then(result=>{if(live){setSvg(result);setError('');}},()=>{if(live){setSvg('');setError('图表无法渲染，请检查 Mermaid 语法。');}});
    return()=>{live=false;};
  },[code,palette]);
  const notify=message=>{setNotice(message);clearTimeout(timer.current);timer.current=setTimeout(()=>setNotice(''),2000);};
  const download=()=>downloadImage(svg,palette.dark).catch(()=>notify('下载失败，请重试。'));
  return <div className="dcr-mermaid" aria-label="Mermaid 图表">
    <div className="dcr-graph-tools"><Menu variant="graph" kind="graph" label="图表选项" items={[
      {label:source?'显示图表':'显示源代码',icon:'code',onSelect:()=>setSource(!source)},
      {label:'复制为代码',icon:'copy',onSelect:()=>navigator.clipboard.writeText(code).then(()=>notify('已复制'),()=>notify('复制失败，请重试。'))},
      {label:'下载图像',icon:'download',disabled:!svg,onSelect:download}
    ]}/><Action variant="graph" label="展开图表" icon="expand" disabled={!svg} onClick={()=>setExpanded(true)}/></div>
    <div ref={holder} className="dcr-render-work" aria-hidden="true"/>
    {source||error?<pre className="dcr-graph-source"><code>{code}</code></pre>:svg?<div className="dcr-diagram" dangerouslySetInnerHTML={{__html:svg}}/>:<p className="dcr-status" role="status">正在绘制图表…</p>}
    {(error||notice)&&<p className="dcr-status dcr-graph-notice" role="status">{error||notice}</p>}
    {expanded&&<Viewer svg={svg} onDownload={download} onClose={()=>setExpanded(false)}/>}
  </div>;
}
