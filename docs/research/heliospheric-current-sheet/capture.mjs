import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const [,,html,dir,from,to,port='9334']=process.argv;
mkdirSync(dir,{recursive:true});
// CHROME = a chrome-headless-shell binary; CHROME_GL_FLAGS overrides the software-GL default.
const HS=process.env.CHROME??'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const GL=(process.env.CHROME_GL_FLAGS??'--use-angle=swiftshader --enable-unsafe-swiftshader').split(' ').filter(Boolean);
const br=spawn(HS,['--no-sandbox','--allow-file-access-from-files',...GL,'--remote-debugging-port='+port,'--window-size=1920,1080','file://'+process.cwd()+'/'+html],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws;for(let i=0;i<100;i++){try{const l=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();const p=l.find(x=>x.type==='page');if(p){ws=p.webSocketDebuggerUrl;break;}}catch{}await sleep(200);}
const sock=new WebSocket(ws);await new Promise(r=>sock.onopen=r);
let id=0;const pend=new Map();sock.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const call=(method,params)=>new Promise(r=>{const i=++id;pend.set(i,r);sock.send(JSON.stringify({id:i,method,params}));});
const ev=async expr=>{const m=await call('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(m.result.exceptionDetails)throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0,800));return m.result.result.value;};
for(let i=0;i<150&&!(await ev('window.ready===true'));i++)await sleep(200);
const N=await ev('window.NFRAMES');const a=+from,b=Math.min(N,+to);console.log('NFRAMES',N,'range',a,b);
for(let n=a;n<b;n++){const t0=Date.now();const d=await ev(`window.render(${n})`);writeFileSync(`${dir}/f${String(n).padStart(4,'0')}.png`,Buffer.from(d.split(',')[1],'base64'));
  if(n===a||n%50===0)console.log(n,Date.now()-t0,'ms',await ev('window.lastTris'),'tris');}
sock.close();br.kill();
