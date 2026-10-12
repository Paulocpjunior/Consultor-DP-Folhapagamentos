// components/Logo.tsx
// Identidade visual da SP Contábil: o monograma "SP" com a caneta-tinteiro, pelo ARQUIVO OFICIAL que o Paulo enviou
// (12/10/2026), em public/logo-sp.png. Nada de redesenho: o desenho anterior, feito à mão em SVG, punha uma letra em
// cima da outra. O mesmo arquivo gera o favicon e o ícone do iPhone (public/favicon.png e apple-touch-icon.png).
//
// No modo ícone, o logo fica num quadrado branco de cantos arredondados, como os ícones de app da Apple.

import React from 'react';

interface LogoProps {
    /** Tamanho — Tailwind classes ou estilo inline. Default: h-14 w-14 */
    className?: string;
    /** Esconde o texto "SP Contábil" ao lado do ícone */
    iconOnly?: boolean;
    /** Texto ao lado. Default: "SP Contábil" */
    label?: string;
    /** Sub-texto. Default: "Consultor DP — Folha" */
    subLabel?: string;
}

const ARQUIVO = `${import.meta.env.BASE_URL}logo-sp.png`;

/** O logo oficial num quadrado branco arredondado (o arquivo já traz a margem). */
const IconeApp: React.FC<{ className?: string }> = ({ className }) => (
    <span className={`inline-block shrink-0 overflow-hidden rounded-[22%] bg-white ring-1 ring-black/5 ${className ?? ''}`}>
        <img src={ARQUIVO} alt="Logo SP Contábil" className="h-full w-full object-contain" draggable={false} />
    </span>
);

const Logo: React.FC<LogoProps> = ({
    className,
    iconOnly = false,
    label = 'SP Contábil',
    subLabel = 'Consultor DP — Folha',
}) => {
    if (iconOnly) return <IconeApp className={className || 'h-14 w-14'} />;
    return (
        <div className={`inline-flex items-center gap-3 ${className ?? ''}`}>
            <IconeApp className="h-12 w-12" />
            <div className="leading-tight">
                <div className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">{label}</div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{subLabel}</div>
            </div>
        </div>
    );
};

export default Logo;
