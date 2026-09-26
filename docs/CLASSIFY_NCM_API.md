# Endpoint de Classificação Fiscal NCM por IA — `classify-ncm`

O endpoint `classify-ncm` é o serviço central de classificação aduaneira e tarifária automatizada do ecossistema My Way Video / My Way Business. Ele combina recuperação híbrida em banco de dados vetorial PostgreSQL (pgvector + trigramas), busca web condicional em fontes técnicas/datasheets de fabricantes, inferência com Modelos de Linguagem de Grande Porte (LLMs configurados com fallback dinâmico) e resolução estrita de alíquotas efetivas a partir da vista oficial `public.imp_sim_tax_rates_effective`.

---

## 1. Visão Geral da Arquitetura (Fluxo de 7 Fases)

```
[Cliente / App Admin Externo]
              │
              ▼  (POST + Bearer JWT)
    ┌──────────────────────┐
    │ 1. Validação & Auth  │ ➔ Requer Supabase Auth JWT válido
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ 2. Busca Híbrida     │ ➔ search_ncm_candidates (PostgreSQL pgvector + Trigrams)
    │    (Cap. 84,85,90,94)│    Sem restrição prévia de capítulos
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ 3. Gatilho Web       │ ➔ Se specs insuficientes: dispara busca técnica
    │    Condicional       │    (DuckDuckGo Lite / Firecrawl) e extrai specs/datasheets
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ 4. Decisão LLM       │ ➔ Provedores de public.ai_providers (GPT-4o-mini, DeepSeek, Claude)
    │    (Regras NESH/TEC) │    RGI 1, RGI 3b, desempate 84/85/90, menor carga tributária
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ 5. Resolução Efetiva │ ➔ public.imp_sim_tax_rates_effective
    │    de Alíquotas      │    Garante alíquotas oficiais e vigência de Ex-Tarifário
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ 6. Log de Auditoria  │ ➔ public.imp_sim_ncm_classification_log
    │    (RLS garantida)   │    Grava inputs, justificativa, fontes web e tempos
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ 7. Resposta JSON     │ ➔ Recomendação principal, alternativas, alíquotas e audit_id
    └──────────────────────┘
```

---

## 2. Contrato HTTP

- **URL:** `https://<PROJECT-REF>.supabase.co/functions/v1/classify-ncm`
- **Método HTTP:** `POST`
- **Cabeçalhos Requeridos:**
  - `Content-Type: application/json`
  - `Authorization: Bearer <SUPABASE_USER_JWT>` _(JWT de usuário autenticado gerado pelo Supabase Auth)_
  - `apikey: <SUPABASE_ANON_KEY>` _(Chave pública anônima do Supabase)_

---

## 3. Payload de Entrada (Request Body)

```json
{
  "product_description": "Câmera de estúdio profissional 4K PTZ com sensor CMOS de 1 polegada e saída SDI/HDMI",
  "brand": "Sony",
  "model": "BRC-X1000",
  "additional_specs": "Zoom óptico 12x, PoE+, transmissão IP, resolução 3840x2160 a 29.97p",
  "top_n": 15,
  "save_log": true,
  "product_id": "000697ab-d7a6-46aa-8bbf-eebf3d749d70",
  "imp_sim_product_id": null
}
```

### Campos:

| Campo                 | Tipo      | Obrigatório | Descrição                                                                    |
| :-------------------- | :-------- | :---------- | :--------------------------------------------------------------------------- |
| `product_description` | `string`  | **Sim**     | Descrição comercial ou técnica do produto (mínimo 3 caracteres).             |
| `brand`               | `string`  | Não         | Marca ou fabricante (ex.: Sony, Blackmagic, Panasonic).                      |
| `model`               | `string`  | Não         | Modelo ou Part Number do equipamento.                                        |
| `additional_specs`    | `string`  | Não         | Especificações adicionais, portas de entrada/saída, resolução ou finalidade. |
| `top_n`               | `integer` | Não         | Quantidade de candidatos a recuperar do banco (padrão: 15, mín: 5, máx: 30). |
| `save_log`            | `boolean` | Não         | Gravação automática do log de auditoria no banco (padrão: `true`).           |
| `product_id`          | `uuid`    | Não         | UUID na tabela `public.products` caso o produto já exista no catálogo.       |
| `imp_sim_product_id`  | `uuid`    | Não         | UUID na tabela `public.imp_sim_products` do módulo de importação.            |

---

## 4. Payload de Saída (Response Body - 200 OK)

