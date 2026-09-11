import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {matchResults,clean,parseResults} from './directory.js';
import {createApp} from './server.js';
import {readWorkbook} from './workbook.js';
test('Matching starts with name and uses staff ID only for namesakes',()=>{
 const row={name:'Nguyễn Văn A',staffId:'1001',unit:'BỘ MÁY ĐIỀU HÀNH',email:'a@vietsov.com.vn'};
 const namesake={...row,staffId:'1002',email:'b@vietsov.com.vn'};
 assert.equal(matchResults([row],row.name,'khác').email,row.email);
 assert.equal(matchResults([row,namesake],row.name).needsSelection,true);
 assert.equal(matchResults([row,namesake],row.name,'1002').email,namesake.email);
 assert.equal(matchResults([row,namesake],row.name,'9999').needsSelection,true);
 assert.equal(matchResults([row,row],row.name,'1001').email,'');
 assert.equal(matchResults([{...row,email:'a@vietsov.com.v'}],row.name).email,'');
 assert.equal(clean('  Nguyễn\u200b   Văn A '),row.name);
 assert.throws(()=>parseResults('<html>Login</html>'));
});
test('Directory parser falls back to the second site employee ID',()=>{
 const html=`<table id="ctl00_ContentPlaceHolder1_RadGrid1_ctl00"><tr><th>Họ đệm</th><th>Tên</th><th>E-mail</th><th>Danh số</th><th>Danh số</th></tr><tr class="rgRow"><td>Nguyễn Văn</td><td>Hoan</td><td>hoan@vietsov.com.vn</td><td>&nbsp;</td><td>12917</td></tr><tr class="rgAltRow"><td>Nguyễn Văn</td><td>Khanh</td><td>khanh@vietsov.com.vn</td><td>XL2474</td><td>19278</td></tr></table>`;
 const rows=parseResults(html);
 assert.equal(rows[0].staffId,'12917');
 assert.equal(rows[1].staffId,'XL2474');
});
test('Login, duplicate selection, export gate and isolation',async()=>{
 const candidates=[{name:'Nguyễn Văn A',staffId:'1001',unit:'A',email:'first@vietsov.com.vn'},{name:'Nguyễn Văn A',staffId:'1002',unit:'B',email:'second@vietsov.com.vn'}];
 const app=createApp({password:'test-password-long',secret:'a'.repeat(40),delay:0,lookupFn:async(name)=>matchResults(candidates,name)});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  let res=await fetch(base+'/api/jobs/no');assert.equal(res.status,401);
  res=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'test-password-long'})});assert.equal(res.status,403);
  const login=()=>fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'danhba-app'},body:JSON.stringify({password:'test-password-long'})});
  res=await login();assert.equal(res.status,200);const cookie=res.headers.getSetCookie()[0].split(';')[0];const headers={Cookie:cookie,'X-Requested-With':'danhba-app'};
  const wb=new ExcelJS.Workbook();wb.addWorksheet('People').addRows([['Họ tên','Ghi chú'],['Nguyễn Văn A','=1+1'],['','trống']]);const buffer=await wb.xlsx.writeBuffer();const fd=new FormData();fd.append('file',new Blob([buffer]),'people.xlsx');
  res=await fetch(base+'/api/upload',{method:'POST',headers,body:fd});assert.equal(res.status,200);const upload=await res.json();
  res=await fetch(base+'/api/jobs',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({uploadId:upload.id,sheetIndex:0,nameCol:0,unitCol:-1,idCol:-1})});assert.equal(res.status,200);const job=await res.json();
  let data;for(let i=0;i<50;i++){data=await(await fetch(base+'/api/jobs/'+job.id,{headers})).json();if(data.state==='done')break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(data.state,'done');assert.equal(data.completed,2);assert.equal(data.results[0].needsSelection,true);assert.equal(data.canDownload,false);assert.equal(data.results[1].status,'Thiếu họ tên');
  const other=await login();res=await fetch(base+'/api/jobs/'+job.id,{headers:{Cookie:other.headers.getSetCookie()[0].split(';')[0]}});assert.equal(res.status,404);
  res=await fetch(base+'/api/jobs/'+job.id+'/download',{headers});assert.equal(res.status,409);
  res=await fetch(base+'/api/jobs/'+job.id+'/results/0/select',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({candidateIndex:1})});assert.equal(res.status,200);
  data=await(await fetch(base+'/api/jobs/'+job.id,{headers})).json();assert.equal(data.canDownload,true);assert.equal(data.results[0].email,'second@vietsov.com.vn');
  res=await fetch(base+'/api/jobs/'+job.id+'/download',{headers});assert.equal(res.status,200);const out=new ExcelJS.Workbook();await out.xlsx.load(Buffer.from(await res.arrayBuffer()));assert.equal(out.worksheets[0].getCell('C1').text,'Danh số');assert.equal(out.worksheets[0].getCell('C2').text,'1002');assert.equal(out.worksheets[0].getCell('D2').text,'second@vietsov.com.vn');assert.equal(out.worksheets[0].getCell('B2').type,ExcelJS.ValueType.String);
  assert.equal((await readWorkbook(Buffer.from(buffer)))[0].rows.length,3);
 }finally{await new Promise(r=>server.close(r));}
});
