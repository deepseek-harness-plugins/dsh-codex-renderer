import React,{useEffect,useLayoutEffect,useRef,useState,useId} from 'react';
import {createPortal} from 'react-dom';

export function Icon({name,size=20}) {
  if(name==='audio')return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{[[3,9.18,6,'#7da2ff'],[7,3.18,18,'#6d91f5'],[11,7.18,10,'#5d7fec'],[15,5.18,14,'#4c6ee2'],[19,9.18,6,'#3c5cd8']].map(([x,y,height,fill])=><rect key={x} x={x} y={y} width="2" height={height} rx="1" fill={fill}/>)}</svg>;
  const paths={
    copy:<><rect x="3.5" y="6.5" width="10" height="11" rx="2.5"/><path d="M7 3h7a3 3 0 0 1 3 3v7"/></>,
    expand:<path d="M12 3.5h4.5V8M16.5 3.5l-5 5M8 16.5H3.5V12M3.5 16.5l5-5"/>,
    close:<path d="m5 5 10 10M15 5 5 15"/>,
    check:<path d="m4 10 4 4 8-9"/>,
    download:<path d="M10 3v9m-4-4 4 4 4-4M4 13v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3"/>,
    code:<path d="m6.5 5-5 5 5 5m7-10 5 5-5 5M11.5 3l-3 14"/>,
    play:<path d="M6 5.4c0-1 1.1-1.6 1.9-1.1l7.4 4.7c.8.5.8 1.6 0 2.1l-7.4 4.7c-.8.5-1.9-.1-1.9-1.1Z" fill="currentColor" stroke="none"/>,
    playOutline:<path d="M5 4.6c0-1 1.1-1.6 1.9-1.1l9.1 5.6c.9.5.9 1.8 0 2.3l-9.1 5.3C6.1 17.2 5 16.6 5 15.6Z"/>,
    collapse:<path d="M3.5 8H8V3.5M8 8l-5-5M16.5 12H12v4.5M12 12l5 5"/>,
    pause:<path d="M6 4h3v12H6zM12 4h3v12h-3z" fill="currentColor" stroke="none"/>,
    plus:<path d="M4 10h12M10 4v12"/>,
    minus:<path d="M4 10h12"/>,
    external:<path d="M10 3h7v7m0-7-9 9M8 4H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4"/>,
    more:<g fill="currentColor" stroke="none"><circle cx="4" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/></g>,
    volume:<><path d="M9 3.6c.7-.5 1.8 0 1.8 1v10.8c0 1-1.1 1.5-1.8 1l-4-2.9H3.3c-.9 0-1.6-.7-1.6-1.6V7.1c0-.9.7-1.6 1.6-1.6H5ZM13.8 6.5a5.5 5.5 0 0 1 0 7M16.7 5.4a7.7 7.7 0 0 1 0 9.2"/></>,
    mute:<><path d="M10.8 8V4.6c0-1-1.1-1.5-1.8-1L6.8 5.2M4.6 5.5H3.3c-.9 0-1.6.7-1.6 1.6v4.8c0 .9.7 1.6 1.6 1.6H5l4 2.9c.7.5 1.8 0 1.8-1v-3M13.8 6.5a5.5 5.5 0 0 1 1.2 5M16.7 5.4a7.7 7.7 0 0 1 .8 8M2 2l16 16"/></>,
    pip:<><rect x="2" y="4" width="16" height="12" rx="2"/><rect x="10" y="10" width="6" height="4" rx=".5" fill="currentColor" stroke="none"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function Action({label,icon,onClick,disabled=false,pressed,variant='toolbar',tooltip=true,buttonRef,children,...props}) {
  const local=useRef(),timer=useRef(),id=useId(),[tip,setTip]=useState(null),ref=buttonRef??local;
  const hide=()=>{clearTimeout(timer.current);setTip(null);};
  const show=()=>{clearTimeout(timer.current);if(disabled||!tooltip)return;timer.current=setTimeout(()=>{
    const box=ref.current.getBoundingClientRect();setTip({left:box.left+box.width/2,top:box.top,bottom:box.bottom});
  },200);};
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(()=>{if(!tip)return;window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);return()=>{window.removeEventListener('scroll',hide,true);window.removeEventListener('resize',hide);};},[tip]);
  const edge=tip&&tip.top<46,portal=ref.current?.closest('dialog')??document.fullscreenElement??document.body;
  return <><button type="button" ref={ref} className={`dcr-control dcr-control-${variant}`} aria-label={label} aria-describedby={tip?id:undefined} aria-pressed={pressed} disabled={disabled} onPointerEnter={show} onPointerLeave={hide} onFocus={event=>{if(event.currentTarget.matches(':focus-visible'))show();}} onBlur={hide} onPointerDown={hide} onClick={event=>{hide();onClick?.(event);}} {...props}>{children??<Icon name={icon} size={variant==='toolbar'?16:20}/>}</button>
    {tip&&createPortal(<div data-dcr-ui="" id={id} role="tooltip" className={`dcr-tooltip${edge?' dcr-tooltip-below':''}`} style={{left:Math.max(100,Math.min(innerWidth-100,tip.left)),top:edge?tip.bottom+2:tip.top-2}}>{label}</div>,portal)}</>;
}

export function Menu({label,items,variant='toolbar',icon='more',children,kind='options',side='bottom'}) {
  const trigger=useRef(),panel=useRef(),timer=useRef(),[position,setPosition]=useState(null),[closing,setClosing]=useState(false),id=useId();
  const close=(restore=true)=>{if(closing)return;setClosing(true);if(restore)trigger.current?.focus({preventScroll:true});timer.current=setTimeout(()=>{setPosition(null);setClosing(false);},matchMedia('(prefers-reduced-motion: reduce)').matches?0:100);};
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const locate=()=>{const r=trigger.current.getBoundingClientRect(),box=panel.current?.getBoundingClientRect(),width=box?.width??0,height=box?.height??0,gap=kind==='volume'?4:2,above=side==='top'?r.top-height-gap>=8:r.bottom+height+gap>innerHeight&&r.top-height>8;setPosition({left:Math.max(8,Math.min(innerWidth-width-8,r.right-width-(children?0:1))),top:r.bottom+gap,bottom:innerHeight-r.top+gap,above});};
  useLayoutEffect(()=>{if(!position)return;locate();panel.current.querySelector('button,input')?.focus({preventScroll:true});},[!!position]);
  useEffect(()=>{
    if(!position)return;
    const outside=e=>{if(!trigger.current.contains(e.target)&&!panel.current.contains(e.target))close(false);};
    window.addEventListener('pointerdown',outside,true);window.addEventListener('focusin',outside,true);window.addEventListener('resize',locate);window.addEventListener('scroll',locate,true);
    return()=>{window.removeEventListener('pointerdown',outside,true);window.removeEventListener('focusin',outside,true);window.removeEventListener('resize',locate);window.removeEventListener('scroll',locate,true);};
  },[!!position,closing]);
  const keyboard=event=>{
    if(event.key==='Escape'){event.stopPropagation();event.preventDefault();close();return;}
    if(event.key==='Tab'){if(!children)close(false);return;}
    if(event.target.tagName==='INPUT')return;
    const buttons=Array.from(panel.current.querySelectorAll('button:not(:disabled)')),index=buttons.indexOf(document.activeElement);
    const next={ArrowDown:(index+1)%buttons.length,ArrowUp:(index-1+buttons.length)%buttons.length,Home:0,End:buttons.length-1}[event.key];
    if(next!==undefined){event.preventDefault();buttons[next]?.focus();}
  };
  return <><Action label={label} icon={icon} variant={variant} tooltip={kind!=='audio'} buttonRef={trigger} aria-haspopup={children?'dialog':'menu'} aria-expanded={!!position&&!closing} aria-controls={position?id:undefined} onClick={()=>position?close():locate()}/>
    {position&&createPortal(<div data-dcr-ui="" id={id} ref={panel} role={children?'dialog':'menu'} aria-label={label} inert={closing} className={`dcr-menu dcr-menu-${kind}${closing?' dcr-menu-closing':''}`} style={{left:position.left,...position.above?{bottom:position.bottom}:{top:position.top}}} onKeyDown={keyboard}>
      {children}{items?.map((item,index)=>item.separator?<hr key={index}/>:item.heading?<div className="dcr-menu-label" key={index}>{item.heading}</div>:<button key={item.label} type="button" role={item.checked===undefined?'menuitem':'menuitemradio'} aria-checked={item.checked} disabled={item.disabled} onClick={()=>{item.onSelect();close();}}>{item.icon&&<Icon name={item.icon} size={16}/>}<span>{item.label}</span>{item.checked!==undefined&&<span className="dcr-menu-check">{item.checked&&<Icon name="check" size={17}/>}</span>}</button>)}
    </div>,trigger.current?.closest('dialog')??document.fullscreenElement??document.body)}</>;
}
