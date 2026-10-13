import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const project=resolve(new URL('..',import.meta.url).pathname),artifacts=join(project,'test-results'),assets=join(project,'assets');
await mkdir(artifacts,{recursive:true});await mkdir(assets,{recursive:true});
const media={'/sample.wav':{type:'audio/wav',bytes:await readFile(join(assets,'sample.wav'))},'/sample.mp4':{type:'video/mp4',bytes:await readFile(join(assets,'sample.mp4'))}};
let requests=0,mockURL;
const responseText=()=>`### 表格\n\n| 功能 | 当前状态 | 操作 |\n| --- | --- | --- |\n| 表格 | 已支持 | [复制、展开](https://example.com/table) |\n| Mermaid | 已支持 | 放大、下载 |\n| 音视频 | 已支持 | 播放、进度控制 |\n\n### 流程图\n\n\`\`\`mermaid\nflowchart LR\n A[Markdown 回复] --> B{内容类型}\n B --> C[表格控件]\n B --> D[Mermaid 图表]\n B --> E[音视频播放器]\n\`\`\`\n\n### 音频\n\n![音频样例](${join(assets,'sample.wav')})\n\n### 视频\n\n![视频样例](${join(assets,'sample.mp4')})`;
const mock=createServer(async(req,res)=>{
  const file=media[req.url];
  if(file){
    const range=req.headers.range?.match(/bytes=(\d+)-(\d*)/),start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),file.bytes.length-1):file.bytes.length-1;
    res.writeHead(range?206:200,{'Content-Type':file.type,'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*','Content-Length':end-start+1,...range?{'Content-Range':`bytes ${start}-${end}/${file.bytes.length}`}:{}});res.end(file.bytes.subarray(start,end+1));return;
  }
  let body='';for await(const chunk of req)body+=chunk;const request=JSON.parse(body);requests++;
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  const send=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);
  send('message_start',{message:{id:'render_'+requests,type:'message',role:'assistant',content:[],model:request.model,stop_reason:null,stop_sequence:null,usage:{input_tokens:1,output_tokens:0}}});
  send('content_block_start',{index:0,content_block:{type:'text',text:''}});
  const text=requests===1?responseText():requests===2?'```mermaid\nflowchart LR\n A[broken -->\n```\n\n错误语法样例结束。':`![网络音频](${mockURL}/sample.wav)\n\n![网络视频](${mockURL}/sample.mp4)`;
  for(let i=0;i<text.length;i+=80){send('content_block_delta',{index:0,delta:{type:'text_delta',text:text.slice(i,i+80)}});await new Promise(r=>setTimeout(r,12));}
  send('content_block_stop',{index:0});send('message_delta',{delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:100}});send('message_stop',{});res.end();
});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));mockURL=`http://127.0.0.1:${mock.address().port}`;
const root=await mkdtemp(join(tmpdir(),'dcr-host-')),home=join(root,'home'),profile=join(home,'profiles/web'),workspace=join(root,'workspace');
await mkdir(join(profile,'node_modules/@deepseekharness-plugin'),{recursive:true});await mkdir(workspace);
await symlink(project,join(profile,'node_modules/@deepseekharness-plugin/dsh-codex-renderer'));
const annotations=resolve(project,'../dsh-codex-annotations'),withAnnotations=existsSync(join(annotations,'lib/client.js'));
if(withAnnotations)await symlink(annotations,join(profile,'node_modules/@deepseekharness-plugin/dsh-codex-annotations'));
await writeFile(join(profile,'package.json'),JSON.stringify({name:'renderer-fixture',private:true,dependencies:{'@deepseekharness-plugin/dsh-codex-renderer':`link:${project}`,...withAnnotations?{'@deepseekharness-plugin/dsh-codex-annotations':`link:${annotations}`}:{ }},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}}));
await writeFile(join(profile,'cordis.yml'),'[]');await writeFile(join(profile,'cordis.patch.yml'),JSON.stringify([{id:'ui-settings-general',config:{welcomeNoticeVersion:'2026-09-28.1'}},{id:'session-title-llm',disabled:true},{id:'llm-pi-ai',config:{providers:{'renderer-fixture':{displayName:'渲染测试',api:'anthropic-messages',baseURL:mockURL,apiKeyEnv:'DCR_FIXTURE_KEY',models:[{id:'render-demo',name:'渲染测试'}]}}}}]));
let browser,page,log='';const errors=[],checks=[],clientLogs=[];
const child=spawn('/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh',['--profile','web','--host','127.0.0.1','--port','0','--no-open'],{cwd:workspace,env:{...process.env,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1',DCR_FIXTURE_KEY:'synthetic-local-fixture'}});
child.stdout.on('data',x=>{log+=x});child.stderr.on('data',x=>{log+=x});
const check=name=>{checks.push(name);console.log('PASS',name);};
try{
  let url;for(let i=0;i<160;i++){url=log.match(/dsh web: (http:\/\/\S+)/)?.[1];if(url)break;if(child.exitCode!==null)throw Error(log);await new Promise(r=>setTimeout(r,250));}if(!url)throw Error('DSH 启动超时');
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1200,height:900},deviceScaleFactor:2,locale:'zh-CN',permissions:['clipboard-read','clipboard-write']});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(['error','warning'].includes(message.type()))clientLogs.push(message.text());});page.setDefaultTimeout(18000);
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('[contenteditable=true]').waitFor();
  if(await page.getByRole('button',{name:'继续',exact:true}).count())await page.getByRole('button',{name:'继续',exact:true}).click();
  const toggle=async(name,desired)=>{
    await page.getByRole('button',{name:'插件',exact:true}).click();
    const pkg=`@deepseekharness-plugin/${name}`,control=page.locator(`[data-plugin-package="${pkg}"]`).getByRole('switch');
    // DSH persists plugin changes asynchronously. Wait for its busy switch,
    // rather than treating style removal as completion of that write.
    await page.waitForFunction(pkg=>{const button=document.querySelector(`[data-plugin-package="${pkg}"] [role="switch"]`);return button&&!button.disabled;},pkg);
    const enabled=desired??!await control.isChecked();
    if(await control.isChecked()!==enabled)await control.click();
    await page.waitForFunction(({pkg,enabled})=>{const card=document.querySelector(`[data-plugin-package="${pkg}"]`),button=card?.querySelector('[role="switch"]');return button&&!button.disabled&&button.getAttribute('aria-checked')===String(enabled)&&card.dataset.pluginStatus===(enabled?'running':'disabled');},{pkg,enabled});
    if(name==='dsh-codex-renderer')await page.waitForFunction(enabled=>!!document.querySelector('style[data-plugin="@deepseekharness-plugin/dsh-codex-renderer"]')===enabled,enabled);
  };
  await toggle('dsh-codex-renderer');
  await page.getByText('新会话',{exact:true}).first().click();
  await page.getByRole('button',{name:/^选择模型/}).click();await page.getByText('模型',{exact:true}).click();await page.getByRole('menuitemradio',{name:'渲染测试',exact:true}).click();
  const send=async text=>{await page.locator('[contenteditable=true]').fill(text);await page.getByRole('button',{name:'发送消息',exact:true}).click();};
  await send('展示三个增强组件');
  await page.locator('.dcr-diagram svg').waitFor();await page.locator('.dcr-audio').waitFor();await page.locator('.dcr-video').waitFor();
  assert.equal(await page.locator('.dcr-table-tools').count(),1);assert.equal(await page.locator('.dcr-mermaid').count(),1);assert.equal(await page.locator('.dcr-media').count(),2);check('流式输出后每个控件只挂载一次');
  const table=page.locator('.dcr-table-owner');await table.hover();await table.screenshot({path:join(assets,'table.png')});
  const headerPlacement=await table.evaluate(owner=>{
    const header=owner.querySelector('thead').getBoundingClientRect(),tools=owner.querySelector('.dcr-table-tools').getBoundingClientRect();
    return{headerCenter:header.y+header.height/2,toolsCenter:tools.y+tools.height/2,paddingTop:getComputedStyle(owner).paddingTop};
  });
  assert.ok(Math.abs(headerPlacement.headerCenter-headerPlacement.toolsCenter)<1,'操作按钮与表头同行');
  assert.equal(headerPlacement.paddingTop,'0px','不为操作栏增加顶部留白');check('表格操作按钮位于表头右侧且没有额外留白');
  await page.getByRole('button',{name:'复制表格',exact:true}).click();await page.getByRole('button',{name:'已复制',exact:true}).waitFor();
  const clip=await page.evaluate(async()=>({text:await navigator.clipboard.readText(),types:(await navigator.clipboard.read()).flatMap(x=>x.types)}));
  assert.match(clip.text,/功能\t当前状态\t操作/);assert.ok(clip.types.includes('text/html'));check('表格复制含 TSV 文本和 HTML 表格');
  const linkStyle=el=>{const style=getComputedStyle(el);return{color:style.color,fontFamily:style.fontFamily,fontSize:style.fontSize,textDecoration:style.textDecorationLine};};
  const inlineLinkStyle=await table.getByText('复制、展开',{exact:true}).evaluate(linkStyle);
  await page.getByRole('button',{name:'展开表格',exact:true}).click();await page.getByRole('dialog',{name:'表格预览',exact:true}).waitFor();
  assert.deepEqual(await page.locator('.dcr-dialog').getByText('复制、展开',{exact:true}).evaluate(linkStyle),inlineLinkStyle,'预览保留 DSH 原生链接和字号');
  assert.ok((await page.locator('.dcr-dialog').boundingBox()).width<800,'短表格预览按内容取宽');
  await page.locator('.dcr-dialog').evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished)));
  await page.locator('.dcr-dialog').screenshot({path:join(assets,'table-expanded.png')});
  await page.keyboard.press('Escape');await page.locator('.dcr-closing').waitFor();await page.locator('.dcr-dialog').waitFor({state:'detached'});check('表格展开及关闭动画');
  const diagram=page.locator('.dcr-mermaid');await page.setViewportSize({width:1200,height:1400});await diagram.scrollIntoViewIfNeeded();await diagram.screenshot({path:join(assets,'mermaid.png')});await page.setViewportSize({width:1200,height:900});
  await page.getByRole('button',{name:'复制 Mermaid 源码',exact:true}).click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/^flowchart LR/);
  await page.getByRole('button',{name:'显示源码',exact:true}).click();assert.match(await diagram.locator('pre').innerText(),/Markdown 回复/);await page.getByRole('button',{name:'显示源码',exact:true}).click();
  const saved=page.waitForEvent('download');await page.getByRole('button',{name:'下载 SVG',exact:true}).click();assert.equal((await saved).suggestedFilename(),'diagram.svg');
  await page.getByRole('button',{name:'展开图表',exact:true}).click();await page.getByRole('button',{name:'放大图表',exact:true}).click();assert.equal(await page.locator('.dcr-zoom').innerText(),'125%');await page.keyboard.press('Escape');await page.locator('.dcr-dialog').waitFor({state:'detached'});check('Mermaid 渲染、源码、复制、下载和缩放');
  await page.waitForFunction(()=>document.querySelector('.dcr-audio audio')?.duration>0&&document.querySelector('.dcr-video video')?.duration>0);
  assert.match(await page.locator('audio').getAttribute('src'),/^blob:/);assert.match(await page.locator('video').getAttribute('src'),/^blob:/);
  await page.setViewportSize({width:1200,height:2000});await page.mouse.move(0,0);await page.locator('.dcr-audio').screenshot({path:join(assets,'audio.png')});await page.locator('.dcr-video').screenshot({path:join(assets,'video.png')});await page.setViewportSize({width:1200,height:900});
  await page.getByRole('button',{name:'播放音频',exact:true}).click();await page.getByRole('button',{name:'暂停音频',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('audio').currentTime>.15);
  assert.equal(await page.locator('audio').evaluate(el=>el.seekable.end(0)),10,'本地音频完整可定位');
  await page.getByRole('slider',{name:'音频进度',exact:true}).fill('5');
  await page.waitForFunction(()=>document.querySelector('audio').currentTime>=5&&document.querySelector('audio').currentTime<6,null,{timeout:1500});
  await page.getByRole('button',{name:'暂停音频',exact:true}).click();
  assert.equal(await page.locator('video').evaluate(el=>el.controls),false,'视频使用自定义操作条');
  await page.getByRole('button',{name:'播放视频',exact:true}).click();await page.waitForFunction(()=>document.querySelector('video').currentTime>.15);
  await page.getByRole('slider',{name:'视频进度',exact:true}).fill('5');await page.waitForFunction(()=>document.querySelector('video').currentTime>=5&&document.querySelector('video').currentTime<6,null,{timeout:1500});
  await page.getByRole('button',{name:'暂停视频',exact:true}).click();check('本地音频、视频通过自定义播放与进度控件定位成功');
  await page.getByRole('button',{name:'视频选项',exact:true}).click();await page.getByRole('menuitemradio',{name:'1.5×',exact:true}).click();assert.equal(await page.locator('video').evaluate(el=>el.playbackRate),1.5);await page.locator('.dcr-menu').waitFor({state:'detached'});
  await page.getByRole('button',{name:'视频音量',exact:true}).click();await page.getByRole('slider',{name:'视频音量大小',exact:true}).fill('0.3');assert.equal(await page.locator('video').evaluate(el=>el.volume),.3);await page.getByRole('button',{name:'静音视频',exact:true}).click();assert.equal(await page.locator('video').evaluate(el=>el.muted),true);await page.keyboard.press('Escape');await page.locator('.dcr-menu-closing').waitFor();await page.locator('.dcr-menu').waitFor({state:'detached'});check('音视频选项菜单淡出关闭并归还焦点');
  await page.getByRole('button',{name:'全屏播放',exact:true}).click();await page.waitForFunction(()=>document.fullscreenElement?.classList.contains('dcr-video'));
  await page.getByRole('button',{name:'视频选项',exact:true}).click();assert.equal(await page.locator('.dcr-video .dcr-menu').count(),1,'全屏时选项在全屏元素内显示');await page.keyboard.press('Escape');await page.locator('.dcr-menu').waitFor({state:'detached'});await page.getByRole('button',{name:'退出全屏',exact:true}).click();await page.waitForFunction(()=>!document.fullscreenElement);check('自定义视频倍速、音量、静音与全屏菜单');
  const settings=async()=>{await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'通用设置',exact:true}).click();};
  await settings();
  const nativeSwitch=page.getByRole('switch',{name:'显示代码工作视图',exact:true}),rendererSwitch=page.getByRole('switch',{name:'表格控件',exact:true});
  assert.equal(await rendererSwitch.getAttribute('class'),await nativeSwitch.getAttribute('class'),'使用与 DSH 设置相同的原生 Switch');
  const rowGeometry=el=>{const style=getComputedStyle(el.parentElement);return{padding:style.padding,gap:style.gap,border:style.borderBottomWidth};};
  assert.deepEqual(await rendererSwitch.evaluate(rowGeometry),await nativeSwitch.evaluate(rowGeometry),'设置行匹配 DSH 原生间距和分隔线');
  assert.equal(await page.locator('.dcr-settings h3,.dcr-switch').count(),0);
  check('设置使用原生开关与默认行布局');
  const lightFill=await diagram.locator('text').first().evaluate(el=>getComputedStyle(el).fill);
  await page.getByRole('button',{name:'深色',exact:true}).click();
  await page.waitForFunction(light=>{const text=document.querySelector('.dcr-diagram text');return text&&getComputedStyle(text).fill!==light;},lightFill);
  await page.getByRole('button',{name:'浅色',exact:true}).click();
  await page.waitForFunction(light=>{const text=document.querySelector('.dcr-diagram text');return text&&getComputedStyle(text).fill===light;},lightFill);
  check('图表颜色跟随 DSH 外观切换');
  const settingsRows=page.locator('.dcr-settings');await settingsRows.last().scrollIntoViewIfNeeded();
  const boxes=await settingsRows.evaluateAll(rows=>rows.map(row=>{const r=row.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));
  await page.screenshot({path:join(assets,'settings.png'),clip:{x:boxes[0].x,y:boxes[0].y,width:boxes[0].width,height:boxes.at(-1).y+boxes.at(-1).height-boxes[0].y}});
  for(const label of ['表格控件','Mermaid 图表','音视频播放器'])await page.getByRole('switch',{name:label,exact:true}).click();await page.getByRole('button',{name:'关闭',exact:true}).click();
  assert.equal(await page.locator('.dcr-table-tools,.dcr-mermaid,.dcr-media').count(),0);assert.equal(await page.locator('.dcr-native-hidden').count(),0);assert.match(await page.locator('.md-code-block').innerText(),/flowchart LR/);check('关闭三项开关后恢复 DSH 原始渲染');
  await settings();for(const label of ['表格控件','Mermaid 图表','音视频播放器'])await page.getByRole('switch',{name:label,exact:true}).click();await page.getByRole('button',{name:'关闭',exact:true}).click();await page.locator('.dcr-diagram svg').waitFor();
  if(withAnnotations){await toggle('dsh-codex-annotations');await page.getByText('展示三个增强组件',{exact:true}).first().click();await page.locator('.dcr-diagram svg').waitFor();assert.equal(await page.locator('.dcr-table-tools').count(),1);assert.equal(await page.locator('.dcr-media').count(),2);
  assert.equal(await page.locator('.dca-source').count(),1,'回复只挂载一层批注组件');
  await page.locator('[data-dca-content]').evaluate(el=>{
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode()))if(node.textContent==='表格'){
      const range=document.createRange();range.selectNodeContents(node);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      node.parentElement.scrollIntoView({block:'center',behavior:'instant'});
      el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));return;
    }
    throw Error('找不到批注测试选区');
  });
  await page.getByRole('button',{name:'添加到对话',exact:true}).click();
  await page.getByRole('textbox',{name:'批注 1 的可选评论',exact:true}).fill('渲染与批注兼容测试');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.getByRole('button',{name:'1 条注释',exact:true}).waitFor();
  assert.equal(await page.locator('[data-dca-marker]').count(),1);
  await page.locator('.dca-dock .dca-batch-chip').hover();
  await page.getByRole('button',{name:'删除全部待发送批注',exact:true}).click();
  check('与批注同时启用：单层包装、选区菜单、保存批注及引用附件正常');
  await page.reload();await page.locator('.dcr-diagram svg').waitFor();
  assert.equal(await page.locator('.dca-source').count(),1);assert.equal(await page.locator('.dcr-source').count(),1);check('两个插件启用后刷新成功并保留单层包装');
  await toggle('dsh-codex-annotations');await page.getByText('展示三个增强组件',{exact:true}).first().click();await page.locator('.dcr-diagram svg').waitFor();assert.equal(await page.locator('.dcr-table-tools').count(),1);check('停用批注插件后渲染继续正常');}
  await toggle('dsh-codex-renderer');await page.getByText('展示三个增强组件',{exact:true}).first().click();assert.equal(await page.locator('[data-dcr-ui],.dcr-native-hidden,.dcr-table-owner').count(),0);assert.equal(await page.locator('style[data-plugin="@deepseekharness-plugin/dsh-codex-renderer"]').count(),0);check('停用插件完整清理 DOM 与自有样式');
  await toggle('dsh-codex-renderer');await page.getByText('展示三个增强组件',{exact:true}).first().click();await page.locator('.dcr-diagram svg').waitFor();assert.equal(await page.locator('.dcr-table-tools').count(),1);
  for(let cycle=0;cycle<3;cycle++){await toggle('dsh-codex-renderer',false);await toggle('dsh-codex-renderer',true);await page.getByText('展示三个增强组件',{exact:true}).first().click();await page.locator('.dcr-diagram svg').waitFor();assert.equal(await page.locator('.dcr-source').count(),1);assert.equal(await page.locator('.dcr-table-tools').count(),1);}check('连续三次启停无重复控件或遗漏');
  await send('错误语法样例');await page.getByText('图表无法渲染，请检查 Mermaid 语法。',{exact:true}).waitFor();assert.equal(await page.locator('.dcr-mermaid').count(),2);check('无效 Mermaid 显示源码与错误状态');
  await send('网络音视频样例');await page.locator('.dcr-audio').nth(1).waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('audio').length===2&&Array.from(document.querySelectorAll('audio,video')).every(el=>el.duration>0));
  const remoteAudio=page.locator('.dcr-audio').last(),remoteVideo=page.locator('.dcr-video').last();
  assert.equal(await remoteAudio.locator('audio').getAttribute('src'),mockURL+'/sample.wav');assert.equal(await remoteVideo.locator('video').getAttribute('src'),mockURL+'/sample.mp4');
  await remoteAudio.getByRole('button',{name:'播放音频',exact:true}).click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('audio')).at(-1).currentTime>.15);await remoteAudio.getByRole('button',{name:'暂停音频',exact:true}).click();
  await remoteVideo.locator('video').evaluate(async el=>{await el.play();});await page.waitForFunction(()=>Array.from(document.querySelectorAll('video')).at(-1).currentTime>.15);await remoteVideo.locator('video').evaluate(el=>el.pause());check('HTTP 音视频保留原始地址并正常播放');
  assert.deepEqual(errors,[]);check('真实 DSH 宿主无页面异常');
  await writeFile(join(artifacts,'verification.json'),JSON.stringify({checks,errors},null,2));console.log('RENDERER_HOST_OK',checks.length);
}catch(e){if(page){await page.screenshot({path:join(artifacts,'failure.png')});console.log((await page.locator('body').innerText()).slice(-4000));console.log(await page.evaluate(()=>({style:!!document.querySelector('style[data-plugin="@deepseekharness-plugin/dsh-codex-renderer"]'),sources:document.querySelectorAll('.dcr-source').length,settings:localStorage.getItem('dsh-codex-renderer.ui.v1')})));}console.log(log.slice(-2200));console.log(errors);console.log(clientLogs.slice(-8));throw e;}
finally{await browser?.close();child.kill();mock.close();}
