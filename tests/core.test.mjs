import test from 'node:test';
import assert from 'node:assert/strict';
import {contentWidgets,mediaKind,mediaURL,createPreferences,PREFERENCE_KEY} from '../src/core.js';

test('只将 Mermaid 代码和独立媒体识别为控件，保留行内链接',()=>{
  const source='```mermaid\nflowchart LR\n A-->B\n```\n\n```js\nconst video="demo.mp4";\n```\n\n![音频][sample]\n\n[下载](https://example.com/demo.wav)\n\n正文中的 [引用](https://example.com/other.mp4) 保留。\n\n[sample]: https://example.com/demo.wav';
  const widgets=contentWidgets(source);
  assert.deepEqual(widgets.codes,['flowchart LR\n A-->B']);
  assert.deepEqual(widgets.media,[{url:'https://example.com/demo.wav',kind:'audio',image:true,label:'音频'}]);
});
test('媒体类型忽略查询和片段中的伪扩展名',()=>{
  assert.equal(mediaKind('https://example.com/movie.MP4?token=x#t=1'),'video');
  assert.equal(mediaKind('https://example.com/report.txt?filename=a.mp3'),null);
  assert.equal(mediaKind('/tmp/example%2Emp3'),'audio');
  assert.equal(mediaKind('data:audio/wav;base64,abc'),'audio');
});
test('本地媒体复用 DSH 文件路由，拒绝执行协议和网络共享路径',()=>{
  assert.equal(mediaURL('/tmp/我的文件.wav','http://127.0.0.1:8000/'), 'http://127.0.0.1:8000/api/file?path=%2Ftmp%2F%E6%88%91%E7%9A%84%E6%96%87%E4%BB%B6.wav');
  assert.equal(mediaURL('/tmp/video.mp4','dsh-app://app/'),'dsh-app://app/api/file?path=%2Ftmp%2Fvideo.mp4');
  assert.equal(mediaURL('javascript:alert(1)','http://localhost/'),null);
  assert.equal(mediaURL('//host/private.wav','http://localhost/'),null);
});
test('三个开关独立保存，订阅响应变化且旧设置可恢复',()=>{
  let value='{"tables":false,"mermaid":true,"media":false}';
  const storage={getItem:()=>value,setItem:(key,data)=>{assert.equal(key,PREFERENCE_KEY);value=data;}};
  const preferences=createPreferences(storage);let updates=0;
  preferences.subscribe(()=>updates++);
  preferences.update({media:true});
  assert.deepEqual(preferences.getSnapshot(),{tables:false,mermaid:true,media:true});
  assert.equal(updates,1);
  assert.deepEqual(createPreferences(storage).getSnapshot(),preferences.getSnapshot());
});
