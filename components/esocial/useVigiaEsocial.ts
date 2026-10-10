// components/esocial/useVigiaEsocial.ts
//
// Liga o vigia do eSocial (consulta automática dos protocolos) na empresa ativa enquanto a aba está visível.

import { useEffect, useRef, useState } from 'react';
import type { Usuario } from '../../services/cadastros/cadastrosService';
import { rodadaDoVigia, type RodadaVigia } from '../../services/esocial/vigiaEsocial';

export const INTERVALO_VIGIA_MS = 20_000;

export function useVigiaEsocial(empresa: { id: string; cnpj: string } | null, usuario: Usuario | null, aoMudar?: () => void): RodadaVigia | null {
    const [rodada, setRodada] = useState<RodadaVigia | null>(null);
    const rodando = useRef(false);
    const aoMudarRef = useRef(aoMudar);
    aoMudarRef.current = aoMudar;
    const empId = empresa?.id ?? ''; const cnpj = empresa?.cnpj ?? ''; const uid = usuario?.id ?? ''; const email = usuario?.email ?? '';
    useEffect(() => {
        setRodada(null);
        if (!empId || !uid) return;
        let vivo = true;
        const rodar = async () => {
            if (rodando.current || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
            rodando.current = true;
            try {
                const r = await rodadaDoVigia({ id: empId, cnpj }, { id: uid, email });
                if (!vivo) return;
                setRodada(r);
                if (r.mudaram) aoMudarRef.current?.();
            } catch { /* sem rede ou sem permissão: tenta na próxima rodada */ }
            finally { rodando.current = false; }
        };
        rodar();
        const t = setInterval(rodar, INTERVALO_VIGIA_MS);
        return () => { vivo = false; clearInterval(t); };
    }, [empId, cnpj, uid, email]);
    return rodada;
}
