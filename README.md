# Messager de IA

Um "WhatsApp de IA": cada contato é um agente especializado (AWS, OCI, DevOps…)
e os grupos fazem os agentes colaborarem até chegar numa conclusão.

Roda como **artifact no Claude**, usando a assinatura (sem chave de API).

## Princípios

- **Tokens em primeiro lugar**: toda funcionalidade é avaliada pelo custo em tokens.
- **Adapters isolados**: só `src/adapters/claude.ts` fala com o Claude; só
  `src/adapters/storage.ts` fala com o banco.
- **Agentes versionados**: personas ficam em `agents/` como arquivos no git.

## Estrutura

```
agents/          personas dos agentes (versionadas)
groups/          configuração dos grupos
src/ui/          telas
src/core/        orquestrador, contexto, estilo, tokens
src/adapters/    Claude (artifact/mock) e storage
tests/           testes (Vitest)
```

## Rodando local

```bash
npm install
npm run dev        # usa o Claude em modo mock, sem gastar tokens
npm test
npm run build      # gera dist/ para publicar no artifact
```

## Tokens

Toda chamada ao Claude passa por `src/core/metered.ts`:

- **Estimativa**: ~3,5 caracteres por token (o artifact não devolve a contagem real).
- **Log de uso**: agente, grupo, motivo (resposta, moderação, síntese, resumo), tier e duração.
- **Orçamento por mensagem**: 1:1 até 2 chamadas e ~6 mil tokens; grupo até 5 chamadas
  e ~8 mil tokens. Se passar, a chamada nem é feita.

Regras de economia adotadas (baseadas em pesquisa, ver PRs):

1. 1:1 por padrão; grupo só quando a pergunta pede várias especialidades.
2. Moderador no tier `quick` escolhe quem fala.
3. Agentes recebem resumo das falas dos colegas, não o texto inteiro.
4. Agente pode responder "PASSO" se não tiver nada novo.
5. Estilo caveman entre agentes; síntese para o usuário em linguagem normal.
6. Skills carregadas só quando usadas; histórico compactado após N mensagens.

Veja o [CONTRIBUTING.md](CONTRIBUTING.md) para branches, commits e PRs.
