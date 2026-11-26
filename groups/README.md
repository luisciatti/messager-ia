# Grupos

Um `.json` por grupo:

```json
{ "id": "cloud", "nome": "Cloud", "membros": ["aws", "oci", "devops"], "maxFalantes": 3 }
```

Fluxo de uma mensagem (ver `src/core/group.ts`):

1. `@menção` escolhe quem fala e **pula o moderador** (1 chamada a menos).
2. Sem menção, o moderador (tier `quick`) escolhe o mínimo de agentes.
3. Os escolhidos respondem em paralelo, sem ver o texto uns dos outros
   (debate esparso). Quem não tem nada novo responde `PASSO`.
4. Só 1 agente? Ele responde em linguagem normal e **não há síntese**.
   2 ou mais: o sintetizador une as falas.
5. As falas individuais ficam visíveis, mas fora do contexto das próximas
   mensagens: a síntese já as representa.
