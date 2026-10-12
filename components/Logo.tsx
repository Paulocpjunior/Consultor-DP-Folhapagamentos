// components/Logo.tsx
// Identidade visual padronizada SP Contábil — monograma "PS" com caneta-tinteiro.
//
// Renderiza um SVG inline (escalável, suporta tema claro/escuro). Para trocar
// pelo arquivo original, basta substituir este componente por um <img> apontando
// para um asset em `public/` (ex.: /logo.png) — o resto do app não muda.

import React from 'react';

interface LogoProps {
    /** Tamanho — Tailwind classes ou estilo inline. Default: h-14 w-14 */
    className?: string;
    /** Esconde o texto "SP CONTÁBIL" abaixo do monograma */
    iconOnly?: boolean;
    /** Texto ao lado/abaixo. Default: "SP CONTÁBIL" */
    label?: string;
    /** Sub-texto. Default: "CONSULTOR DP — FOLHA" */
    subLabel?: string;
}

const NAVY = '#0f1d4d';   // P (azul-marinho profundo)
const ROYAL = '#1d4ed8';  // S e nib (azul-royal)

/**
 * SVG do monograma. viewBox 200x200, centralizado.
 * Estrutura: P (navy) ao fundo, S (royal) entrelaçado por cima passando pelo
 * miolo do P, nib (caneta) saindo do topo direito do bowl do P.
 */
const Monogram: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 200 200"
        className={className}
        aria-label="Logo SP Contábil"
        role="img"
    >
        {/* P — letra de fundo (navy) */}
        <path
            fill={NAVY}
            d="
                M 60 24
                L 60 176
                L 84 176
                L 84 124
                L 112 124
                C 144 124 162 108 162 78
                C 162 46 142 24 110 24
                Z
                M 84 46
                L 108 46
                C 128 46 138 58 138 78
                C 138 96 128 104 108 104
                L 84 104
                Z
            "
        />

        {/* S — letra entrelaçada (royal blue), passando à frente do tronco do P */}
        <path
            fill={ROYAL}
            d="
                M 132 60
                C 122 50 108 46 92 46
                C 64 46 46 60 46 84
                C 46 104 60 114 86 120
                L 102 124
                C 118 128 124 132 124 142
                C 124 152 114 160 96 160
                C 78 160 64 152 54 138
                L 38 154
                C 52 172 72 182 96 182
                C 130 182 150 166 150 142
                C 150 122 138 110 110 102
                L 94 98
                C 80 94 72 90 72 80
                C 72 70 82 64 96 64
                C 110 64 122 70 130 80
                Z
            "
        />

        {/* Nib (ponta de caneta-tinteiro) — topo direito do P */}
        <g>
            {/* Corpo do nib */}
            <path
                fill={ROYAL}
                d="
                    M 142 56
                    L 178 38
                    L 174 70
                    L 158 78
                    Z
                "
            />
            {/* Sulco central do nib */}
            <path
                stroke="#ffffff"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                d="M 152 64 L 170 50"
            />
            {/* Furo do nib */}
            <circle cx="166" cy="56" r="2.4" fill="#ffffff" />
        </g>
    </svg>
);

/** Caminhos do monograma (P, S, nib e sulco), para o ícone do app desenhar em branco. */
const CAMINHOS = { P: 'M 60 24 L 60 176 L 84 176 L 84 124 L 112 124 C 144 124 162 108 162 78 C 162 46 142 24 110 24 Z M 84 46 L 108 46 C 128 46 138 58 138 78 C 138 96 128 104 108 104 L 84 104 Z', S: 'M 132 60 C 122 50 108 46 92 46 C 64 46 46 60 46 84 C 46 104 60 114 86 120 L 102 124 C 118 128 124 132 124 142 C 124 152 114 160 96 160 C 78 160 64 152 54 138 L 38 154 C 52 172 72 182 96 182 C 130 182 150 166 150 142 C 150 122 138 110 110 102 L 94 98 C 80 94 72 90 72 80 C 72 70 82 64 96 64 C 110 64 122 70 130 80 Z', nib: 'M 142 56 L 178 38 L 174 70 L 158 78 Z', sulco: 'M 152 64 L 170 50' };

/**
 * Ícone do app (12/10/2026): o monograma da casa em branco num quadrado arredondado com gradiente azul, no formato
 * dos ícones de app dos sistemas da Apple. Desenho próprio da casa; o mesmo está em public/favicon.svg.
 */
const IconeApp: React.FC<{ className?: string }> = ({ className }) => {
    const id = React.useId().replace(/:/g, '');
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" className={className} aria-label="Logo SP Contábil" role="img">
            <defs>
                <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#3a9bff" />
                    <stop offset="1" stopColor="#0058c4" />
                </linearGradient>
            </defs>
            <rect width="200" height="200" rx="46" fill={`url(#g${id})`} />
            <g transform="translate(24 24) scale(0.76)">
                <path fill="#ffffff" fillOpacity="0.92" d={CAMINHOS.P} />
                <path fill="#ffffff" d={CAMINHOS.S} />
                <path fill="#ffffff" d={CAMINHOS.nib} />
                <path stroke="#0a6fe0" strokeWidth="2" fill="none" strokeLinecap="round" d={CAMINHOS.sulco} />
                <circle cx="166" cy="56" r="2.4" fill="#0a6fe0" />
            </g>
        </svg>
    );
};

const Logo: React.FC<LogoProps> = ({
    className,
    iconOnly = false,
    label = 'SP CONTÁBIL',
    subLabel = 'CONSULTOR DP — FOLHA',
}) => {
    if (iconOnly) {
        return <IconeApp className={className || 'h-14 w-14'} />;
    }
    return (
        <div className={`inline-flex items-center gap-3 ${className ?? ''}`}>
            <IconeApp className="h-12 w-12 shrink-0" />
            <div className="leading-tight">
                <div className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
                    {label}
                </div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {subLabel}
                </div>
            </div>
        </div>
    );
};

export default Logo;
