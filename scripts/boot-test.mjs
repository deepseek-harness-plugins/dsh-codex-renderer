import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

const project=resolve(new URL('..',import.meta.url).pathname);
const results=[];
const plugins=[['codex-renderer','dsh-codex-renderer',project],['dsh-codex-annotations','dsh-codex-annotations',resolve(project,'../dsh-codex-annotations')]];
if(!existsSync(join(plugins[1][2],'lib/client.js'))){console.log('SKIP 冷启动兼容测试：相邻目录没有已构建的批注插件');process.exit(0);}
const mock=createServer(async(req,res)=>{
  for await(const chunk of req){}
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  const send=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);
  send('message_start',{message:{id:'boot-demo',type:'message',role:'assistant',content:[],model:'boot-demo',stop_reason:null,stop_sequence:null,usage:{input_tokens:1,output_tokens:0}}});
  send('content_block_start',{index:0,content_block:{type:'thinking',thinking:''}});
  send('content_block_delta',{index:0,delta:{type:'thinking_delta',thinking:'展开思考正文验证原生子插槽。'}});
  send('content_block_delta',{index:0,delta:{type:'signature_delta',signature:'local-fixture'}});
  send('content_block_stop',{index:0});
  send('content_block_start',{index:1,content_block:{type:'text',text:''}});
  send('content_block_delta',{index:1,delta:{type:'text_delta',text:'| 功能 | 状态 |\n| --- | --- |\n| 表格 | 正常 |'}});
  send('content_block_stop',{index:1});send('message_delta',{delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:10}});send('message_stop',{});res.end();
});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));const mockURL=`http://127.0.0.1:${mock.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const order of [plugins,[...plugins].reverse()]){
    const root=await mkdtemp(join(tmpdir(),'dcr-boot-')),home=join(root,'home'),profile=join(home,'profiles/web'),workspace=join(root,'workspace');
    await mkdir(workspace);
    await mkdir(join(profile,'node_modules/@deepseekharness-plugin'),{recursive:true});
    for(const [,pkg,path] of order)await symlink(path,join(profile,'node_modules/@deepseekharness-plugin',pkg));
    await writeFile(join(profile,'package.json'),JSON.stringify({name:'renderer-boot-fixture',private:true,dependencies:Object.fromEntries(order.map(([,pkg,path])=>[`@deepseekharness-plugin/${pkg}`,`link:${path}`])),dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app',...order.map(([,pkg])=>`@deepseekharness-plugin/${pkg}`)]}}}));
    await writeFile(join(profile,'cordis.yml'),'[]');
    await writeFile(join(profile,'cordis.patch.yml'),JSON.stringify([{id:'ui-settings-general',config:{welcomeNoticeVersion:'2026-09-28.1'}},{id:'session-title-llm',disabled:true},{id:'llm-pi-ai',config:{providers:{'boot-fixture':{displayName:'启动测试',api:'anthropic-messages',baseURL:mockURL,apiKeyEnv:'DCR_FIXTURE_KEY',models:[{id:'boot-demo',name:'启动测试'}]}}}}]));
    let log='';const messages=[];
    const child=spawn('/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh',['--profile','web','--host','127.0.0.1','--port','0','--no-open'],{cwd:workspace,env:{...process.env,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1',DCR_FIXTURE_KEY:'synthetic-local-fixture'}});
    child.stdout.on('data',x=>{log+=x});child.stderr.on('data',x=>{log+=x});
    const page=await browser.newPage();page.on('console',msg=>{if(['error','warning'].includes(msg.type()))messages.push(msg.text())});page.on('pageerror',e=>messages.push(e.message));page.setDefaultTimeout(18000);
    try{
      let url;for(let i=0;i<160;i++){url=log.match(/dsh web: (http:\/\/\S+)/)?.[1];if(url)break;if(child.exitCode!==null)throw Error(log);await new Promise(r=>setTimeout(r,250));}assert.ok(url,'DSH 启动成功');
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await page.locator('[contenteditable=true]').waitFor();
      await page.getByRole('button',{name:'插件',exact:true}).click();
      await page.locator('[data-plugin-package="@deepseekharness-plugin/dsh-codex-annotations"]').waitFor();
      const state=await page.locator('[data-plugin-package]').evaluateAll(cards=>cards.filter(card=>card.dataset.pluginPackage.includes('dsh-codex')).map(card=>({package:card.dataset.pluginPackage,status:card.dataset.pluginStatus,text:card.innerText})));
      console.log(JSON.stringify({order:order.map(x=>x[1]),state:state.map(({package:pkg,status})=>({package:pkg,status})),messages},null,2));
      assert.equal(await page.locator('style[data-plugin="@deepseekharness-plugin/dsh-codex-renderer"]').count(),1,'渲染插件客户端已激活');
      assert.equal(await page.locator('style[data-plugin="dsh-codex-annotations"]').count(),1,'批注插件客户端已激活');
      assert.equal(state.length,2);
      assert.ok(state.every(x=>x.status==='running'&&!/加载失败|激活失败/.test(x.text)),'两个客户端成功加载');
      await page.getByText('新会话',{exact:true}).first().click();
      await page.getByRole('button',{name:/^(?:请)?选择模型/}).click();if(await page.getByRole('menuitem',{name:/模型/}).count())await page.getByRole('menuitem',{name:/模型/}).click();await page.getByRole('menuitemradio',{name:'启动测试',exact:true}).click();
      await page.locator('[contenteditable=true]').fill('验证冷启动回复');await page.getByRole('button',{name:'发送消息',exact:true}).click();
      await page.locator('.dcr-table-tools').waitFor({state:'attached'});
      assert.equal(await page.locator('.dcr-source').count(),1,'冷启动的渲染组件实际生效');
      assert.equal(await page.locator('.dca-source').count(),1,'冷启动的批注组件实际生效且不嵌套');
      const assertReasoning=async()=>{
        const row=page.locator('[data-variant="think"]');
        if(!await row.isVisible()){
          const completed=page.getByRole('button',{name:/^已完成，用时/});
          if(await completed.getAttribute('aria-expanded')!=='true')await completed.click();
          await page.getByRole('button',{name:'已完成分析',exact:true}).click();
        }
        if(await row.getAttribute('data-expanded')===null)await row.getByRole('button').click();
        await row.getByText('展开思考正文验证原生子插槽。',{exact:true}).waitFor();
      };
      await assertReasoning();
      // Remove either layer while the other remains, then enable it again.
      // Each plugin must preserve the native child renderer and its neighbour.
      for(const [,pkg]of order){
        for(const enabled of [false,true]){
          await page.getByRole('button',{name:'插件',exact:true}).click();
          await page.locator(`[data-plugin-package="@deepseekharness-plugin/${pkg}"]`).getByRole('switch').click();
          await page.waitForFunction(({pkg,enabled})=>{
            const card=document.querySelector(`[data-plugin-package="@deepseekharness-plugin/${pkg}"]`);
            const control=card?.querySelector('[role="switch"]');
            return control&&!control.disabled&&card.dataset.pluginStatus===(enabled?'running':'disabled');
          },{pkg,enabled});
          await page.waitForFunction(({pkg,enabled})=>{
            const plugin=pkg==='dsh-codex-renderer'?'@deepseekharness-plugin/'+pkg:pkg;
            return !!document.querySelector(`style[data-plugin="${plugin}"]`)===enabled;
          },{pkg,enabled});
          await page.getByRole('treeitem').filter({hasText:'验证冷启动回复'}).click();
          await assertReasoning();
          assert.equal(await page.locator('.dca-source').count(),pkg==='dsh-codex-annotations'&&!enabled?0:1);
          assert.equal(await page.locator('.dcr-source').count(),pkg==='dsh-codex-renderer'&&!enabled?0:1);
          assert.equal(await page.locator('.dcr-table-tools').count(),pkg==='dsh-codex-renderer'&&!enabled?0:1);
        }
      }

      assert.deepEqual(messages.filter(text=>/already has an entry|did not activate|failed|Error:/.test(JSON.stringify(text))),[],'冷启动无客户端加载错误');
      results.push({order:order.map(x=>x[1]),statuses:state.map(({package:pkg,status})=>({package:pkg,status})),rendererInstances:1,annotationInstances:1,errors:messages});
    }catch(error){console.log(JSON.stringify({messages,body:await page.locator('body').innerText(),log:log.slice(-6000)},null,2));throw error;}
    finally{await page.close();child.kill();}
  }
  await mkdir(join(project,'test-results'),{recursive:true});
  await writeFile(join(project,'test-results/boot-verification.json'),JSON.stringify(results,null,2));
  console.log('RENDERER_COLD_BOOT_OK 2');
}finally{await browser.close();mock.close();}
