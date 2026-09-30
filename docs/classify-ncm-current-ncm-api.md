# Roteiro de Integração da API `classify-ncm`: Parecer do NCM Atual (`current_ncm_assessment`)

Este documento destina-se às equipes externas e internas que consomem a Edge Function `classify-ncm` do ecossistema My Way Video / My Way Business.

A partir da versão **`3.8.0-build.653`**, o serviço passa a contar com a funcionalidade **Parecer do NCM Atual**, permitindo confrontar o código NCM já registrado no cadastro do produto com o enquadramento recomendado pelo agente aduaneiro.

---

## 1. Princípios de Retrocompatibilidade e Contrato

1. **Campo Opcional**: O envio dos parâmetros `current_ncm` e `current_ex` é estritamente **opcional**.
2. **Retrocompatibilidade Garantida (Zero Breaking Change)**:
   - Se o caller **não** informar `current_ncm` (ou enviar string vazia/nula), a função mantém exatamente o comportamento anterior.
   - O campo `current_ncm_assessment` **NÃO constará no JSON de resposta** para chamadas sem `current_ncm`.
3. **Resiliência a Falhas de Entrada**:
   - Códigos NCM com ou sem máscara (`"8525.89.29"` ou `"85258929"`), espaços ou caracteres malformados são normalizados internamente (dígitos numéricos).
   - Um NCM malformado, inexistente ou ausente da tabela de alíquotas **NÃO derruba nem falha a execução** da função. A classificação do produto continua normalmente e o parecer registrará a ressalva cabível (`verdict: "REVISAR"`).
4. **Sem Custo de Latência Extra nos Casos Determinísticos**:
   - Se o NCM atual for idêntico ao recomendado (`MANTER`), estiver nas alternativas (`CONFERIR`) ou for código extinto/ausente (`REVISAR`), o parecer é emitido de forma determinística em frações de milissegundo, **sem chamada adicional a LLMs**.
   - Em caso de divergência técnica real, o parecer é embutido na 2ª passada existente (auditor aduaneiro), mantendo a mesma janela de execução.

---

## 2. Contrato da API

### Endpoint

- **URL**: `https://<PROJECT-REF>.supabase.co/functions/v1/classify-ncm`
- **Método**: `POST`
- **Health Check**: `GET https://<PROJECT-REF>.supabase.co/functions/v1/classify-ncm?health=true`

### Novos Campos Opcionais no Request Body

| Campo         | Tipo     | Obrigatório | Formato Esperado               | Descrição                                                                               |
| :------------ | :------- | :---------- | :----------------------------- | :-------------------------------------------------------------------------------------- |
| `current_ncm` | `string` | **Não**     | `"85258929"` ou `"8525.89.29"` | NCM atualmente cadastrado no sistema/ERP de origem. A função normaliza automaticamente. |
| `current_ex`  | `string` | **Não**     | `"001"` ou `""`                | Exceção tarifária (Ex-Tarifário) atualmente registrada, se houver.                      |

---

## 3. Estrutura do Novo Campo `current_ncm_assessment` (Response)

Quando `current_ncm` for informado, o objeto `current_ncm_assessment` estará presente na raiz da resposta:

```typescript
interface CurrentNcmAssessment {
  current_ncm: string // 8 dígitos normalizados (ex: "85258929")
  current_ex?: string // Ex informado (se houver)
  verdict: 'MANTER' | 'CONFERIR' | 'REVISAR'
  matches_recommendation: boolean // true se current_ncm == recommended_ncm
  is_in_alternatives: boolean // true se current_ncm figura nas alternativas válidas
  current_tax?: {
    // Carga tributária do NCM atual na base oficial
    ii: number | null
    ipi: number | null
    pis: number | null
    cofins: number | null
    total_tax: number | null
    has_ex_tarifario: boolean
    description: string | null
  } | null
  recommended_tax?: {
    // Carga tributária do NCM recomendado
    ii: number | null
    ipi: number | null
    pis: number | null
    cofins: number | null
    total_tax: number | null
    has_ex_tarifario: boolean
    description: string | null
  } | null
  tax_diff?: {
    // Diferença de carga tributária
    ii_diff: number | null
    ipi_diff: number | null
    total_tax_diff: number | null
    cheaper: 'current' | 'recommended' | 'equal' | 'incomparable'
  } | null
  applicable_rgi: string | null // Regra Geral de Interpretação (ex: "RGI 1", "RGI 3a")
  justification: string // Parecer conclusivo fundamentado
  reasons?: string[] // Resumo dos motivos da decisão
}
```

---

## 4. Veredictos em Camadas

