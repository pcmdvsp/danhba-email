import express from 'express';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import {randomUUID,timingSafeEqual,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {lookup,clean,selectCandidate} from './directory.js';
import {readWorkbook,exportWorkbook} from './workbook.js';
export function createApp({password=process.env.APP_PASSWORD,secret=process.env.SESSION_SECRET,lookupFn=lookup,delay=1200}={}) {
  if(!password||password.length<12||!secret||secret.length<32) throw Error('Cần APP_PASSWORD ít nhất 12 ký tự và SESSION_SECRET ít nhất 32 ký tự.');
  const app=express(),uploads=new Map(),jobs=new Map(),queue=[];
  let working=false;
  const production=process.env.NODE_ENV==='production';
  app.set('trust proxy',production?1:false);app.disable('x-powered-by');
  app.use(helmet({strictTransportSecurity:production?undefined:false,contentSecurityPolicy:{directives:{upgradeInsecureRequests:production?[]:null}}}));
  app.get('/health',(req,res)=>res.json({ok:true,app:'danhba-email'}));
  app.use(express.json({limit:'10kb'}));
  const store=new session.MemoryStore();
  app.use(session({store,secret,resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:8*3600_000}}));
  app.use((req,res,next)=>{res.set('Cache-Control','no-store');if(req.method==='POST'&&req.get('X-Requested-With')!=='danhba-app')return res.status(403).json({error:'Yêu cầu không hợp lệ.'});next();});
  app.post('/api/login',rateLimit({windowMs:15*60_000,limit:10,standardHeaders:true,legacyHeaders:false,message:{error:'Thử đăng nhập quá nhiều lần. Hãy chờ 15 phút.'}}),(req,res)=>{
    const hash=x=>createHash('sha256').update(String(x)).digest();
    if(!timingSafeEqual(hash(req.body.password||''),hash(password)))return res.status(401).json({error:'Mật khẩu không đúng.'});
    req.session.regenerate(err=>{if(err)return res.status(500).json({error:'Không tạo được phiên đăng nhập.'});req.session.user=randomUUID();res.json({ok:true});});
  });
  app.get('/api/session',(req,res)=>res.json({authenticated:!!req.session.user}));
  app.use('/api',(req,res,next)=>req.session.user?next():res.status(401).json({error:'Vui lòng đăng nhập.'}));
  app.post('/api/logout',(req,res)=>req.session.destroy(()=>{res.clearCookie('connect.sid');res.json({ok:true});}));
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:0}});
  app.post('/api/upload',rateLimit({windowMs:60_000,limit:10}),upload.single('file'),async(req,res)=>{
    if(!req.file||!req.file.originalname.toLowerCase().endsWith('.xlsx'))return res.status(400).json({error:'Chọn file .xlsx, tối đa 5 MB.'});
    try {const sheets=await readWorkbook(req.file.buffer);for(const [id,u]of uploads)if(u.owner===req.session.user)uploads.delete(id);
      if(uploads.size>=20)return res.status(429).json({error:'Ứng dụng đang bận. Vui lòng thử lại sau.'});
      const id=randomUUID();uploads.set(id,{owner:req.session.user,sheets,time:Date.now()});
      res.json({id,sheets:sheets.map(s=>({name:s.name,headers:s.rows[0],count:s.rows.length-1}))});
    }catch(e){res.status(400).json({error:e.message.startsWith('File')||e.message.startsWith('Mỗi')?e.message:'Không đọc được Excel. Hãy lưu lại file dưới định dạng .xlsx.'});}
  });
  async function drain(){
    if(working)return;working=true;
    try{while(queue.length){const job=queue.shift();if(job.cancelled){job.state='cancelled';continue;}job.state='running';let errors=0;const cache=new Map();
      for(let i=0;i<job.sheet.rows.length-1;i++){
        if(job.cancelled)break;
        const row=job.sheet.rows[i+1],name=clean(row[job.nameCol]),unit=job.unitCol>=0?clean(row[job.unitCol]):'',staffId=job.idCol>=0?clean(row[job.idCol]):'';
        let result;
        if(!name)result={email:'',status:'Thiếu họ tên',detail:''};
        else try{const key=JSON.stringify([name,staffId]);if(cache.has(key))result=cache.get(key);else{result=await lookupFn(name,unit,staffId);cache.set(key,result);await new Promise(r=>setTimeout(r,delay));}errors=0;}
        catch(e){errors++;job.hadErrors=true;console.error('DIRECTORY_LOOKUP_ERROR',JSON.stringify({message:e.message,cause:e.cause?.message,code:e.cause?.code}));result={email:'',status:'Lỗi kết nối danh bạ',detail:'Không truy cập/đọc được danh bạ. Hãy thử lại; nếu chạy cloud, cần kiểm tra khả năng truy cập mạng.'};}
        job.results.push({...result,name,checkedAt:new Date().toISOString()});job.updated=Date.now();
        if(errors>=3){job.error='Dừng sau 3 lỗi liên tiếp. Bạn có thể tải kết quả đã xử lý.';job.state='failed';break;}
      }
      if(job.state!=='failed')job.state=job.cancelled?'cancelled':job.hadErrors?'failed':'done';
      if(job.hadErrors&&!job.error)job.error='Có dòng chưa tra được do lỗi kết nối danh bạ. Bạn có thể tải kết quả và thử lại sau.';
      job.updated=Date.now();
    }}finally{working=false;}
  }
  app.post('/api/jobs',(req,res)=>{
    const u=uploads.get(req.body.uploadId);if(!u||u.owner!==req.session.user)return res.status(404).json({error:'File hết hạn. Vui lòng tải lên lại.'});
    if([...jobs.values()].some(j=>j.owner===req.session.user&&['queued','running'].includes(j.state)))return res.status(409).json({error:'Bạn đang có một lượt tra cứu chưa xong.'});
    if(jobs.size>=20)return res.status(429).json({error:'Ứng dụng đang bận. Thử lại sau.'});
    const {sheetIndex,nameCol,unitCol=-1,idCol=-1}=req.body;
    const sheet=Number.isInteger(sheetIndex)?u.sheets[sheetIndex]:null;
    if(!sheet||!Number.isInteger(nameCol)||nameCol<0||nameCol>=sheet.rows[0].length||![unitCol,idCol].every(c=>Number.isInteger(c)&&c>=-1&&c<sheet.rows[0].length))return res.status(400).json({error:'Vui lòng chọn đúng các cột.'});
    const id=randomUUID(),job={id,owner:req.session.user,sheet,nameCol,unitCol,idCol,state:'queued',results:[],updated:Date.now()};jobs.set(id,job);uploads.delete(req.body.uploadId);queue.push(job);void drain();res.json({id});
  });
  app.use('/api/jobs/:id',(req,res,next)=>{const j=jobs.get(req.params.id);if(!j||j.owner!==req.session.user)return res.status(404).json({error:'Lượt tra cứu không còn khả dụng. Có thể máy chủ đã khởi động lại hoặc dữ liệu đã hết hạn.'});req.job=j;next();});
  app.get('/api/jobs/:id',(req,res)=>{const j=req.job;const unresolved=j.results.filter(r=>r.needsSelection).length;res.json({id:j.id,state:j.state,total:j.sheet.rows.length-1,completed:j.results.length,unresolved,canDownload:j.results.length>0&&!unresolved,results:j.results,error:j.error});});
  app.post('/api/jobs/:id/cancel',(req,res)=>{req.job.cancelled=true;res.json({ok:true});});
  app.post('/api/jobs/:id/results/:resultIndex/select',(req,res)=>{
    const resultIndex=Number(req.params.resultIndex),candidateIndex=req.body.candidateIndex;
    if(!Number.isInteger(resultIndex)||resultIndex<0||resultIndex>=req.job.results.length||!Number.isInteger(candidateIndex))return res.status(400).json({error:'Lựa chọn không hợp lệ.'});
    const current=req.job.results[resultIndex],chosen=current.candidates?.[candidateIndex];
    if(!current.needsSelection||!chosen)return res.status(409).json({error:'Kết quả này không còn cần lựa chọn.'});
    req.job.results[resultIndex]={...selectCandidate(chosen),name:current.name,checkedAt:current.checkedAt};
    req.job.updated=Date.now();
    res.json({ok:true,result:req.job.results[resultIndex]});
  });
  app.get('/api/jobs/:id/download',async(req,res)=>{
    if(req.job.results.some(r=>r.needsSelection))return res.status(409).json({error:'Vui lòng chọn đúng nhân viên cho tất cả trường hợp trùng họ tên trước khi tải Excel.'});
    const buffer=await exportWorkbook(req.job.sheet,req.job.results);res.attachment('ket-qua-email.xlsx');res.send(Buffer.from(buffer));
  });
  for(const [route,file] of [['/','index.html'],['/style.css','style.css'],['/app.js','app.js']])app.get(route,(req,res)=>res.sendFile(fileURLToPath(new URL(file,import.meta.url))));
  app.use((err,req,res,next)=>res.status(400).json({error:err.code==='LIMIT_FILE_SIZE'?'File vượt quá 5 MB.':'Yêu cầu không hợp lệ. Vui lòng thử lại.'}));
  const timer=setInterval(()=>{const now=Date.now();for(const [id,u]of uploads)if(now-u.time>3600_000)uploads.delete(id);for(const[id,j]of jobs)if(!['running','queued'].includes(j.state)&&now-j.updated>3600_000)jobs.delete(id);store.all((err,sessions)=>{if(!err)for(const[id,s]of Object.entries(sessions))if(new Date(s.cookie.expires).getTime()<now)store.destroy(id);});},60000);timer.unref();
  return app;
}
if(process.argv[1]===fileURLToPath(import.meta.url))createApp().listen(process.env.PORT||8000,process.env.HOST||'0.0.0.0',()=>console.log('Danh bạ app sẵn sàng tại cổng '+(process.env.PORT||8000)));
