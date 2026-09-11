import ExcelJS from 'exceljs';
import AdmZip from 'adm-zip';
import {clean} from './directory.js';
export async function readWorkbook(buffer) {
  const zip=new AdmZip(buffer),entries=zip.getEntries();
  if(entries.length>2000 || entries.reduce((s,e)=>s+e.header.size,0)>30*1024*1024) throw Error('File Excel quá lớn sau giải nén (tối đa 30 MB).');
  const book=new ExcelJS.Workbook(); await book.xlsx.load(buffer);
  const sheets=book.worksheets.map(sheet=>{
    if(sheet.rowCount>501||sheet.columnCount>100) throw Error('Mỗi sheet tối đa 500 dòng dữ liệu và 100 cột.');
    const rows=[];
    for(let i=1;i<=sheet.rowCount;i++) rows.push(Array.from({length:sheet.columnCount},(_,c)=>clean(sheet.getCell(i,c+1).text)));
    return {name:sheet.name,rows};
  }).filter(s=>s.rows.length>1);
  if(!sheets.length) throw Error('File chưa có dữ liệu. Dòng đầu tiên phải là tiêu đề cột.');
  return sheets;
}
export async function exportWorkbook(sheet,results) {
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Ket qua');
  ws.addRow([...sheet.rows[0],'Danh số','Email tra cứu','Trạng thái','Chi tiết đối chiếu','Nguồn','Thời điểm tra cứu']);
  sheet.rows.slice(1).forEach((row,i)=>{const r=results[i];ws.addRow([...row,r?.selected?.staffId||'',r?.email||'',r?.status||'Chưa xử lý',r?.detail||'',r?'http://danhba.vietsov.com.vn/FIND2.aspx':'',r?.checkedAt||'']);});
  ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF123D63'}};
  ws.views=[{state:'frozen',ySplit:1}];ws.autoFilter={from:{row:1,column:1},to:{row:1,column:ws.columnCount}};
  ws.columns.forEach(c=>{c.width=26;});ws.getColumn(sheet.rows[0].length+4).width=65;
  return wb.xlsx.writeBuffer();
}
