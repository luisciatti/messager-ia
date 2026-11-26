# Como contribuir

## Branches

- `main`: o que está publicado. Ninguém faz commit direto.
- `feat/<nome>`: nova funcionalidade
- `fix/<nome>`: correção
- `chore/<nome>`, `ci/<nome>`, `docs/<nome>`: manutenção, CI e documentação

## Commits (Conventional Commits)

```
<tipo>(<escopo opcional>): <descrição no imperativo>
```

Tipos: `feat`, `fix`, `chore`, `test`, `ci`, `docs`, `refactor`, `perf`.
Exemplo: `feat(core): adiciona estimativa de tokens por chamada`

## Pull requests

1. Abra o PR da sua branch para a `main`.
2. O CI precisa passar: typecheck, testes e build.
3. Preencha o template, incluindo o **impacto em tokens**.
4. Merge via *squash* ou *merge commit*, mantendo o histórico legível.

## Releases

Tag `vX.Y.Z` na `main`. O artifact é publicado com o mesmo rótulo da tag.
