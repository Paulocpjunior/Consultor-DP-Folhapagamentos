// components/esocial/useVigiaEsocial.ts
//
// Liga o vigia do eSocial (consulta automática dos protocolos) na empresa ativa enquanto a aba está visível.
// Também importa sozinho o S-1299/S-1298 transmitido fora do Consultor (vigiaFechamento.ts): no máximo uma vez
// por dia por empresa e competência (a aberta e a anterior), com a marca no Firestore valendo para todos os usuários.

import { useEffect, useRef, useState } from 'react';
import type { Usuario } from '../../services/cadastros/cadastrosService';
import { rodadaDoVigia, type RodadaVigia } from '../../services/esocial/vigiaEsocial';
import { depsDoVigiaFechamento, importarFechamentosAutomatico } from '../../services/esocial/vigiaFechamento';

export const INTERVALO_VIGIA_MS = 20_000;

export function useVigiaEsocial(empresa: { id: string; cnpj: string; competencia?: string } | null, usuario: Usuario | null, aoMudar?: () => void): RodadaVigia | null {
    const [rodada, setRodada] = useState<RodadaVigia | null>(null);
    const rodando = useRef(false);
    const aoMudarRef = useRef(aoMudar);
    aoMudarRef.current = aoMudar;
    const empId = empresa?.id ?? ''; const cnpj = empresa?.cnpj ?? ''; const competencia = empresa?.competencia ?? ''; const uid = usuario?.id ?? ''; const email = usuario?.email ?? '';
    useEffect(() => {
        setRodada(null);
        if (!empId || !uid) return;
        let vivo = true;
        const rodar = async () => {
            if (rodando.current || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
            rodando.current = true;
            try {
                try {
                    const r = await rodadaDoVigia({ id: empId, cnpj }, { id: uid, email });
                    if (!vivo) return;
                    setRodada(r);
                    if (r.mudaram) aoMudarRef.current?.();
                } catch { /* sem rede ou sem permissão: tenta na próxima rodada */ }
                // Fechamentos de fora do Consultor, só produção; a marca no Firestore decide se é hora e quem consulta.
                const f = competencia ? await importarFechamentosAutomatico({ id: empId, cnpj, competencia }, { id: uid, email }, depsDoVigiaFechamento(), { tpAmb: 1 }).catch(() => []) : [];
                if (vivo && f.some(x => x.importacao?.importados.length)) aoMudarRef.current?.();
            } finally { rodando.current = false; }
        };
        rodar();
        const t = setInterval(rodar, INTERVALO_VIGIA_MS);
        return () => { vivo = false; clearInterval(t); };
    }, [empId, cnpj, competencia, uid, email]);
    return rodada;
}
