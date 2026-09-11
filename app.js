const $=id=>document.getElementById(id);
let uploadData=null,jobId=null,pollTimer=null;

function notice(message=''){$('notice').textContent=message;$('notice').hidden=!message;}
async function api(path,options={}){
  const res=await fetch(path,{...options,headers:{'X-Requested-With':'danhba-app',...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers}});
  let data;try{data=await res.json();}catch{throw Error('Máy chủ chưa phản hồi. Vui lòng thử lại.');}
  if(!res.ok)throw Error(data.error||'Yêu cầu thất bại.');return data;
}
function showWorkspace(auth){$('loginPanel').hidden=auth;$('workspace').hidden=!auth;$('logout').hidden=!auth;}

$('loginForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/login',{method:'POST',body:JSON.stringify({password:$('password').value})});$('password').value='';notice();showWorkspace(true);}catch(error){notice(error.message);}};
$('logout').onclick=async()=>{try{await api('/api/logout',{method:'POST'});sessionStorage.removeItem('danhbaJob');location.reload();}catch(error){notice(error.message);}};

function fillSelect(id,headers,optional){const select=$(id);select.replaceChildren();if(optional)select.add(new Option('Không có',-1));headers.forEach((header,index)=>select.add(new Option(`${index+1}. ${header||'(cột trống)'}`,index)));}
function mapSheet(){
  const sheet=uploadData.sheets[Number($('sheet').value)];
  fillSelect('nameCol',sheet.headers,false);fillSelect('idCol',sheet.headers,true);
  sheet.headers.forEach((header,index)=>{const normalized=header.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();if(/ho.*ten|full.?name/.test(normalized))$('nameCol').value=index;if(/danh so|employee.?id|staff.?id/.test(normalized))$('idCol').value=index;});
}
$('sheet').onchange=mapSheet;
$('file').onchange=async()=>{
  const file=$('file').files[0];if(!file)return;notice();$('mapping').hidden=true;uploadData=null;
  try{if(file.size>5*1024*1024)throw Error('File vượt quá 5 MB.');const form=new FormData();form.append('file',file);uploadData=await api('/api/upload',{method:'POST',body:form});$('sheet').replaceChildren();uploadData.sheets.forEach((sheet,index)=>$('sheet').add(new Option(`${sheet.name} · ${sheet.count} dòng`,index)));mapSheet();$('mapping').hidden=false;}catch(error){notice(error.message);}
};
$('start').onclick=async()=>{
  if(!uploadData)return;notice();$('start').disabled=true;
  try{const job=await api('/api/jobs',{method:'POST',body:JSON.stringify({uploadId:uploadData.id,sheetIndex:Number($('sheet').value),nameCol:Number($('nameCol').value),unitCol:-1,idCol:Number($('idCol').value)})});jobId=job.id;sessionStorage.setItem('danhbaJob',jobId);$('mapping').hidden=true;uploadData=null;$('file').value='';await poll();}catch(error){notice(error.message);$('start').disabled=false;}
};

function candidateLabel(candidate){return [candidate.staffId&&`Danh số: ${candidate.staffId}`,candidate.unit,candidate.department,candidate.role,candidate.email||'Chưa có email'].filter(Boolean).join(' · ');}
async function chooseCandidate(resultIndex,candidateIndex,button){
  button.disabled=true;notice();
  try{await api(`/api/jobs/${jobId}/results/${resultIndex}/select`,{method:'POST',body:JSON.stringify({candidateIndex})});await poll();}catch(error){button.disabled=false;notice(error.message);}
}
function renderResult(result,resultIndex){
  const tr=document.createElement('tr'),name=document.createElement('td'),output=document.createElement('td');
  name.textContent=result.name||'(thiếu họ tên)';output.textContent=result.email||'—';
  const status=document.createElement('small');status.textContent=result.status;output.append(status);
  if(result.needsSelection&&result.candidates?.length){
    const choices=document.createElement('div');choices.className='choices';
    result.candidates.forEach((candidate,candidateIndex)=>{const button=document.createElement('button');button.type='button';button.className='candidate';button.textContent=candidateLabel(candidate);button.onclick=()=>chooseCandidate(resultIndex,candidateIndex,button);choices.append(button);});
    output.append(choices);
  }else if(result.detail){
    const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('div');summary.textContent='Thông tin đối chiếu';text.textContent=result.detail;details.append(summary,text);output.append(details);
  }
  tr.append(name,output);return tr;
}
async function poll(){
  clearTimeout(pollTimer);
  try{
    const job=await api(`/api/jobs/${jobId}`),active=['running','queued'].includes(job.state);
    $('empty').hidden=true;$('progressPanel').hidden=false;
    $('state').textContent=job.unresolved&&!active?`Cần chọn ${job.unresolved} trường hợp`:({queued:'Đang chờ',running:'Đang tra cứu',done:'Đã hoàn tất',cancelled:'Đã dừng',failed:'Tra cứu bị gián đoạn'})[job.state];
    $('count').textContent=`${job.completed} / ${job.total} dòng`;$('progress').max=job.total;$('progress').value=job.completed;
    $('jobError').textContent=job.unresolved?`Hãy chọn đúng nhân viên cho ${job.unresolved} trường hợp trùng họ tên trước khi tải Excel.`:job.error||'';
    $('download').hidden=!job.canDownload;$('download').href=`/api/jobs/${jobId}/download`;
    $('cancel').hidden=!active;$('start').disabled=active;$('file').disabled=active;$('rows').replaceChildren(...job.results.map(renderResult));
    if(active)pollTimer=setTimeout(poll,2000);
  }catch(error){notice(error.message);$('start').disabled=false;$('file').disabled=false;}
}

$('cancel').onclick=async()=>{try{await api(`/api/jobs/${jobId}/cancel`,{method:'POST'});notice('Đã yêu cầu dừng. Lượt tra hiện tại có thể cần vài giây để kết thúc.');}catch(error){notice(error.message);}};
api('/api/session').then(session=>{showWorkspace(session.authenticated);jobId=sessionStorage.getItem('danhbaJob');if(session.authenticated&&jobId)poll();}).catch(error=>notice(error.message));
