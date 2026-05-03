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

const Logo: React.FC<LogoProps> = ({
    className,
    iconOnly = false,
    label = 'SP CONTÁBIL',
    subLabel = 'CONSULTOR DP — FOLHA',
}) => {
    if (iconOnly) {
        return <Monogram className={className || 'h-14 w-14'} />;
    }
    return (
        <div className={`inline-flex items-center gap-3 ${className ?? ''}`}>
            <Monogram className="h-12 w-12 shrink-0" />
            <div className="leading-tight">
                <div className="text-base font-extrabold tracking-wide text-slate-800 dark:text-white">
                    {label}
                </div>
                <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-blue-700 dark:text-blue-400">
                    {subLabel}
                </div>
            </div>
        </div>
    );
};

export default Logo;
