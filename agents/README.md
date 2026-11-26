# Agentes

Um arquivo `.md` por agente: frontmatter + instruções.

```markdown
---
id: aws                 # único
nome: AWS
papel: especialista     # especialista | moderador | sintese
tier: default           # quick | default | complex
estilo: caveman         # caveman | normal | json
skills: [custos, iam]   # só o índice vai no prompt
---
<!-- comentários são removidos no build (custo zero) -->
Escopo, checklist, o que NÃO faz, regra contra invenção.
```

Regras (baseadas em pesquisa, ver PR #3):

- **Sem persona decorativa** ("você é um especialista sênior..."): não melhora a
  precisão e custa tokens em toda chamada. Prefira escopo + checklist.
- **Teto de tokens** por papel: o teste `tests/agents.test.ts` reprova o PR se o
  system prompt passar do limite.
- **Contra invenção**: todo especialista pede o dado que falta em vez de chutar.
