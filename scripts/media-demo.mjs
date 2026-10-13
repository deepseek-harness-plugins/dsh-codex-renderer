import {fileURLToPath} from 'node:url';

const audio=fileURLToPath(new URL('../assets/sample.wav',import.meta.url));
const video=fileURLToPath(new URL('../assets/sample.mp4',import.meta.url));
console.log(`请直接原样输出下面两行 Markdown，不要使用代码块，也不要读取或分析文件：\n\n![音频样例](${audio})\n\n![视频样例](${video})`);
