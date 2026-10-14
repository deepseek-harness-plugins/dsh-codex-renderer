import mermaid from 'mermaid';
import elkLayouts from '@mermaid-js/layout-elk';

// Keep the public ELK loader contract; never rewrite the user's Mermaid source.
const elk=elkLayouts.find(layout=>layout.name==='elk');
mermaid.registerLayoutLoaders([{...elk,name:'dcr-flowchart',loader:async()=>{
  const renderer=await elk.loader();
  return {render(data,svg,helpers,options){
    for(const node of /^flowchart/.test(data.type)?data.nodes:[]){
      if(node.isGroup)continue;
      if(['diamond','diam','decision','question'].includes(node.shape)){
        node.shape='rect';node.cssClasses=`${node.cssClasses??''} dcr-decision`;
      }
      if(['rect','squareRect','proc','process','rectangle','rounded','roundedRect'].includes(node.shape)){
        node.shape='rect';node.padding=16;node.labelPaddingX=36;node.height=Math.max(node.height??0,60);node.spreadPorts=true;
      }
    }
    return renderer.render(data,svg,helpers,{...options,rootLayoutOptions:{...options?.rootLayoutOptions,'elk.spacing.portPort':15}});
  }};
}}]);

export function graphTheme({dark,fontFamily}){
  const fill=dark?'#00284d':'#e5f3ff',text=dark?'#85c6ff':'#005b9e',line=dark?'#6f747a':'#8f9195',border=dark?'rgba(255,255,255,.1)':'rgba(0,0,0,.1)',decision=dark?'#000e1a':'#f5faff',decisionBorder=dark?'#1a3e5f':'#cedbe5';
  return {startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,htmlLabels:false,theme:'base',look:'classic',fontFamily,darkMode:dark,
    themeVariables:{fontFamily,fontSize:'14px',primaryColor:fill,primaryTextColor:text,primaryBorderColor:border,lineColor:line,mainBkg:fill,nodeBorder:border,clusterBkg:decision,clusterBorder:decisionBorder,edgeLabelBackground:decision},
    themeCSS:`.node text,.node tspan{font-weight:600!important;line-height:21px}.node rect{rx:16px;ry:16px}.node .label-container{filter:none!important}.node.dcr-decision .label-container{fill:${decision};stroke:${decisionBorder};stroke-dasharray:2 2}.edgePaths .flowchart-link{stroke-width:1px;stroke-linecap:round;stroke-linejoin:round}.marker{fill:none;stroke:${line};stroke-width:1px}`,
    layout:'dcr-flowchart',elk:{preset:'legacy'},flowchart:{htmlLabels:false,useMaxWidth:false,curve:'linear',nodeSpacing:40,rankSpacing:40,minNodeWidth:0},sequence:{useMaxWidth:false}};
}

function roundEdges(svg,dark){
  const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;
  for(const marker of root.querySelectorAll('marker[id$="pointEnd"],marker[id$="pointStart"]')){
    marker.setAttribute('markerWidth','10');marker.setAttribute('markerHeight','10');marker.setAttribute('viewBox','0 0 10 10');marker.setAttribute('refX','5');marker.setAttribute('refY','5');marker.setAttribute('overflow','visible');
    const path=marker.querySelector('path');if(path){path.setAttribute('d',marker.id.endsWith('pointStart')?'M 9 1 L 5 5 L 9 9':'M 1 1 L 5 5 L 1 9');path.style.fill='none';path.style.stroke=dark?'#6f747a':'#8f9195';}
  }
  for(const path of root.querySelectorAll('.flowchart-link')){
    const d=path.getAttribute('d');if(!/^M[\d\s.,e+\-LQ]+$/i.test(d))continue;
    // Mermaid records the original orthogonal route before rounding. Rebuild
    // that route with a small arrow gap, including multi-segment branches.
    const encoded=path.getAttribute('data-points');if(!encoded)continue;
    const points=JSON.parse(atob(encoded));if(points.length<2)continue;
    for(const [at,neighbor,marker] of [[0,1,'marker-start'],[points.length-1,points.length-2,'marker-end']]){
      if(!path.getAttribute(marker)?.includes('point'))continue;
      const a=points[at],b=points[neighbor],distance=Math.hypot(b.x-a.x,b.y-a.y),gap=Math.min(12,Math.max(0,distance/2-4));
      if(distance){a.x+=(b.x-a.x)*gap/distance;a.y+=(b.y-a.y)*gap/distance;}
    }
    let rounded=`M${points[0].x},${points[0].y}`;
    for(let i=1;i<points.length-1;i++){
      const a=points[i-1],b=points[i],c=points[i+1],before=Math.hypot(b.x-a.x,b.y-a.y),after=Math.hypot(c.x-b.x,c.y-b.y),r=Math.min(10*Math.SQRT1_2,before/2,after/2);
      if(!r||Math.abs((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))<.01){rounded+=`L${b.x},${b.y}`;continue;}
      rounded+=`L${b.x-(b.x-a.x)*r/before},${b.y-(b.y-a.y)*r/before}Q${b.x},${b.y} ${b.x+(c.x-b.x)*r/after},${b.y+(c.y-b.y)*r/after}`;
    }
    const end=points.at(-1);path.setAttribute('d',`${rounded}L${end.x},${end.y}`);
  }
  return new XMLSerializer().serializeToString(root);
}

// Mermaid's configuration is global. Serialize initialization and rendering so
// simultaneous cards/theme updates cannot paint with another card's palette.
let pending=Promise.resolve();
export function renderDiagram(code,palette,holder){
  const task=pending.then(async()=>{
    if(!holder.isConnected)throw Error('Diagram removed');
    mermaid.initialize(graphTheme(palette));
    const result=await mermaid.render(`dcr-${crypto.randomUUID()}`,code,holder);
    return roundEdges(result.svg,palette.dark);
  });
  pending=task.catch(()=>{});return task;
}
