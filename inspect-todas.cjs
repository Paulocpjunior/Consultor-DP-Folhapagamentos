const XLSX = require('xlsx');
const fs = require('fs');
const arquivo = process.env.PLANILHA;
const wb = XLSX.read(fs.readFileSync(arquivo), { type: 'buffer' });
const abas = ['REDE GENESIS', 'VITA', 'ABA', 'COLORADO', 'EMBAIXADA', 'SBE EDIÇÕES'];
for (const aba of abas) {
  const ws = wb.Sheets[aba];
  if (!ws) { console.log('==', aba, '=> AUSENTE'); continue; }
  const range = XLSX.utils.decode_range(ws['!ref']);
  console.log('\n========== ' + aba + ' (dims ' + ws['!ref'] + ') ==========');
  console.log('--- Linha 2 (título) ---');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const v = ws[XLSX.utils.encode_cell({r:1,c})] && ws[XLSX.utils.encode_cell({r:1,c})].v;
    if (v) console.log('  ', XLSX.utils.encode_cell({r:1,c}), '=', JSON.stringify(v));
  }
  console.log('--- Linha 4 (headers) ---');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const v = ws[XLSX.utils.encode_cell({r:3,c})] && ws[XLSX.utils.encode_cell({r:3,c})].v;
    if (v) console.log('  ', XLSX.utils.encode_cell({r:3,c}), '=', JSON.stringify(v));
  }
  console.log('--- Linha 5 (códigos SAGE inline) ---');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const v = ws[XLSX.utils.encode_cell({r:4,c})] && ws[XLSX.utils.encode_cell({r:4,c})].v;
    if (v) console.log('  ', XLSX.utils.encode_cell({r:4,c}), '=', JSON.stringify(v));
  }
}
