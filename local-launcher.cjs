const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const os=require('node:os');
const {spawn}=require('node:child_process');
const root=__dirname, runtime=path.join(root,'.runtime'), configPath=path.join(runtime,'config.json');
fs.mkdirSync(runtime,{recursive:true});
if(!fs.existsSync(configPath))fs.writeFileSync(configPath,JSON.stringify({APP_PASSWORD:crypto.randomBytes(15).toString('base64url'),SESSION_SECRET:crypto.randomBytes(48).toString('hex'),PORT:'8000',HOST:'127.0.0.1'},null,2),{mode:0o600});
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
async function main(){
 const url=`http://127.0.0.1:${config.PORT}/health`;
 let existing=false;
 try{const response=await fetch(url,{signal:AbortSignal.timeout(1500)});const result=await response.json();if(result.app==='danhba-email')existing=true;else throw Error('Cổng đang được ứng dụng khác dùng.');}catch(e){if(e.message.includes('Cổng'))throw e;}
 if(!existing){
  const log=fs.openSync(path.join(runtime,'server.log'),'a');
  const child=spawn(process.execPath,[path.join(root,'server.js')],{cwd:root,env:{...process.env,...config},detached:true,windowsHide:true,stdio:['ignore',log,log]});
  child.on('error',e=>{console.error(e.message);process.exitCode=1;});
  child.unref();fs.closeSync(log);
  if(child.pid)fs.writeFileSync(path.join(runtime,'process.json'),JSON.stringify({pid:child.pid,started:new Date().toISOString()}));
  let ready=false;for(let i=0;i<30;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(1000)});if((await r.json()).app==='danhba-email'){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
  if(!ready)throw Error('App chưa khởi động được. Xem .runtime/server.log.');
 }
 const addresses=Object.values(os.networkInterfaces()).flat().filter(i=>i.family==='IPv4'&&!i.internal).map(i=>`http://${i.address}:${config.PORT}`);
 console.log(existing?'App dang chay.':'Da khoi dong app.');console.log(`Tren may nay: http://localhost:${config.PORT}`);console.log(config.HOST==='127.0.0.1'?'Chi truy cap tu PC nay.':'Trong mang noi bo: '+addresses.join(', '));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