| Veredicto      | Condição                                                                                  | Significado Aduaneiro                                                                                         | Ação Recomendada na UI                                                                   |
| :------------- | :---------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------- |
| **`MANTER`**   | `current_ncm == recommended_ncm`                                                          | O código atual já coincide com a melhor recomendação técnica homologada pela RGI 1.                           | Exibir badge verde; manter o código atual.                                               |
| **`CONFERIR`** | `current_ncm` está entre as alternativas                                                  | O código atual é juridicamente aceitável, mas há outra posição mais específica ou com menor carga tributária. | Exibir badge âmbar; destacar a linha do NCM atual na tabela comparativa de alternativas. |
| **`REVISAR`**  | Código extinto, código ausente da base ou divergência técnica com recomendação do auditor | O código atual é inadequado, revogado ou legalmente incorreto para a mercadoria.                              | Exibir badge vermelho; sugerir substituição imediata pelo NCM recomendado.               |

---

## 5. Exemplos Completos de Request e Response

### Exemplo (A): Sem `current_ncm` (Comportamento Clássico / Retrocompatível)

#### Request:

```json
{
  "product_description": "Câmera de vídeo profissional Sony HDC-3200R 4K 2/3 polegadas 3-CMOS",
  "brand": "Sony",
  "model": "HDC-3200R",
  "top_n": 15,
  "save_log": true
}
```

#### Response (200 OK):

```json
{
  "success": true,
  "audit_id": "c1f7a012-6eb8-498c-8c54-469a19d2ec92",
  "version": "3.8.0-build.653",
  "recommendation": {
    "ncm": "85258921",
    "ex": "",
    "description": "De estúdio, com três ou mais sensores de imagem",
    "ii": 0,
    "ipi": 13,
    "pis": 2.1,
    "cofins": 9.65,
    "total_tax": 24.75,
    "has_ex_tarifario": false,
    "justification": "Classificação na subposição 8525.89.21 por se tratar de câmera de vídeo para estúdio com três sensores CMOS (RGI 1 e 6)."
  },
  "alternatives": [
    {
      "ncm": "85258929",
      "ex": "",
      "description": "Outras câmeras de televisão",
      "ii": 14.4,
      "ipi": 13,
      "pis": 2.1,
      "cofins": 9.65,
      "total_tax": 39.15,
      "has_ex_tarifario": false,
      "reason": "Posição residual caso não enquadrado como câmera de estúdio de 3 sensores."
    }
  ],
  "confidence": "alta",
  "sufficient_info": true
}
```

_(Repare que `current_ncm_assessment` não aparece)_

---

### Exemplo (B): Com `current_ncm` igual ao recomendado (`MANTER`)

#### Request:

```json
{
  "product_description": "Câmera de vídeo profissional Sony HDC-3200R 4K 2/3 polegadas 3-CMOS",
  "brand": "Sony",
  "model": "HDC-3200R",
  "current_ncm": "8525.89.21",
  "save_log": true
}
```

#### Fragmento da Response:

```json
{
  "success": true,
  "recommendation": {
    "ncm": "85258921",
    "ex": "",
    "total_tax": 24.75
  },
  "current_ncm_assessment": {
    "current_ncm": "85258921",
    "verdict": "MANTER",
    "matches_recommendation": true,
    "is_in_alternatives": false,
    "applicable_rgi": "RGI 1",
    "justification": "O NCM atual (85258921) coincide exatamente com a classificação aduaneira recomendada pelo agente. O enquadramento atende plenamente à RGI 1 e à função essencial comprovada do produto. Recomenda-se MANTER o código cadastrado.",
    "reasons": [
      "Classificação coincide com a recomendação técnica homologada.",
      "Enquadramento respaldado na RGI 1 pela descrição essencial da mercadoria."
    ],
    "current_tax": {
      "ii": 0,
      "ipi": 13,
      "pis": 2.1,
      "cofins": 9.65,
      "total_tax": 24.75,
      "has_ex_tarifario": false,
      "description": "De estúdio, com três ou mais sensores de imagem"
    },
    "tax_diff": {
      "ii_diff": 0,
      "ipi_diff": 0,
      "total_tax_diff": 0,
      "cheaper": "equal"
    }
  }
}
```

---

### Exemplo (C): Com `current_ncm` nas alternativas (`CONFERIR`)

#### Request:

```json
{
  "product_description": "Câmera de vídeo profissional Sony HDC-3200R 4K 2/3 polegadas 3-CMOS",
  "brand": "Sony",
  "model": "HDC-3200R",
  "current_ncm": "8525.89.29",
  "save_log": true
}
```

#### Fragmento da Response:

```json
{
  "success": true,
  "recommendation": {
    "ncm": "85258921",
    "total_tax": 24.75
  },
  "current_ncm_assessment": {
    "current_ncm": "85258929",
    "verdict": "CONFERIR",
    "matches_recommendation": false,
    "is_in_alternatives": true,
    "applicable_rgi": "RGI 1 / RGI 3a",
    "justification": "O NCM atual (85258929) é tecnicamente plausível e consta na lista de alternativas homologadas pelo sistema, porém o NCM 85258921 foi considerado prioritário por maior especificidade descritiva em relação às especificações do produto (RGI 3a). Carga tributária: a classificação recomendada (85258921) possui alíquota total menor (24.75%) em relação ao NCM atual (39.15%, diferença de 14.4% a favor da recomendação). Recomenda-se CONFERIR o enquadramento aduaneiro antes de alterar.",
    "current_tax": {
      "ii": 14.4,
      "ipi": 13,
      "total_tax": 39.15
    },
    "recommended_tax": {
      "ii": 0,
      "ipi": 13,
      "total_tax": 24.75
    },
    "tax_diff": {
      "ii_diff": 14.4,
      "ipi_diff": 0,
      "total_tax_diff": 14.4,
      "cheaper": "recommended"
    }
  }
}
```

