import {load} from 'cheerio';

export const SOURCE='http://danhba.vietsov.com.vn/FIND2.aspx';
export const clean=s=>String(s??'').normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s+/g,' ').trim();
export const norm=s=>clean(s).toLocaleLowerCase('vi');

export function parseResults(html) {
  const $=load(html),table=$('table[id$="RadGrid1_ctl00"]');
  if(!table.length) throw Error('Trang danh bạ không trả bảng kết quả. Có thể trang đã thay đổi hoặc yêu cầu đăng nhập.');
  const headers=table.find('th').map((i,e)=>norm($(e).text())).get();
  const col=(...labels)=>labels.map(label=>headers.indexOf(norm(label))).find(index=>index>=0)??-1;
  const familyNameIndex=col('Họ đệm'),givenNameIndex=col('Tên'),emailIndex=col('E-mail','Email');
  const staffIdLabels=['Danh số','Mã nhân viên','Employee ID','Staff ID'].map(norm);
  const staffIdIndexes=headers.flatMap((header,index)=>staffIdLabels.includes(header)?[index]:[]);
  const unitIndex=col('Tên đơn vị'),departmentIndex=col('Tên phòng'),roleIndex=col('Chức danh');
  if(emailIndex<0||familyNameIndex<0||givenNameIndex<0) throw Error('Cấu trúc danh bạ đã thay đổi.');
  if(table.find('.rgPager').length) throw Error('Kết quả có phân trang; cần thu hẹp thông tin tìm kiếm.');
  return table.find('tr.rgRow, tr.rgAltRow').map((i,e)=>{
    const cells=$(e).children('td').map((j,c)=>clean($(c).text())).get();
    return {
      name:clean(`${cells[familyNameIndex]||''} ${cells[givenNameIndex]||''}`),
      // The live directory currently returns two hidden columns named "Danh số".
      // Some employees have a blank value in the first but a populated site ID in the second.
      staffId:staffIdIndexes.map(index=>cells[index]||'').find(Boolean)||'',
      unit:unitIndex>=0?cells[unitIndex]||'':'',
      department:departmentIndex>=0?cells[departmentIndex]||'':'',
      role:roleIndex>=0?cells[roleIndex]||'':'',
      email:cells[emailIndex]||''
    };
  }).get();
}

const candidate=row=>({
  name:clean(row.name),staffId:clean(row.staffId),unit:clean(row.unit),
  department:clean(row.department),role:clean(row.role),email:clean(row.email).toLowerCase()
});
export const candidateDetail=row=>[row.name,row.staffId&&`Danh số: ${row.staffId}`,row.unit,row.department,row.role,row.email||'(không có email)'].filter(Boolean).join(' | ');

export function selectCandidate(row,status='Đã chọn người phù hợp') {
  const selected=candidate(row),detail=candidateDetail(selected),email=selected.email;
  if(!email) return {email:'',status:'Chưa có email',detail,selected};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!email.endsWith('@vietsov.com.vn')) return {email:'',status:'Cần kiểm tra địa chỉ email',detail,selected};
  return {email,status,detail,selected};
}

export function matchResults(rows,name,staffId='') {
  const exact=rows.map(candidate).filter(row=>norm(row.name)===norm(name));
  if(!exact.length) return {email:'',status:rows.length?'Cần kiểm tra họ tên':'Không tìm thấy',detail:rows.map(candidateDetail).join('\n')};
  if(exact.length===1) return selectCandidate(exact[0],'Khớp họ tên');

  const id=clean(staffId);
  if(id){
    const idMatches=exact.filter(row=>norm(row.staffId)===norm(id));
    if(idMatches.length===1) return selectCandidate(idMatches[0],'Khớp họ tên và danh số');
  }
  return {
    email:'',
    status:id?'Danh số chưa xác định duy nhất — vui lòng chọn':'Trùng họ tên — vui lòng chọn',
    detail:exact.map(candidateDetail).join('\n'),
    needsSelection:true,
    candidates:exact
  };
}

async function request(url,options={}) {
  const response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(25000)});
  if(!response.ok) throw Error(`Danh bạ trả lỗi HTTP ${response.status}.`);
  const text=await response.text();
  if(text.length>4_000_000) throw Error('Kết quả quá lớn; hãy kiểm tra lại họ tên.');
  return {text,cookie:response.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')};
}

export async function lookup(name,unit='',staffId='') {
  const first=await request(SOURCE),$=load(first.text),form=new URLSearchParams();
  $('form input[name]').each((i,e)=>{if(['hidden','text'].includes($(e).attr('type'))) form.set($(e).attr('name'),$(e).val()||'');});
  const set=(suffix,value)=>{const el=$(`input[id$="${suffix}"]`);if(!el.length) throw Error('Biểu mẫu danh bạ đã thay đổi.');form.set(el.attr('name'),value);};
  const words=clean(name).split(' ');
  // Search by name first. Danh số is consulted only after an identical-name collision.
  set('txthodem',words.slice(0,-1).join(' '));
  set('txtten',words.at(-1));
  set('txt_danhso','');
  const select=$('select[id$="dddv"]');
  form.set(select.attr('name'),select.find('option').first().attr('value'));
  const button=$('input[id$="Cmdtim"]');form.set(button.attr('name'),button.val());
  const result=await request(SOURCE,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Cookie:first.cookie},body:form.toString()});
  return matchResults(parseResults(result.text),name,staffId);
}
