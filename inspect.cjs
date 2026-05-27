const XLSX = require('xlsx');
const fs = require('fs');
const arquivo = process.env.PLANILHA;
if (!arquivo || !fs.existsSync(arquivo)) {
  console.error('Defina PLANILHA com caminho válido. Recebi:', arquivo);
  process.exit(1);
}
console.log('Lendo:', arquivo);
const wb = XLSX.read(fs.readFileSync(arquivo), { type: 'buffer' });
console.log('Abas:', wb.SheetNames);
const ws = wb.Sheets['REDE GENESIS'];
if (!ws) { console.error('Aba REDE GENESIS não existe!'); process.exit(1); }
const ref = ws['!ref'];
const range = XLSX.utils.decode_range(ref);
console.log('Aba REDE GENESIS, dimensões:', ref);
for (let linha = 1; linha <= 6; linha++) {
  console.log('\n--- Linha', linha, '---');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: linha - 1, c });
    const v = ws[addr] && ws[addr].v;
    if (v !== undefined && v !== null && v !== '') {
      console.log('  ', addr, '=', JSON.stringify(v));
    }
  }
}
