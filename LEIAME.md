# Bolha — o jogo do index, gerado pela Forja (sem Godot)

**Regra:** nada fixo no jogo. Tudo o que o index tinha como número ou dado fixo vem da Forja; o que ainda for fixo vira
parâmetro da Forja (catálogo `forja/regras_index.py`, padrão = o número do index).

## Como jogar
- `jogar.bat` (na pasta New Forja): exporta tudo e abre http://127.0.0.1:8791/bolha/
- Na Forja: botão **▶ Bolha** no topo (exporta e abre; com um nível aberto, joga direto nele)
- `python -m forja.bolha` exporta tudo; `python -m forja.bolha <id>` só esses níveis
- URL: `?nivel=N` entra direto no nível N da campanha; `?forja=<id>&nivel=0` joga um nível exportado fora da campanha

## O que a Forja exporta
| Arquivo | O que é |
|---|---|
| `jogo.json` | tema, níveis-base do index, prólogo, **campanha** (ordem, criaturas, ajustes por nível), **parâmetros**, trilha, gatilhos de cutscene |
| `niveis/<id>/nivel.json` | **um nível = um arquivo**: elementos (receitas e .glb), receita do gerador (estilos, mistura, diretrizes), chão/parede/porta/coisas, cor, sons, falas |
| `niveis/<id>/modelos/*.glb`, `sons/*` | modelos do Blender/importados e sons do nível |
| `cutscenes/<id>/` | cutscenes de imagens |
| `forja/layouts.js, pisos.js, inspetor.js, criterios.*` | o gerador da Forja, copiado de `web/` a cada exportação (fonte única) |

Fonte dos dados que eram fixos no index: `New Forja/jogo/bolha/base.json` (extraído uma vez por
`scripts/extrair_base_index.mjs`) e `jogo/bolha/parametros.json` (mudanças do jogo inteiro).

## Como o mundo da Forja entra no index
- `forja/mundo.js`: cada bloco do jogo é um módulo do gerador da Forja (mesmo estilo + semente = o que a bancada mostra).
  Paredes com passagem entre módulos, luminárias por cômodo e no salão coberto, luz assada com oclusão, colisão,
  cômodos (nome no HUD vem das funções das Diretrizes), arestas para o caminho das criaturas.
- `forja/mundo_worker.js`: os blocos são montados num worker; o jogo só encaixa as malhas (andar não trava).
- `index.html` é a cópia do index transformada por `scripts/bolha_patch_index.py` (rode de novo sobre uma cópia fresca
  do index se o index mudar): consultas do mundo (`roomAt`, `edgeState`, `segBlocked`, `bakeAt`, `buildChunk`…)
  perguntam ao mundo da Forja nos níveis "forja"; níveis "jogo" usam o gerador do index com os dados da Forja.

## Ainda falta (próximas etapas)
1. **Personagens (Elenco)**: o andarilho, a equipe e as criaturas virem do Elenco da Forja (hoje: `Chracter/*.js` e as criaturas procedurais do index).
2. **Interface**: textos, fontes, tinta e teclas da aba Jogo → Interface aplicados no HUD do index (hoje gravados para a Godot).
3. ~~**Abertura**~~: feita (Jogo → Abertura: as duas capas, bolhas, cena parte por parte, cenário, fundo, vinheta).
4. **Sons**: a engine de som da Forja (camadas de música, gatilhos, efeitos) — o jogo não traz mais sons próprios.
5. **Cutscenes de imagens**: player no jogo (os arquivos já são exportados).
6. **Gameplay e regras do nível**: receita do Gameplay e as funções dos elementos (cadeira, telefone, alavanca, portão, água, saída).
7. **Prólogo** como nível da Forja (hoje segue o roteiro do index).
8. Trocar as constantes restantes do index por `PAR(...)` (lista na `AUDITORIA_INDEX.md`).
