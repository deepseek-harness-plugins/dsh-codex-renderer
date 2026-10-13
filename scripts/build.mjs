import {build} from 'esbuild';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
await mkdir('lib',{recursive:true});
await build({entryPoints:['src/index.js'],bundle:true,outfile:'lib/index.js',format:'esm',platform:'node',target:'node22'});
const result=await build({entryPoints:['src/client.jsx'],bundle:true,write:false,outfile:'lib/client.js',format:'cjs',platform:'browser',target:'chrome130',external:['react','react-dom','@deepseek-ai/dsh-client-ui-primitives'],jsx:'transform',minify:true,legalComments:'linked',loader:{'.css':'text'},metafile:true});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')||f.path==='<stdout>').text;
await writeFile('lib/client.js',`window.__ModuleLoader__.load({id:"@deepseekharness-plugin/dsh-codex-renderer",factory:(require)=>{const module={exports:{}};const exports=module.exports;\n${js}\nreturn module.exports;}});\n`);
for(const file of result.outputFiles.filter(f=>f.path.endsWith('.LEGAL.txt')))await writeFile('lib/client.js.LEGAL.txt',file.text);
const packages=new Set(Object.keys(result.metafile.inputs).filter(path=>path.includes('node_modules/')).map(path=>{const tail=path.slice(path.lastIndexOf('node_modules/')+13).split('/');return tail[0].startsWith('@')?tail.slice(0,2).join('/'):tail[0];}));
const notices=[];
for(const name of Array.from(packages).sort()){
  const folder=resolve('node_modules',name),info=JSON.parse(await readFile(join(folder,'package.json'),'utf8'));
  notices.push(`\n${info.name} ${info.version} (${info.license??'see source notices'})\n`);
  for(const file of (await readdir(folder)).filter(name=>/^(license|licence|copying)(\.|$)/i.test(name)))notices.push(await readFile(join(folder,file),'utf8'));
}
await writeFile('lib/THIRD_PARTY_LICENSES.txt',notices.join('\n'));
console.log('Built client:',(Buffer.byteLength(js)/1024/1024).toFixed(2),'MiB');
