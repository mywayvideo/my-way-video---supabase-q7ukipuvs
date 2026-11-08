# Critérios de Revisão de Catálogo — My Way Video

**Versão:** 1.0
**Aprovado por:** Patrick Lynch (proprietário) em 08/11/2026
**Perfil:** `catalog_manager` (Gestor de Catálogo)

---

## 1. Escopo do perfil

| Ação                                                                                         | Permitido                                 |
| -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Editar campos de produto (nome, descrição, specs, imagem, preço, NCM, estoque, relacionados) | ✅ Sim                                    |
| Editar `price_usd`                                                                           | ✅ Sim — com a regra da seção 3           |
| Aplicar NCM após revisão de coerência                                                        | ✅ Sim                                    |
| Marcar "Marcar como revisado"                                                                | ✅ Sim, só após conferência real          |
| Marcar Descontinuado                                                                         | ✅ Sim, com confirmação da B&H/fabricante |
| **Cadastrar produto novo**                                                                   | ❌ Não — exige admin                      |
| **Excluir produto**                                                                          | ❌ Não                                    |
| **Criar/editar/excluir categoria**                                                           | ❌ Não                                    |
| **Alterar SKU de produto existente**                                                         | ❌ Não — sinalizar ao administrador       |

O SKU é gravável apenas na criação (que é ato de admin). Em produto existente, o campo está travado por regra de negócio.

---

## 2. A regra do `price_usd` — preço de venda da B&H

**Regra:** `price_usd` deve ser **sempre exatamente igual** ao preço de venda (selling price) que a B&H pratica para o mesmo produto.

### Verificação em três camadas

1. **Origem:** o valor vem da página do produto na B&H, campo _Price_ (o preço de venda ao público, não o "was" riscado nem o preço de associado).
2. **Conferência:** antes de gravar, comparar o valor extraído com o exibido na página. Se a extração automática divergir do que está visível, prevalece o visível.
3. **Registro:** toda alteração de `price_usd` deve informar de onde veio o valor e a data da consulta.

### Casos que exigem atenção

- **Rebate ativo:** o rebate **não altera** `price_usd`. Ele gera desconto separado ("Rebate Fabricante") via `price_usa_rebate` e `date_rebate`. O preço de venda continua sendo o da B&H.
- **Produto descontinuado na B&H:** se a B&H não exibe mais preço, **não preencher com estimativa**. Marcar para verificação com o proprietário.
- **Diferença entre loja e B&H:** se o proprietário definir estratégia comercial diferente, isso é decisão dele e deve ser registrada — não presumida.

---

## 3. Categoria — função principal, nunca acessório

A categoria descreve **o que o produto faz no set**.

| Produto                            | Categoria correta    | Erro comum |
| ---------------------------------- | -------------------- | ---------- |
| Camera Cage, Top Handle, Baseplate | Accessories          | Cameras    |
| PL/EF Mount, Shim Kit              | Accessories          | Cameras    |
| Media Module, SSD                  | Memory Cards & Media | Cameras    |
| Battery Plate, Charger             | Batteries & Chargers | Cameras    |
| Fiber Converter                    | Converters           | Cameras    |
| Monitor Kit                        | Monitors             | Cameras    |

**Regra de desempate:** se o nome cita uma câmera apenas para dizer _para qual equipamento serve_, é acessório. Se o produto **captura imagem**, é câmera.

Palavras de especificação entre parênteses **não** definem a categoria — "URSA Cine 17K (PL/LPL mount, 8TB storage)" é câmera, apesar de "storage" e "mount".

---

## 4. NCM — coerência com a categoria

NCM é **sempre indicativo**; a decisão é humana, com justificativa.

| Categoria            | Família NCM esperada      |
| -------------------- | ------------------------- |
| Cameras              | 8525.80, 8525.89, 9007.10 |
| Lenses               | 9002                      |
| Monitors             | 8528                      |
| Cables & Connectors  | 8544, 8536                |
| Tripods & Rigs       | 9620                      |
| Lighting             | 9405                      |
| Recorders            | 8521                      |
| Memory Cards & Media | 8523                      |

**NCM destoante da família = investigar antes de salvar.** Pode ser categoria errada ou NCM errado; nunca "ajustar" um para casar com o outro.

---

## 5. Imagem — nunca salvar sem

A importação da B&H traz **apenas o link** da imagem, e a B&H bloqueia hotlink. Portanto:

1. Baixar a imagem da página do produto.
2. Anexar via upload (JPEG ou PNG, até 10MB) para o bucket `product-images`.
3. Conferir o preview antes de salvar.

**Produto sem imagem não deve ser salvo.** Se a imagem não carregar, trocar a fonte — não salvar incompleto.

---

## 6. Badge de revisão

- 🟢 **Revisado após a última alteração** — em dia.
- 🔵 **Alterado, pendente de conferência** — alguém mexeu e ninguém conferiu.

Marcar "Marcar como revisado" **somente após conferência real** do produto inteiro: imagem, categoria, NCM, preço. O carimbo não altera o produto, apenas registra a data.

---

## 7. Regra de ouro

Um cadastro correto tem, simultaneamente:

- ✅ imagem anexada
- ✅ categoria coerente com a função
- ✅ NCM coerente com a categoria
- ✅ `price_usd` igual ao preço de venda da B&H
- ✅ badge 🟢 de revisado

**Em dúvida, salve parcial e sinalize.** Nunca "chute" categoria, NCM ou preço para encerrar a tarefa.

---

## Histórico de versões

| Versão | Data       | Mudança                                 |
| ------ | ---------- | --------------------------------------- |
| 1.0    | 08/11/2026 | Criação, com o perfil `catalog_manager` |
