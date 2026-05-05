# Patch — Firestore Rules para Ponto Eletronico

Adicionar as 2 colecoes novas (`ponto_modelos` e `ponto_layouts`) ao seu
`firestore.rules`. Mesmo padrao das colecoes de folha que ja existem.

## Diff sugerido

Localize o bloco de regras de `folha_layouts` no seu `firestore.rules` atual.
Adicione logo abaixo:

```
// ===== Ponto Eletronico =====

// Catalogo de modelos de ponto (ACJEF padrao, DIMEP, Henry, Ahgora, etc).
// Leitura aberta a usuarios autenticados; escrita restrita a admins.
match /ponto_modelos/{modeloId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null
                && request.auth.token.role in ['admin', 'owner'];
}

// Layout de ponto por empresa (CNPJ + cadastro SAGE).
// Mesma regra que folha_layouts: usuarios autenticados leem e escrevem.
match /ponto_layouts/{layoutId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null;
}
```

## Como subir

No terminal, na raiz do projeto:

```bash
firebase deploy --only firestore:rules --project consultor-dp-folha
```

## Validacao

Apos o deploy, no Firebase Console:

1. Abrir Firestore -> Rules -> Compilation OK
2. Tentar criar um doc em `ponto_modelos/teste` pelo console do Firebase com sua
   conta de admin -> deve permitir
3. Tentar fazer o mesmo logado como usuario comum -> deve negar (so admin escreve em modelos)

Se nao tem o sistema de roles (`request.auth.token.role`) configurado, troque
`allow write: if ... role in ['admin', 'owner']` por simplesmente
`allow write: if request.auth != null` ate ter o sistema de roles. Mas e bom
deixar restrito porque modelo errado quebra todas as importacoes do cliente.