```json
{
  "success": true,
  "audit_id": "18f6c382-b7ca-41da-87bc-bf9b148fa732",
  "recommendation": {
    "ncm": "85258913",
    "ex": "001",
    "description": "Com sensor de imagem a semicondutor tipo CMOS, de mais de 490 x 580 elementos de imagem (pixels) ativos, sensíveis a intensidades de iluminação inferiores a 0,20 lux",
    "ii": 0.0,
    "ipi": 13.0,
    "pis": 2.1,
    "cofins": 9.65,
    "total_tax": 24.75,
    "has_ex_tarifario": true,
    "justification": "Classificação fundamentada na RGI 1 e RGI 6. Trata-se de câmera de televisão/vídeo com sensor CMOS de alta sensibilidade, enquadrando-se com precisão na subposição 8525.89.13. Beneficia-se do Ex-Tarifário 001 com redução da alíquota do Imposto de Importação (II) para 0%, gerando a menor carga tributária defensável.",
    "legal_basis": {
      "regime": "BK",
      "resolucao": "Gecex 322/2022"
    },
    "ex_details": {
      "descricao": "Câmeras de rede (ip) para circuito fechado de tv, sensor “cmos” com resolução de imagem de 2mp...",
      "resolucao": "Resolução GECEX nº 322/2022",
      "data_fim": "2026-12-31"
    }
  },
  "alternatives": [
    {
      "ncm": "85258919",
      "ex": "",
      "description": "Outras câmeras de televisão",
      "ii": 14.4,
      "ipi": 13.0,
      "pis": 2.1,
      "cofins": 9.65,
      "total_tax": 39.15,
      "has_ex_tarifario": false,
      "reason": "Posição residual aplicável caso a autoridade fiscal desconsidere o enquadramento no Ex-Tarifário 001."
    }
  ],
  "confidence": "alta",
  "sufficient_info": true,
  "web_sources": [
    {
      "title": "Sony BRC-X1000 Specifications & Datasheet",
      "url": "https://pro.sony/en_US/products/ptz-network-cameras/brc-x1000",
      "snippet": "1.0-type Exmor R CMOS sensor 4K PTZ camera with 12x optical zoom..."
    }
  ],
  "model_used": "openai (gpt-4o-mini)",
  "candidates_count": 15,
  "execution_time_ms": 1450,
  "timestamp": "2026-09-26T22:30:00.000Z"
}
```

---

## 5. Códigos de Status HTTP

| Código               | Descrição                   | Causa                                                                    |
| :------------------- | :-------------------------- | :----------------------------------------------------------------------- |
| `200 OK`             | Sucesso                     | Classificação realizada, alíquotas efetivas resolvidas e log gerado.     |
| `400 Bad Request`    | Requisição inválida         | `product_description` ausente/muito curta ou JSON malformado.            |
| `401 Unauthorized`   | Não autorizado              | Cabeçalho `Authorization: Bearer <token>` ausente, inválido ou expirado. |
| `404 Not Found`      | Não localizado              | Nenhum candidato NCM localizado na base para a descrição.                |
| `502 Bad Gateway`    | Provedor de IA indisponível | Falha em todos os provedores LLM ativos da tabela `public.ai_providers`. |
| `500 Internal Error` | Erro interno                | Exceção não tratada na execução da edge function.                        |

---

## 6. Exemplo de Consumo via `cURL` (Sistema Administrativo Externo)

```bash
curl -X POST https://ymlkyspcznrrmlktudxx.supabase.co/functions/v1/classify-ncm \
  -H "Content-Type: application/json" \
  -H "apikey: SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer SEU_JWT_DE_USUARIO_AQUI" \
  -d '{
    "product_description": "Blackmagic Design ATEM Mini Pro HDMI Live Stream Switcher",
    "brand": "Blackmagic Design",
    "model": "SWATEMMINIBPR",
    "additional_specs": "4 inputs HDMI, hardware streaming encoder via Ethernet, multiview output",
    "top_n": 15,
    "save_log": true
  }'
```

---

## 7. Porta A: Consulta Direta sem IA (RPC `search_ncm_candidates`)

Para sistemas externos ou rotinas de autocomplete que não necessitam de parecer de IA e desejam apenas consultar candidatos fiscais ordenados por similaridade com suas respectivas alíquotas:

- **Endpoint PostgREST:** `POST https://<PROJECT-REF>.supabase.co/rest/v1/rpc/search_ncm_candidates`
- **Headers:** `apikey`, `Authorization: Bearer <TOKEN>`
- **Body:**

```json
{
  "query": "switch de vídeo transmissão ao vivo",
  "top_n": 10,
  "match_threshold": 0.05
}
```

_A RPC executa busca híbrida instantânea (vetores + trigramas) sobre toda a tabela de 21.256 itens, abrangendo os Capítulos 84, 85, 90 e 94._
