# Critérios de Revisão — My Way Video

> **Documento normativo.** Toda revisão feita pela revisora (perfil `reviewer`) segue
> estas regras. Alterações neste arquivo exigem aprovação do proprietário e passam
> pelo histórico do git.
>
> Versão: **1.0** · Aprovado em: **07/11/2026** · Responsável: Patrick Edward Lynch

## 1. Escopo aprovado do perfil revisor

| Ação                                            | Permitido           |
| ----------------------------------------------- | ------------------- |
| Ler catálogo, categorias, produtos, pedidos     | ✅                  |
| Confirmar / trocar a categoria de um produto    | ✅                  |
| Migração em massa de categoria                  | ✅                  |
| Exportar listas e relatórios                    | ✅                  |
| Criar, renomear, desativar ou excluir categoria | ❌                  |
| Alterar NCM                                     | ❌ (apenas indicar) |
| Alterar preço, nome, descrição, estoque         | ❌                  |
| Alterar o próprio perfil (role)                 | ❌                  |

O bloqueio é executado no banco de dados (RLS + gatilho de colunas). A lista de
colunas que a revisora pode gravar em `products` é exatamente:
`category_id`, `category`, `updated_at`, `last_reviewed_at`.

## 2. Regra de ouro da classificação

**Categoria certa = função principal correta + NCM típico da família.**

Quando os dois apontam para o mesmo lugar, confirmar. Quando divergem, adiar.

## 3. Hierarquia de decisão (nesta ordem)

1. **A função manda.** Pergunta central: _o que este equipamento faz no set?_
   Marca, formato, tamanho e preço não definem categoria.
2. **Corpo antes de acessório.** Se o produto é o corpo de uma câmera, é `Cameras`,
   mesmo que o nome cite montagem, suporte, armazenamento ou conexão.
3. **Texto entre parênteses é especificação, não função.** `(PL/LPL mount, 8TB
storage interno)` descreve o corpo; não o transforma em acessório nem em storage.
4. **NCM valida, não decide sozinho.** O NCM é o melhor detector de erro, mas um
   NCM errado no cadastro não reclassifica o produto — gera uma _indicação_ de NCM.
5. **O rótulo legado é pista, não prova.** Rótulos genéricos ("Accessories",
   "Others") nunca são aceitos por si só.

## 4. Evidência exigida para acusar erro

Só reportar um produto como _categoria errada_ com **evidência dupla**:

- o nome/função aponta para outra categoria, **E**
- o NCM atual não pertence a nenhuma família aceita da categoria em que está.

Se o NCM confirma a categoria gravada, é divergência de opinião — não é erro.
Nesse caso, **não reportar**.

## 5. Armadilhas conhecidas

| Armadilha                           | Como evitar                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| "Camera Cage", "Camera Accessories" | Palavra `camera` no nome não faz do item uma câmera. Verificar função e NCM.                  |
| Kit com lente vs. corpo da câmera   | Corpo vendido em kit continua `Cameras`; a lente avulsa é `Lenses`.                           |
| `mount` na especificação            | `PL mount`, `EF mount` = encaixe do corpo. Só é acessório quando o produto **é** o adaptador. |
| `storage` interno                   | Armazenamento embutido na câmera ≠ `Networking & Storage`.                                    |
| "Monitor/Recorder"                  | Híbrido vai para `Recorders`, não `Monitors`.                                                 |
| `Keyer` / `Ultimatte`               | Vai para `Production Switchers`, não `Accessories`.                                           |
| Lente em `Accessories`              | NCM 9002 + distância focal no nome = `Lenses`.                                                |

## 6. NCM — sempre indicativo

- A revisora **nunca** altera NCM. Ela registra: NCM atual, NCM proposto e justificativa.
- A correção é aplicada por um administrador no cadastro do produto.
- Divergências com a tabela `ncm_support` são **sinalizadas** para decisão humana,
  nunca resolvidas por conta própria.

## 7. Categorias — nunca criar

Se um produto não se encaixa em nenhuma categoria existente, a revisora:

1. deixa o produto na fila de triagem (não força categoria para "limpar" a fila);
2. documenta a proposta com: nome sugerido, função principal, NCMs típicos,
   volume de produtos afetados, e por que nenhuma categoria atual serve;
3. entrega ao administrador, que decide e executa.

## 8. Em dúvida, adiar

Adiar é sempre melhor que confirmar errado: reclassificar depois custa mais caro.
"Revisar depois" não grava nada — o produto volta na próxima sessão.

## 9. Trilha de auditoria

Toda gravação de categoria é registrada em `public.category_audit_log`:
quem, quando, de qual categoria para qual, e o motivo informado.
O histórico é append-only — ninguém o altera nem o apaga.

## 10. Limites de escopo

Este documento cobre **classificação de categorias e indicação de NCM**.
Novas frentes de revisão (descrições, títulos, imagens, preços) exigem:

1. seção própria neste documento, aprovada pelo proprietário;
2. migration específica concedendo a permissão mínima necessária;
3. registro de auditoria para a nova área.

Nenhuma permissão nova é presumida por analogia.
