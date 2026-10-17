import React,{useState,useRef,useLayoutEffect,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {Switch} from '@deepseek-ai/dsh-client-ui-primitives';
import {contentWidgets,mediaURL,createPreferences,PREFERENCE_KEY} from './core.js';
import {TableTools,MermaidCard,MediaCard} from './components.jsx';
import css from './styles.css';
import {decorateSlot} from './slot-decoration.js';

export const inject = ['slots'];

const SETTINGS=[
  ['tables','表格控件','复制表格与展开预览'],
  ['mermaid','Mermaid 图表','将 Mermaid 代码块显示为图表'],
  ['media','音视频播放器','在回复中播放音频和视频'],
];

function SettingsRow({preferences,setting:[key,label,description]}) {
  const values=useSyncExternalStore(preferences.subscribe,preferences.getSnapshot),[error,setError]=useState('');
  return <div className="dcr-settings dcr-setting-row">
    <div><div className="dcr-setting-title">{label}</div><div className="dcr-setting-description">{description}</div>{error&&<div role="alert">{error}</div>}</div>
    <Switch label={label} checked={values[key]} onChange={next=>{try{preferences.update({[key]:next});setError('');}catch(e){setError('设置未保存：'+e.message);}}}/>
  </div>;
}

function EnhancedReply({inner:Inner,preferences,...props}) {
  const root=useRef(),records=useRef(new Map()),[widgets,setWidgets]=useState([]),settings=useSyncExternalStore(preferences.subscribe,preferences.getSnapshot);
  const blocks=props.node.data.blocks.filter(block=>block.kind==='text').map(block=>block.text),streaming=props.node.data.status==='running';
  const sourceKey=blocks.join('\u0000');
  useLayoutEffect(()=>{
    const source=root.current;let frame;
    const release=entry=>{entry.element.classList.remove(entry.kind==='table'?'dcr-table-owner':'dcr-native-hidden');entry.mount.remove();};
    const scan=()=>{
      const wanted=new Map(),markdowns=Array.from(source.querySelectorAll('div[class*="_markdown_"]:not([data-markdown-variant])')).filter(el=>!el.closest('[data-dcr-ui]'));
      const add=(kind,element,anchor,data)=>{
        const signature=`${kind}:${data.code??data.item?.url??''}`;
        const previous=records.current.get(element);
        const entry=previous?.signature===signature&&previous.mount.isConnected&&(kind!=='table'||previous.table===data.table)?previous:{signature,id:crypto.randomUUID(),kind,element,mount:document.createElement('div'),...data};
        if(entry!==previous){if(previous)release(previous);entry.mount.dataset.dcrUi='';entry.mount.className=`dcr-${kind}-mount`;if(kind==='table')element.append(entry.mount);else anchor.after(entry.mount);}
        entry.element.classList.add(kind==='table'?'dcr-table-owner':'dcr-native-hidden');
        wanted.set(element,entry);
      };
      markdowns.forEach((markdown,index)=>{
        const content=contentWidgets(blocks[index]??'');
        if(settings.tables)for(const table of markdown.querySelectorAll('table'))add('table',table.parentElement,table,{table});
        if(settings.mermaid&&!streaming)for(const element of markdown.querySelectorAll('.md-code-block')){
          const code=element.querySelector('pre')?.textContent?.trimEnd();
          if(content.codes.includes(code))add('mermaid',element,element,{code});
        }
        if(settings.media&&!streaming)for(const item of content.media){
          let element;
          if(item.image)element=Array.from(markdown.querySelectorAll('img,span[class*="_imageAlt_"]')).find(el=>el.tagName==='IMG'?el.alt===item.label:el.textContent.endsWith(item.label));
          else element=Array.from(markdown.querySelectorAll('a,button')).find(el=>el.getAttribute('href')===item.url||el.textContent===item.label);
          if(!element)continue;
          const src=element.tagName==='IMG'?element.src:mediaURL(item.url);
          if(!src)continue;
          const anchor=element.closest('p')??element;
          // Keep the native link as the file-opening fallback; only image placeholders are hidden.
          if(!item.image){
            const sibling=anchor.nextElementSibling;
            if(sibling?.dataset.dcrUi!==undefined){const previous=records.current.get(element);if(previous)wanted.set(element,previous);continue;}
          }
          add('media',element,anchor,{item:{...item,src}});
          if(!item.image)element.classList.remove('dcr-native-hidden');
        }
      });
      for(const [element,entry]of records.current)if(!wanted.has(element))release(entry);
      const next=Array.from(wanted.values()),old=Array.from(records.current.values());
      records.current=wanted;
      if(next.length!==old.length||next.some((entry,index)=>entry!==old[index]))setWidgets(next);
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(scan);};
    scan();
    const observer=new MutationObserver(changes=>{
      if(changes.some(change=>!change.target.parentElement?.closest('[data-dcr-ui]')&&!change.target.closest?.('[data-dcr-ui]')&&Array.from(change.addedNodes).concat(Array.from(change.removedNodes)).some(node=>node.nodeType!==1||!node.hasAttribute('data-dcr-ui'))))schedule();
    });
    observer.observe(source,{subtree:true,childList:true,characterData:true});
    return()=>{cancelAnimationFrame(frame);observer.disconnect();};
  },[sourceKey,streaming,settings]);
  useLayoutEffect(()=>()=>{for(const entry of records.current.values()){entry.element.classList.remove('dcr-table-owner','dcr-native-hidden');entry.mount.remove();}records.current.clear();},[]);
  return <div ref={root} className="dcr-source"><Inner {...props}/>{widgets.map(entry=>createPortal(entry.kind==='table'?<TableTools table={entry.table}/>:entry.kind==='mermaid'?<MermaidCard code={entry.code}/>:<MediaCard item={entry.item}/>,entry.mount,entry.id))}</div>;
}

export function apply(ctx) {
  const style=document.createElement('style');style.dataset.plugin='@deepseekharness-plugin/dsh-codex-renderer';style.textContent=css;document.head.append(style);
  ctx.effect(()=>()=>style.remove());
  const preferences=createPreferences(localStorage);
  const reload=event=>{if(event.key===PREFERENCE_KEY||event.key===null)preferences.reload();};
  window.addEventListener('storage',reload);ctx.effect(()=>()=>window.removeEventListener('storage',reload));
  ctx.slots.inject('settings.general.item',()=>{
    const releases=SETTINGS.map((setting,index)=>ctx.slots.register({name:'settings.general.item',id:`codex-renderer-${setting[0]}`,order:21+index/10},()=> <SettingsRow preferences={preferences} setting={setting}/>));
    return()=>{for(const release of releases.reverse())release();};
  });
  const name='conversation.chat.node',registrations=new Map();
  const decorate=()=>{
    const entries=ctx.slots.entries(name);
    for(const [entry,release]of registrations)if(!entries.includes(entry)){registrations.delete(entry);release();}
    if(registrations.size)return;
    const entry=entries.find(entry=>entry.options.key==='assistant-step'&&(entry.options.priority??0)===0);
    if(entry){
      registrations.set(entry,()=>{});
      const release=decorateSlot(ctx,name,entry,(Original,props,active)=>!active||props.groupPart==='reasoning'?<Original {...props}/>:<EnhancedReply inner={Original} preferences={preferences} {...props}/>);
      registrations.set(entry,release);
    }
  };
  ctx.slots.inject(name,decorate);
  const off=ctx.on('slots/changed',slot=>{if(slot===name)decorate();});
  ctx.effect(()=>()=>{off();for(const release of Array.from(registrations.values()).reverse())release();registrations.clear();});
}
