// services/prazos/calendario.ts
//
// Dias úteis para os vencimentos do DP. Feriados considerados: os nacionais
// (Lei 662/1949, Lei 6.802/1980, Lei 14.759/2023 para o 20 de novembro),
// Sexta-feira Santa e a segunda e a terça de Carnaval, quando não há
// expediente bancário. Feriados estaduais e municipais NÃO entram; quando a
// empresa está numa cidade com feriado na data, o prazo pode mudar e a tela
// avisa isso.

export type Data = string; // AAAA-MM-DD

const pad = (n: number) => String(n).padStart(2, '0');
export const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const parse = (s: Data) => new Date(`${s}T00:00:00Z`);
export const somarDias = (s: Data, n: number) => fmt(new Date(parse(s).getTime() + n * 86400000));
export const diasEntre = (de: Data, ate: Data) => Math.round((parse(ate).getTime() - parse(de).getTime()) / 86400000);
export const somarMeses = (s: Data, n: number) => {
    const [a, m, d] = s.split('-').map(Number);
    const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
    const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
    return fmt(new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(d, ultimo))));
};
export const br = (s: Data) => s.split('-').reverse().join('/');

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): Data {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return `${ano}-${pad(mes)}-${pad(dia)}`;
}

const cache = new Map<number, Map<Data, string>>();
export function feriados(ano: number): Map<Data, string> {
    if (cache.has(ano)) return cache.get(ano)!;
    const p = pascoa(ano);
    const m = new Map<Data, string>([
        [`${ano}-01-01`, 'Confraternização Universal'], [`${ano}-04-21`, 'Tiradentes'], [`${ano}-05-01`, 'Dia do Trabalho'],
        [`${ano}-09-07`, 'Independência'], [`${ano}-10-12`, 'Nossa Senhora Aparecida'], [`${ano}-11-02`, 'Finados'],
        [`${ano}-11-15`, 'Proclamação da República'], [`${ano}-12-25`, 'Natal'],
        [somarDias(p, -48), 'Carnaval (segunda)'], [somarDias(p, -47), 'Carnaval (terça)'], [somarDias(p, -2), 'Sexta-feira Santa'],
    ]);
    if (ano >= 2024) m.set(`${ano}-11-20`, 'Dia Nacional de Zumbi e da Consciência Negra');
    cache.set(ano, m);
    return m;
}

export const diaSemana = (s: Data) => parse(s).getUTCDay(); // 0 = domingo
export const feriado = (s: Data) => feriados(Number(s.slice(0, 4))).get(s);
export const ehDiaUtil = (s: Data) => diaSemana(s) !== 0 && diaSemana(s) !== 6 && !feriado(s);

export function diaUtilAnterior(s: Data): Data { let d = s; while (!ehDiaUtil(d)) d = somarDias(d, -1); return d; }
export function diaUtilSeguinte(s: Data): Data { let d = s; while (!ehDiaUtil(d)) d = somarDias(d, 1); return d; }

/**
 * 5º dia útil do mês para pagar salários (CLT art. 459, §1º). Pela orientação
 * do Ministério do Trabalho, o sábado conta como dia útil nessa contagem;
 * domingos e feriados não.
 */
export function quintoDiaUtilSalario(ano: number, mes: number): Data {
    let d = `${ano}-${pad(mes)}-01`; let n = 0;
    for (;;) {
        if (diaSemana(d) !== 0 && !feriado(d)) { n++; if (n === 5) return d; }
        d = somarDias(d, 1);
    }
}