---

### Exemplo (D): Com `current_ncm` extinto (`8525.80.90` → `REVISAR`)

#### Request:

```json
{
  "product_description": "Câmera PTZ Sony BRC-X1000 4K",
  "brand": "Sony",
  "model": "BRC-X1000",
  "current_ncm": "8525.80.90",
  "save_log": true
}
```

#### Fragmento da Response:

```json
{
  "success": true,
  "recommendation": {
    "ncm": "85258913",
    "total_tax": 24.75
  },
  "current_ncm_assessment": {
    "current_ncm": "85258090",
    "verdict": "REVISAR",
    "matches_recommendation": false,
    "is_in_alternatives": false,
    "applicable_rgi": "RGI 1 (Resolução GECEX de desdobramento)",
    "justification": "O código NCM 8525.80.90 foi extinto e desdobrado pela Resolução GECEX em subposições específicas da posição 8525.89 (como 8525.89.21, 8525.89.29 etc.). O uso do código 8525.80.90 é PROIBIDO na importação e emissão de NF-e, sujeitando a autuações aduaneiras e bloqueios de desembaraço. Recomenda-se REVISAR imediatamente e atualizar o cadastro para a classificação recomendada (85258913), que corresponde ao enquadramento vigente e regular perante a Receita Federal.",
    "reasons": [
      "Código NCM revogado e extinto na tabela oficial da NCM/SH.",
      "Substituição mandatória pelo código recomendado vigente 85258913."
    ]
  }
}
```

---

### Exemplo (E): Com Divergência Real de Posição (`REVISAR` pelo Auditor)

#### Request:

```json
{
  "product_description": "Blackmagic ATEM Mini Pro Switcher de Produção ao Vivo",
  "brand": "Blackmagic Design",
  "model": "ATEM Mini Pro",
  "current_ncm": "8471.80.00",
  "save_log": true
}
```

#### Fragmento da Response:

```json
{
  "success": true,
  "recommendation": {
    "ncm": "85437099",
    "total_tax": 28.95
  },
  "current_ncm_assessment": {
    "current_ncm": "84718000",
    "verdict": "REVISAR",
    "matches_recommendation": false,
    "is_in_alternatives": false,
    "applicable_rgi": "RGI 1 e RGI 3a (especificidade da posição sobre residual/genérica)",
    "justification": "O NCM atual (84718000) diverge da classificação aduaneira recomendada (85437099) e não atende aos critérios para constar como alternativa válida. A mercadoria tem como função essencial switcher/comutador e processador de vídeo para streaming ao vivo, cujo enquadramento correto dá-se na NCM 85437099 por aplicação da RGI 1 e RGI 3a. Recomenda-se REVISAR o cadastro.",
    "reasons": [
      "Divergência de enquadramento aduaneiro (RGI 1 e RGI 3a (especificidade da posição sobre residual/genérica)).",
      "Classificação recomendada com maior aderência técnica: 85437099."
    ]
  }
}
```

---

## 6. Verificação de Saúde e Versão (Health Check)

Para verificar se o ambiente em execução já conta com a versão atualizada da função:

```bash
curl -X GET "https://<PROJECT-REF>.supabase.co/functions/v1/classify-ncm?health=true"
```

Resposta esperada:

```json
{
  "status": "healthy",
  "version": "3.8.0-build.653",
  "knowledge_base_version": "4.0",
  "features": [
    "current_ncm_assessment",
    "ncm_support_layer",
    "knowledge_catalog_fallback",
    "real_error_propagation",
    "parts_indirect_linking",
    "ex_checklist_evaluation",
    "strict_effective_rates",
    "conditional_85437099_injection"
  ]
}
```

---

## 7. Checklist para Implementação em Outros Sistemas

1. **Leitura do Cadastro**: Se o seu sistema de catálogo ou ERP possui um campo de NCM para o item sendo classificado, envie-o em `current_ncm` (e `current_ex` se houver).
2. **Tratamento da Resposta**:
   - Verifique `if (response.current_ncm_assessment)` antes de ler o parecer.
   - Pinte o badge correspondente:
     - `MANTER`: Verde
     - `CONFERIR`: Âmbar / Amarelo
     - `REVISAR`: Vermelho
   - Destaque na interface a mensagem de `justification`.
   - Se `is_in_alternatives === true`, destaque a linha equivalente na tabela de alternativas.
3. **Auditoria**: O parecer gerado também é automaticamente persistido no log de classificação aduaneira (`public.imp_sim_ncm_classification_log.agent_suggestion.current_ncm_assessment`), permitindo trilha de auditoria completa sobre por que um NCM foi mantido ou alterado.
