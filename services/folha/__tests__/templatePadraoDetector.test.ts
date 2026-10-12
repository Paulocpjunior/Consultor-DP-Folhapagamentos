/**
 * templatePadraoDetector.test.ts
 *
 * Rode com: npx vitest run src/services/__tests__/templatePadraoDetector.test.ts
 * (ajuste o caminho do XLSX se necessário)
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import {
  detectarTemplatePadrao,
  lerLinhasApontamento,
  normalizar,
  normalizarCodigoSage,
} from '../templatePadraoDetector';

const fixture = (nome: string) => path.join(__dirname, 'fixtures', nome);

describe('templatePadraoDetector v2.1.0', () => {
  describe('normalizar()', () => {
    it('remove acentos, parênteses e colapsa espaços', () => {
      expect(normalizar('Descrição (do Evento)')).toBe('descricao do evento');
      expect(normalizar('  Tipo (R/V)  ')).toBe('tipo r v');
      expect(normalizar('Valor (R$)')).toBe('valor r$');
      expect(normalizar('Nome do Funcionário')).toBe('nome do funcionario');
    });
  });

  describe('normalizarCodigoSage()', () => {
    it('preserva leading zeros e aceita number/string/com hífen', () => {
      expect(normalizarCodigoSage(5650)).toBe('5650');
      expect(normalizarCodigoSage('5650')).toBe('5650');
      expect(normalizarCodigoSage('0811')).toBe('0811');
      expect(normalizarCodigoSage(811)).toBe('0811');         // <-- bug histórico corrigido
      expect(normalizarCodigoSage('0001 - Salário')).toBe('0001');
      expect(normalizarCodigoSage(null)).toBe('');
      expect(normalizarCodigoSage('')).toBe('');
    });
  });

  describe('FASTWELD_-_0109.xlsx (cabeçalho com variações)', () => {
    const buf = fs.readFileSync(fixture('FASTWELD_-_0109.xlsx'));
    const wb = XLSX.read(buf, { type: 'buffer' });

    it('detecta como template padrão mesmo sem coluna Observação', async () => {
      const det = await detectarTemplatePadrao(wb);
      expect(det.ehTemplatePadrao).toBe(true);
      expect(det.aba).toBe('Lançamentos');
      expect(det.linhaCabecalho).toBe(4);
      expect(det.colunas?.observacao).toBeNull();           // ausente, opcional
      expect(det.colunas?.matricula).toBe(0);
      expect(det.colunas?.valor).toBe(6);
    });

    it('lê 46 linhas de apontamento e normaliza códigos', async () => {
      const det = await detectarTemplatePadrao(wb);
      const linhas = lerLinhasApontamento(wb, det);
      expect(linhas.length).toBe(46);

      // Alexandre — primeira linha de dados
      expect(linhas[0]).toMatchObject({
        matricula: '000109',
        nome: 'ALEXANDRE ARAUJO DOS SANTOS',
        codigoEvento: '5650',
        tipo: 'R',
        referencia: 2,
        valor: null,
      });

      // HE 60% — código que chegou como string "0811" (preservou zero)
      const he = linhas.find(l => l.codigoEvento === '0811');
      expect(he).toBeDefined();

      // SALÁRIO — código que chegou como string "0001"
      const salario = linhas.find(l => l.codigoEvento === '0001');
      expect(salario?.valor).toBe(6816.12);

      // Códigos numéricos puros (5650, 5780, 5610...) devem ter virado string 4 dígitos
      linhas.forEach(l => {
        expect(l.codigoEvento).toMatch(/^\d{4}$/);
      });
    });
  });
});
